import { z } from 'zod'

export const ExtractedCopySchema = z.object({
  url: z.string(),
  title: z.string(),
  headlines: z.array(z.string()),
  ctas: z.array(z.string()),
  valueProps: z.array(z.string()),
  bodyText: z.string(),
  extractedAt: z.number(),
})

export const IssueSchema = z.object({
  id: z.string(),
  category: z.enum(['value_prop', 'cta', 'jargon', 'tone', 'readability']),
  severity: z.enum(['high', 'medium', 'low']),
  originalText: z.string(),
  problem: z.string(),
  suggestion: z.string(),
  improvedText: z.string().optional(),
})

export const NodeResultSchema = z.object({
  issues: z.array(IssueSchema),
  categoryScore: z.number().min(0).max(100),
  rationale: z.string(),
})

export const AnalysisReportSchema = z.object({
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  categoryScores: z.object({
    value_prop: z.number(),
    cta: z.number(),
    jargon: z.number(),
    tone: z.number(),
    readability: z.number(),
  }),
  issues: z.array(IssueSchema),
  meta: z.object({
    url: z.string(),
    title: z.string(),
    analyzedAt: z.number(),
    model: z.string(),
  }),
})
