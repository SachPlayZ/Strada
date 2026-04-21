import { createLLM } from '../../llm'
import { NodeResultSchema } from '../../schemas'
import { truncateChars } from '../../utils/text'
import { withRetry, ESTIMATED_SENTINEL } from '../../utils/retry'
import type { AnalysisStateType } from '../state'

function fallback(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return { issues: [], categoryScore: 50, rationale: `${ESTIMATED_SENTINEL}${msg}` }
}

export async function toneNode(state: AnalysisStateType): Promise<Partial<AnalysisStateType>> {
  try {
    const { headlines, valueProps, bodyText, url } = state.extracted
    const chain = createLLM().withStructuredOutput(NodeResultSchema)

    const sample = truncateChars(bodyText, 3000)

    const prompt = `You are a brand voice and tone expert. Analyze the tone of copy on this webpage (${url}).

Headlines:
${headlines.join('\n')}

Key messages:
${valueProps.join('\n')}

Body text sample:
${sample}

Evaluate:
1. Consistency — does tone stay consistent across sections?
2. Customer-centricity — "you/your" vs "we/our" ratio; who is the hero?
3. Emotional resonance — does it connect with pain points or aspirations?
4. Authenticity — does it feel genuine or overly salesy/corporate?
5. Appropriate confidence — too timid ("might", "could possibly") or too aggressive?

Return a JSON with:
- issues: specific tone problems (each with id, category="tone", severity, originalText, problem, suggestion, optionally improvedText)
- categoryScore: 0-100 (100 = excellent consistent tone aligned with audience)
- rationale: 1-2 sentence explanation`

    const result = await withRetry(() => chain.invoke(prompt), { label: 'tone' })
    return { tone: result }
  } catch (err) {
    console.error('[Strada/tone] failed:', err)
    return { tone: fallback(err) }
  }
}
