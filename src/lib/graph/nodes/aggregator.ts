import { createLLM } from '../../llm'
import { weightedOverall, severityRank } from '../../utils/scoring'
import type { AnalysisStateType } from '../state'
import type { Issue, Category, AnalysisReport } from '../../types'

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/))
  const setB = new Set(b.toLowerCase().split(/\s+/))
  const intersection = [...setA].filter(w => setB.has(w)).length
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 1 : intersection / union
}

function dedupeByOverlap(issues: Issue[], threshold = 0.85): Issue[] {
  const kept: Issue[] = []
  for (const issue of issues) {
    const isDupe = kept.some(
      k => k.category === issue.category && jaccardSimilarity(k.originalText, issue.originalText) >= threshold
    )
    if (!isDupe) kept.push(issue)
  }
  return kept
}

export async function aggregatorNode(state: AnalysisStateType): Promise<Partial<AnalysisStateType>> {
  const nodes = {
    value_prop: state.valueProp,
    cta: state.cta,
    jargon: state.jargon,
    tone: state.tone,
    readability: state.readability,
  }

  const categoryScores = Object.fromEntries(
    Object.entries(nodes).map(([cat, result]) => [cat, result?.categoryScore ?? 50])
  ) as Record<Category, number>

  const allIssues: Issue[] = Object.values(nodes).flatMap(r => r?.issues ?? [])

  const deduped = dedupeByOverlap(allIssues)

  const weights: Record<Category, number> = {
    value_prop: 0.3,
    cta: 0.25,
    readability: 0.2,
    tone: 0.15,
    jargon: 0.1,
  }

  const sorted = deduped.sort((a, b) => {
    const severityDiff = severityRank(a.severity) - severityRank(b.severity)
    if (severityDiff !== 0) return severityDiff
    return (weights[b.category] ?? 0) - (weights[a.category] ?? 0)
  })

  const overallScore = weightedOverall(categoryScores)

  let summary = `Overall copy score: ${overallScore}/100. ${sorted.filter(i => i.severity === 'high').length} high-severity issues found across ${Object.keys(nodes).length} categories.`

  try {
    const llm = createLLM()
    const summaryResult = await llm.invoke(
      `You analyzed a webpage's copy. Here are the category scores: ${JSON.stringify(categoryScores)}. Overall score: ${overallScore}/100. Top issues: ${sorted.slice(0, 3).map(i => i.problem).join('; ')}. Write a 2-3 sentence plain-English summary of what's working well and the most important things to fix. Be specific and actionable.`
    )
    const content = typeof summaryResult.content === 'string'
      ? summaryResult.content
      : String(summaryResult.content)
    if (content.trim().length > 20) summary = content.trim()
  } catch {
    // fallback summary already set above
  }

  const report: AnalysisReport = {
    overallScore,
    summary,
    categoryScores,
    issues: sorted,
    meta: {
      url: state.extracted.url,
      title: state.extracted.title,
      analyzedAt: Date.now(),
      model: 'gemini-2.0-flash',
    },
  }

  return { report }
}
