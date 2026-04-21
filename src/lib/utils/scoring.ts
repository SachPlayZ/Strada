import type { Category, Severity } from '../types'

const WEIGHTS: Record<Category, number> = {
  value_prop: 0.3,
  cta: 0.25,
  readability: 0.2,
  tone: 0.15,
  jargon: 0.1,
}

export function weightedOverall(categoryScores: Record<Category, number>): number {
  return Math.round(
    Object.entries(WEIGHTS).reduce(
      (sum, [cat, weight]) => sum + (categoryScores[cat as Category] ?? 50) * weight,
      0
    )
  )
}

export function severityRank(s: Severity): number {
  return s === 'high' ? 0 : s === 'medium' ? 1 : 2
}
