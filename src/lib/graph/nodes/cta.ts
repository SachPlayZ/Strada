import { createLLM } from '../../llm'
import { NodeResultSchema } from '../../schemas'
import type { AnalysisStateType } from '../state'

const FALLBACK = { issues: [], categoryScore: 50, rationale: 'unavailable' }

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

    const result = await chain.invoke(prompt)
    return { cta: result }
  } catch {
    return { cta: FALLBACK }
  }
}
