export type Category = 'value_prop' | 'cta' | 'jargon' | 'tone' | 'readability'

export type Severity = 'high' | 'medium' | 'low'

export interface ExtractedCopy {
  url: string
  title: string
  headlines: string[]
  ctas: string[]
  valueProps: string[]
  bodyText: string
  extractedAt: number
}

export interface Issue {
  id: string
  category: Category
  severity: Severity
  originalText: string
  problem: string
  suggestion: string
  improvedText?: string
}

export interface NodeResult {
  issues: Issue[]
  categoryScore: number
  rationale: string
}

export interface AnalysisReport {
  overallScore: number
  summary: string
  categoryScores: Record<Category, number>
  issues: Issue[]
  meta: {
    url: string
    title: string
    analyzedAt: number
    model: string
    estimatedCategories: Category[]
    estimatedReasons?: Partial<Record<Category, string>>
  }
}

export type ProgressStage = 'extracting' | 'analyzing' | 'aggregating' | 'done'

export type AnalysisStatus = 'idle' | 'running' | 'complete' | 'error'

export type ErrorCode = 'RESTRICTED' | 'NO_COPY' | 'LLM_ERROR' | 'MISSING_KEY' | 'UNKNOWN'

export interface AnalysisError {
  code: ErrorCode
  message: string
}

/**
 * Single source of truth for the analysis lifecycle. Stored in
 * `chrome.storage.session` so the popup can reconstruct UI state on reopen
 * without the background service worker needing to be awake.
 */
export interface AnalysisSnapshot {
  status: AnalysisStatus
  stage: ProgressStage
  percent: number
  detail: string
  completed: Category[]
  partial: Partial<Record<Category, NodeResult>>
  extracted?: ExtractedCopy
  report?: AnalysisReport
  error?: AnalysisError
  url?: string
  title?: string
  startedAt?: number
  updatedAt: number
}

export type TabInfo = {
  url: string
  title: string
  restricted: boolean
}

/** Messages sent from popup → background over the named port. */
export type PortInbound = { type: 'GET_TAB_INFO' } | { type: 'ANALYZE_PAGE' } | { type: 'RESET' }

/** Messages sent from background → popup over the named port. */
export type PortOutbound =
  | { type: 'SNAPSHOT'; snapshot: AnalysisSnapshot }
  | { type: 'TAB_INFO'; tab: TabInfo | null; error?: string }

export const PORT_NAME = 'strada'
