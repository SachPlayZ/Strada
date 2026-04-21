import { extract } from '../content/extractor'
import { buildGraph } from '../lib/graph/graph'
import { createLLM } from '../lib/llm'
import { ExtractedCopySchema, AnalysisReportSchema } from '../lib/schemas'
import { withRetry } from '../lib/utils/retry'
import {
  clearSnapshot,
  makeIdleSnapshot,
  readSnapshot,
  updateSnapshot,
  writeSnapshot,
} from '../lib/session'
import type {
  AnalysisError,
  AnalysisReport,
  AnalysisSnapshot,
  Category,
  ExtractedCopy,
  NodeResult,
  PortInbound,
  PortOutbound,
  TabInfo,
} from '../lib/types'
import { PORT_NAME } from '../lib/types'

const RESTRICTED = [
  /^chrome:\/\//,
  /^chrome-extension:\/\//,
  /^https:\/\/chrome\.google\.com\/webstore/,
  /^file:\/\//,
]

const CACHE_TTL_MS = 10 * 60 * 1000

// Map LangGraph node keys → user-facing Category + friendly label + state-channel key.
const NODE_LABELS: Record<
  string,
  { category: Category; label: string; channel: keyof StateChannelMap }
> = {
  valueProp_node: {
    category: 'value_prop',
    label: 'Analyzing value proposition',
    channel: 'valueProp',
  },
  cta_node: { category: 'cta', label: 'Checking calls to action', channel: 'cta' },
  jargon_node: { category: 'jargon', label: 'Hunting jargon', channel: 'jargon' },
  tone_node: { category: 'tone', label: 'Reading tone of voice', channel: 'tone' },
  readability_node: {
    category: 'readability',
    label: 'Scoring readability',
    channel: 'readability',
  },
}

const ALL_ANALYSIS_NODES = Object.keys(NODE_LABELS).length

interface StateChannelMap {
  valueProp: NodeResult
  cta: NodeResult
  jargon: NodeResult
  tone: NodeResult
  readability: NodeResult
  report: AnalysisReport
}

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

// ---- Port registry ---------------------------------------------------------
//
// The popup opens a long-lived port on mount. The background keeps a set of
// currently connected ports; every snapshot write is fan-out posted to all of
// them. If the popup is closed the set is empty and posts are silently
// skipped — storage.session remains authoritative so the popup can reconstruct
// state whenever it reopens.

const ports = new Set<chrome.runtime.Port>()

// Posts to a single port but tolerates the port being disconnected in the
// meantime. Chrome throws "Attempting to use a disconnected port object" if
// the popup closed between when we started an async task and when we came
// back to reply — which happens constantly during 30s LLM calls.
function safePost(port: chrome.runtime.Port, message: PortOutbound): void {
  if (!ports.has(port)) return
  try {
    port.postMessage(message)
  } catch {
    ports.delete(port)
  }
}

function broadcast(message: PortOutbound): void {
  for (const port of ports) {
    try {
      port.postMessage(message)
    } catch {
      ports.delete(port)
    }
  }
}

async function persist(patch: Partial<AnalysisSnapshot>): Promise<AnalysisSnapshot> {
  const next = await updateSnapshot(patch)
  broadcast({ type: 'SNAPSHOT', snapshot: next })
  return next
}

async function getActiveTab(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return null
  return {
    url: tab.url,
    title: tab.title ?? '',
    restricted: isRestricted(tab.url),
  }
}

// ---- Analysis pipeline -----------------------------------------------------

let activeRun: Promise<void> | null = null

function logStage(stage: string, detail: string, startedAt: number) {
  const ms = Date.now() - startedAt
  console.log(`[Strada +${ms.toString().padStart(5, ' ')}ms] ${stage.padEnd(12)} — ${detail}`)
}

async function startAnalysis(): Promise<void> {
  if (activeRun) {
    // A run is already in flight; the popup will pick up live updates via
    // storage + port. No need to queue a second one.
    return activeRun
  }
  activeRun = runAnalysis()
    .catch(err => {
      console.error('[Strada] analysis crashed:', err)
    })
    .finally(() => {
      activeRun = null
    })
  return activeRun
}

async function failRun(code: AnalysisError['code'], message: string): Promise<void> {
  await persist({
    status: 'error',
    stage: 'done',
    percent: 100,
    detail: message,
    error: { code, message },
  })
}

async function runAnalysis(): Promise<void> {
  const startedAt = Date.now()

  const tabInfo = await getActiveTab()
  if (!tabInfo) {
    await failRun('UNKNOWN', 'No active tab found')
    return
  }
  if (tabInfo.restricted) {
    await failRun('RESTRICTED', `Cannot analyze restricted URL: ${tabInfo.url}`)
    return
  }

  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    await failRun('MISSING_KEY', 'VITE_GEMINI_API_KEY not configured')
    return
  }

  // Initial snapshot: blow away whatever was previously there so the popup
  // doesn't see stale partials leaking into the new run.
  const seed: AnalysisSnapshot = {
    ...makeIdleSnapshot(),
    status: 'running',
    stage: 'extracting',
    percent: 5,
    detail: 'Injecting content script…',
    url: tabInfo.url,
    title: tabInfo.title,
    startedAt,
  }
  await writeSnapshot(seed)
  broadcast({ type: 'SNAPSHOT', snapshot: seed })

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) {
    await failRun('UNKNOWN', 'Active tab has no id')
    return
  }

  let extractedRaw: unknown
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extract,
    })
    extractedRaw = results[0]?.result
  } catch (err) {
    await failRun('UNKNOWN', `Script injection failed: ${String(err)}`)
    return
  }

  await persist({ stage: 'extracting', percent: 10, detail: 'Parsing page copy…' })

  const parsed = ExtractedCopySchema.safeParse(extractedRaw)
  if (!parsed.success) {
    await failRun('NO_COPY', 'Could not parse extracted copy')
    return
  }
  const extracted = parsed.data
  if (!extracted.bodyText && !extracted.headlines.length && !extracted.valueProps.length) {
    await failRun('NO_COPY', 'No meaningful copy found on this page')
    return
  }
  logStage(
    'extracting',
    `headlines=${extracted.headlines.length} ctas=${extracted.ctas.length} vps=${extracted.valueProps.length} body=${extracted.bodyText.length}c`,
    startedAt,
  )

  await persist({ extracted })

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
    await persist({
      status: 'complete',
      stage: 'done',
      percent: 100,
      detail: 'Loaded cached analysis.',
      completed: ['value_prop', 'cta', 'jargon', 'tone', 'readability'],
      extracted: cached.extracted,
      report: cached.report,
    })
    return
  }

  await persist({ stage: 'analyzing', percent: 13, detail: 'Pre-flighting Gemini…' })
  try {
    // Cheap sanity call — fails fast on bad key, wrong model, or dead network.
    await withRetry(() => createLLM().invoke('ping'), {
      attempts: 1,
      timeoutMs: 15_000,
      label: 'preflight',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[Strada/preflight] failed:', err)
    const lower = msg.toLowerCase()
    const code: AnalysisError['code'] =
      lower.includes('api key') || lower.includes('apikey') || lower.includes('api_key')
        ? 'MISSING_KEY'
        : 'LLM_ERROR'
    await failRun(code, code === 'MISSING_KEY' ? msg : `Preflight failed: ${msg}`)
    return
  }

  await persist({
    stage: 'analyzing',
    percent: 15,
    detail: 'Calling Gemini with 5 parallel analyzers…',
  })

  try {
    const graph = buildGraph()
    // streamMode 'updates' yields one chunk per node completion —
    // `{ [nodeKey]: partialState }` — which is exactly the right grain for
    // writing incremental snapshots so the popup can show per-node progress.
    const stream = await graph.stream({ extracted }, { streamMode: 'updates' })

    const completed: Category[] = []
    const partial: Partial<Record<Category, NodeResult>> = {}
    let finalState: Record<string, unknown> = {}

    for await (const chunk of stream) {
      for (const [nodeKey, chunkPartial] of Object.entries(chunk as Record<string, unknown>)) {
        const typedPartial = chunkPartial as Record<string, unknown>
        finalState = { ...finalState, ...typedPartial }

        const meta = NODE_LABELS[nodeKey]
        if (meta) {
          const nodeResult = typedPartial[meta.channel] as NodeResult | undefined
          if (nodeResult) partial[meta.category] = nodeResult
          if (!completed.includes(meta.category)) completed.push(meta.category)

          // Percent ramps 15 → 85 across the 5 analyzers; aggregator picks up
          // at 92 below. The storage write here doubles as a heartbeat to keep
          // the service worker from being suspended between nodes.
          const pct = 15 + Math.round((completed.length / ALL_ANALYSIS_NODES) * 70)
          await persist({
            stage: 'analyzing',
            percent: pct,
            detail: `${meta.label} ✓`,
            completed: [...completed],
            partial: { ...partial },
          })
          logStage(
            'analyzing',
            `${meta.label} (${completed.length}/${ALL_ANALYSIS_NODES})`,
            startedAt,
          )
        } else if (nodeKey === 'aggregator_node') {
          await persist({
            stage: 'aggregating',
            percent: 92,
            detail: 'Aggregating & summarizing…',
          })
          logStage('aggregating', 'aggregator_node', startedAt)
        }
      }
    }

    const validated = AnalysisReportSchema.safeParse((finalState as { report?: unknown }).report)
    if (!validated.success) {
      console.error('[Strada/validate] report schema mismatch:', validated.error.issues)
      const firstIssue = validated.error.issues[0]
      const where = firstIssue?.path.join('.') || '(root)'
      await failRun(
        'LLM_ERROR',
        `Invalid report structure at ${where}: ${firstIssue?.message ?? 'unknown'}`,
      )
      return
    }
    const report = validated.data

    if (report.meta.estimatedCategories.length === 5) {
      const reasons = report.meta.estimatedReasons ?? {}
      const sample = Object.values(reasons)[0] ?? 'Unknown error.'
      console.error('[Strada] all 5 nodes returned estimates:', reasons)
      await failRun('LLM_ERROR', `All 5 analyzers failed. First reason: ${sample}`)
      return
    }

    await setCached(cacheKey, report, extracted)
    await persist({
      status: 'complete',
      stage: 'done',
      percent: 100,
      detail: `Done in ${Date.now() - startedAt}ms`,
      completed: ['value_prop', 'cta', 'jargon', 'tone', 'readability'],
      report,
    })
    logStage('done', `total ${Date.now() - startedAt}ms`, startedAt)
  } catch (err) {
    console.error('[Strada/graph] stream failed:', err)
    const msg = err instanceof Error ? err.message : String(err)
    const lower = msg.toLowerCase()
    const code: AnalysisError['code'] =
      lower.includes('api key') || lower.includes('apikey') || lower.includes('api_key')
        ? 'MISSING_KEY'
        : 'LLM_ERROR'
    await failRun(code, msg)
  }
}

// ---- Port plumbing ---------------------------------------------------------

async function handleInbound(port: chrome.runtime.Port, msg: PortInbound): Promise<void> {
  if (msg.type === 'GET_TAB_INFO') {
    try {
      const tab = await getActiveTab()
      safePost(port, { type: 'TAB_INFO', tab })
    } catch (err) {
      safePost(port, {
        type: 'TAB_INFO',
        tab: null,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (msg.type === 'ANALYZE_PAGE') {
    void startAnalysis()
    return
  }

  if (msg.type === 'RESET') {
    // Don't blow away a live run — popup's "back" button shouldn't cancel
    // work already in flight. If no run is active, reset to idle so the
    // intro screen reappears cleanly.
    if (activeRun) return
    const idle = await clearSnapshot()
    broadcast({ type: 'SNAPSHOT', snapshot: idle })
    return
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== PORT_NAME) return
  ports.add(port)

  port.onDisconnect.addListener(() => {
    ports.delete(port)
  })

  port.onMessage.addListener((msg: PortInbound) => {
    handleInbound(port, msg).catch(err => {
      console.error('[Strada/port] handler failed:', err)
    })
  })

  // Push the current snapshot immediately so the popup has authoritative
  // state to render against even if its own storage read lost a race.
  readSnapshot()
    .then(snapshot => {
      safePost(port, { type: 'SNAPSHOT', snapshot })
    })
    .catch(err => {
      console.error('[Strada/port] initial snapshot failed:', err)
    })
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('Strada installed')
})
