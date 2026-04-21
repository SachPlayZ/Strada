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
  }
}

export type BgMessage =
  | { type: 'ANALYZE_PAGE' }
  | { type: 'PROGRESS'; stage: 'extracting' | 'analyzing' | 'aggregating' | 'done' }

export type BgResponse =
  | { ok: true; report: AnalysisReport; extracted: ExtractedCopy }
  | {
      ok: false
      code: 'RESTRICTED' | 'NO_COPY' | 'LLM_ERROR' | 'MISSING_KEY' | 'UNKNOWN'
      message: string
    }
