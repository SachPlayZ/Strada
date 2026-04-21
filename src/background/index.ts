import { extract } from '../content/extractor'
import { buildGraph } from '../lib/graph/graph'
import { ExtractedCopySchema, AnalysisReportSchema } from '../lib/schemas'
import type { BgMessage, BgResponse, AnalysisReport, ExtractedCopy } from '../lib/types'

const RESTRICTED = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^https:\/\/chrome\.google\.com\/webstore/,
  /^file:\/\//,
]

const CACHE_TTL_MS = 10 * 60 * 1000

async function sha256(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

interface CacheEntry {
  report: AnalysisReport
  extracted: ExtractedCopy
  timestamp: number
}

async function getCached(
  key: string,
): Promise<{ report: AnalysisReport; extracted: ExtractedCopy } | null> {
  const result = await chrome.storage.local.get(key)
  const entry = result[key] as CacheEntry | undefined
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    chrome.storage.local.remove(key)
    return null
  }
  return { report: entry.report, extracted: entry.extracted }
}

async function setCached(
  key: string,
  report: AnalysisReport,
  extracted: ExtractedCopy,
): Promise<void> {
  await chrome.storage.local.set({ [key]: { report, extracted, timestamp: Date.now() } })
}

function sendProgress(stage: 'extracting' | 'analyzing' | 'aggregating' | 'done'): void {
  chrome.runtime.sendMessage({ type: 'PROGRESS', stage }).catch(() => {})
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Strada installed')
})

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {
  if (message.type !== 'ANALYZE_PAGE') return false
  ;(async (): Promise<BgResponse> => {
    if (!import.meta.env.VITE_GEMINI_API_KEY) {
      return { ok: false, code: 'MISSING_KEY', message: 'VITE_GEMINI_API_KEY not configured' }
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) {
      return { ok: false, code: 'UNKNOWN', message: 'No active tab found' }
    }

    if (RESTRICTED.some(re => re.test(tab.url!))) {
      return { ok: false, code: 'RESTRICTED', message: `Cannot analyze restricted URL: ${tab.url}` }
    }

    sendProgress('extracting')

    let extractedRaw: unknown
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id! },
        func: extract,
      })
      extractedRaw = results[0]?.result
    } catch (err) {
      return { ok: false, code: 'UNKNOWN', message: `Script injection failed: ${String(err)}` }
    }

    const parsed = ExtractedCopySchema.safeParse(extractedRaw)
    if (!parsed.success) {
      return { ok: false, code: 'NO_COPY', message: 'Could not parse extracted copy' }
    }

    const extracted = parsed.data
    if (!extracted.bodyText && !extracted.headlines.length && !extracted.valueProps.length) {
      return { ok: false, code: 'NO_COPY', message: 'No meaningful copy found on this page' }
    }

    const cacheKey = await sha256(
      JSON.stringify({
        url: extracted.url,
        headlines: extracted.headlines,
        ctas: extracted.ctas,
        valueProps: extracted.valueProps,
        body: extracted.bodyText,
      }),
    )
    const cached = await getCached(cacheKey)
    if (cached) {
      sendProgress('done')
      return { ok: true, report: cached.report, extracted: cached.extracted }
    }

    sendProgress('analyzing')

    let report: AnalysisReport
    try {
      const graph = buildGraph()
      const state = await graph.invoke({ extracted })
      sendProgress('aggregating')
      const validated = AnalysisReportSchema.safeParse(state.report)
      if (!validated.success) {
        return { ok: false, code: 'LLM_ERROR', message: 'LLM returned invalid report structure' }
      }
      report = validated.data
    } catch (err) {
      const msg = String(err)
      if (msg.toLowerCase().includes('api key') || msg.toLowerCase().includes('apikey')) {
        return { ok: false, code: 'MISSING_KEY', message: msg }
      }
      return { ok: false, code: 'LLM_ERROR', message: msg }
    }

    await setCached(cacheKey, report, extracted)
    sendProgress('done')

    return { ok: true, report, extracted }
  })()
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, code: 'UNKNOWN', message: String(err) } as BgResponse))

  return true
})
