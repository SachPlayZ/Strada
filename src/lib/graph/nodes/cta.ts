import { createLLM } from '../../llm'
import { NodeResultSchema } from '../../schemas'
import { withRetry, ESTIMATED_SENTINEL } from '../../utils/retry'
import type { AnalysisStateType } from '../state'

function fallback(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return { issues: [], categoryScore: 50, rationale: `${ESTIMATED_SENTINEL}${msg}` }
}

export async function ctaNode(state: AnalysisStateType): Promise<Partial<AnalysisStateType>> {
  try {
    const { ctas, url } = state.extracted
    if (ctas.length === 0) {
      return { cta: { issues: [], categoryScore: 40, rationale: 'No CTAs detected on page.' } }
    }

    const chain = createLLM().withStructuredOutput(NodeResultSchema)

    const prompt = `You are a conversion rate optimization expert. Analyze these call-to-action texts from ${url}.

CTAs found:
${ctas.map((c, i) => `${i + 1}. "${c}"`).join('\n')}

Evaluate each CTA for:
1. Action clarity — does it tell the user exactly what happens next?
2. Value communication — does it convey benefit, not just action?
3. Urgency/motivation — is there any compelling reason to click now?
4. Generic language — avoid "Submit", "Click Here", "Learn More" without context

Return a JSON with:
- issues: specific CTA copy problems (each with id, category="cta", severity, originalText, problem, suggestion, optionally improvedText)
- categoryScore: 0-100 (100 = all CTAs are compelling and clear)
- rationale: 1-2 sentence explanation`

    const result = await withRetry(() => chain.invoke(prompt), { label: 'cta' })
    return { cta: result }
  } catch (err) {
    console.error('[Strada/cta] failed:', err)
    return { cta: fallback(err) }
  }
}
