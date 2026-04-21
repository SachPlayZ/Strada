import { extract } from '../content/extractor'
import { buildGraph } from '../lib/graph/graph'
import { createLLM } from '../lib/llm'
import { ExtractedCopySchema, AnalysisReportSchema } from '../lib/schemas'
import { withRetry } from '../lib/utils/retry'
import type {
  BgMessage,
  BgResponse,
  TabInfoResponse,
  AnalysisReport,
  ExtractedCopy,
  Category,
  Progress,
  ProgressStage,
} from '../lib/types'

const RESTRICTED = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^https:\/\/chrome\.google\.com\/webstore/,
  /^file:\/\//,
]

const CACHE_TTL_MS = 10 * 60 * 1000

// Map of LangGraph node keys -> user-facing Category + friendly label.
const NODE_LABELS: Record<string, { category: Category; label: string }> = {
  valueProp_node: { category: 'value_prop', label: 'Analyzing value proposition' },
  cta_node: { category: 'cta', label: 'Checking calls to action' },
  jargon_node: { category: 'jargon', label: 'Hunting jargon' },
  tone_node: { category: 'tone', label: 'Reading tone of voice' },
  readability_node: { category: 'readability', label: 'Scoring readability' },
}

const ALL_ANALYSIS_NODES = Object.keys(NODE_LABELS).length // 5

function isRestricted(url: string): boolean {
  return RESTRICTED.some(re => re.test(url))
}

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

function logStage(stage: string, detail: string, startedAt: number) {
  const ms = Date.now() - startedAt
  console.log(`[Strada +${ms.toString().padStart(5, ' ')}ms] ${stage.padEnd(12)} — ${detail}`)
}

function sendProgress(progress: Omit<Progress, 'type'>): void {
  const msg: Progress = { type: 'PROGRESS', ...progress }
  chrome.runtime.sendMessage(msg).catch(() => {
    // Popup may be closed. The next open will show whatever the final
    // response said; we intentionally swallow these errors.
  })
}

async function getActiveTabInfo(): Promise<TabInfoResponse> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) {
    return { ok: false, message: 'No active tab found' }
  }
  return {
    ok: true,
    tab: {
      url: tab.url,
      title: tab.title ?? '',
      restricted: isRestricted(tab.url),
    },
  }
}

async function runAnalysis(): Promise<BgResponse> {
  const startedAt = Date.now()

  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    return { ok: false, code: 'MISSING_KEY', message: 'VITE_GEMINI_API_KEY not configured' }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !tab.url) {
    return { ok: false, code: 'UNKNOWN', message: 'No active tab found' }
  }
  if (isRestricted(tab.url)) {
    return { ok: false, code: 'RESTRICTED', message: `Cannot analyze restricted URL: ${tab.url}` }
  }

  const emit = (stage: ProgressStage, percent: number, detail: string, completed: Category[]) => {
    logStage(stage, detail, startedAt)
    sendProgress({ stage, percent, detail, completed })
  }

  emit('extracting', 5, 'Injecting content script…', [])
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
  emit('extracting', 10, 'Parsing page copy…', [])

  const parsed = ExtractedCopySchema.safeParse(extractedRaw)
  if (!parsed.success) {
    return { ok: false, code: 'NO_COPY', message: 'Could not parse extracted copy' }
  }
  const extracted = parsed.data
  if (!extracted.bodyText && !extracted.headlines.length && !extracted.valueProps.length) {
    return { ok: false, code: 'NO_COPY', message: 'No meaningful copy found on this page' }
  }
  logStage(
    'extracting',
    `headlines=${extracted.headlines.length} ctas=${extracted.ctas.length} vps=${extracted.valueProps.length} body=${extracted.bodyText.length}c`,
    startedAt,
  )

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
    emit('done', 100, 'Loaded cached analysis.', [
      'value_prop',
      'cta',
      'jargon',
      'tone',
      'readability',
    ])
    return { ok: true, report: cached.report, extracted: cached.extracted }
  }

  emit('analyzing', 13, 'Pre-flighting Gemini…', [])
  try {
    // Cheap sanity call — if the key is invalid, the model is wrong, or the network is broken,
    // fail in ~1s instead of waiting for 5 nodes × retries × timeouts.
    await withRetry(() => createLLM().invoke('ping'), {
      attempts: 1,
      timeoutMs: 15_000,
      label: 'preflight',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Strada/preflight] failed:', err)
    const lower = msg.toLowerCase()
    if (lower.includes('api key') || lower.includes('apikey') || lower.includes('api_key')) {
      return { ok: false, code: 'MISSING_KEY', message: msg }
    }
    return { ok: false, code: 'LLM_ERROR', message: `Preflight failed: ${msg}` }
  }

  emit('analyzing', 15, 'Calling Gemini with 5 parallel analyzers…', [])

  let report: AnalysisReport
  try {
    const graph = buildGraph()
    // streamMode: 'updates' yields one object per node completion: { [nodeKey]: partialState }.
    // We use this to drive per-category progress instead of a single opaque spinner.
    const stream = await graph.stream({ extracted }, { streamMode: 'updates' })

    const completed: Category[] = []
    let finalState: Record<string, unknown> = {}

    for await (const chunk of stream) {
      for (const [nodeKey, partial] of Object.entries(chunk as Record<string, unknown>)) {
        finalState = { ...finalState, ...(partial as Record<string, unknown>) }

        const meta = NODE_LABELS[nodeKey]
        if (meta) {
          completed.push(meta.category)
          const pct = 15 + Math.round((completed.length / ALL_ANALYSIS_NODES) * 70) // 15 -> 85
          emit('analyzing', pct, `${meta.label} ✓`, [...completed])
        } else if (nodeKey === 'aggregator_node') {
          emit('aggregating', 92, 'Aggregating & summarizing…', [...completed])
        }
      }
    }

    const validated = AnalysisReportSchema.safeParse((finalState as { report?: unknown }).report)
    if (!validated.success) {
      console.error('[Strada/validate] report schema mismatch:', validated.error.issues)
      console.error(
        '[Strada/validate] received report:',
        (finalState as { report?: unknown }).report,
      )
      const firstIssue = validated.error.issues[0]
      const where = firstIssue?.path.join('.') || '(root)'
      return {
        ok: false,
        code: 'LLM_ERROR',
        message: `Invalid report structure at ${where}: ${firstIssue?.message ?? 'unknown'}`,
      }
    }
    report = validated.data
  } catch (err) {
    console.error('[Strada/graph] stream failed:', err)
    const msg = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()
    if (lower.includes('api key') || lower.includes('apikey') || lower.includes('api_key')) {
      return { ok: false, code: 'MISSING_KEY', message: msg }
    }
    return { ok: false, code: 'LLM_ERROR', message: msg }
  }

  // If the graph completed but every category failed, surface that as an error instead of
  // pretending we got a real score.
  if (report.meta.estimatedCategories.length === 5) {
    const reasons = report.meta.estimatedReasons ?? {}
    const sample = Object.values(reasons)[0] ?? 'Unknown error.'
    console.error('[Strada] all 5 nodes returned estimates:', reasons)
    return {
      ok: false,
      code: 'LLM_ERROR',
      message: `All 5 analyzers failed. First reason: ${sample}`,
    }
  }

  await setCached(cacheKey, report, extracted)
  emit('done', 100, `Done in ${Date.now() - startedAt}ms`, [
    'value_prop',
    'cta',
    'jargon',
    'tone',
    'readability',
  ])

  return { ok: true, report, extracted }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('Strada installed')
})

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {
  if (message.type === 'GET_TAB_INFO') {
    getActiveTabInfo()
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, message: String(err) } as TabInfoResponse))
    return true
  }

  if (message.type === 'ANALYZE_PAGE') {
    runAnalysis()
      .then(sendResponse)
      .catch(err =>
        sendResponse({ ok: false, code: 'UNKNOWN', message: String(err) } as BgResponse),
      )
    return true
  }

  return false
})
