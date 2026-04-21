import { createLLM } from '../../llm'
import { NodeResultSchema } from '../../schemas'
import { truncateChars } from '../../utils/text'
import { withRetry, ESTIMATED_SENTINEL } from '../../utils/retry'
import type { AnalysisStateType } from '../state'

function fallback(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return { issues: [], categoryScore: 50, rationale: `${ESTIMATED_SENTINEL}${msg}` }
}

export async function jargonNode(state: AnalysisStateType): Promise<Partial<AnalysisStateType>> {
  try {
    const { headlines, bodyText, url } = state.extracted
    const chain = createLLM().withStructuredOutput(NodeResultSchema)

    const sample = truncateChars(bodyText, 3000)

    const prompt = `You are a plain-language writing expert. Identify jargon, buzzwords, and overly technical language on this webpage (${url}).

Headlines:
${headlines.join('\n')}

Body text sample:
${sample}

Look for:
1. Industry buzzwords ("synergy", "leverage", "disruptive", "ecosystem", "holistic", "best-in-class")
2. Acronyms and technical terms not explained in context
3. Corporate-speak that obscures meaning ("utilize" vs "use", "facilitate" vs "help")
4. Vague superlatives ("cutting-edge", "world-class", "innovative") without evidence

Return a JSON with:
- issues: specific jargon instances (each with id, category="jargon", severity, originalText quoting the exact phrase, problem, suggestion, optionally improvedText)
- categoryScore: 0-100 (100 = clear, jargon-free language)
- rationale: 1-2 sentence explanation`

    const result = await withRetry(() => chain.invoke(prompt), { label: 'jargon' })
    return { jargon: result }
  } catch (err) {
    console.error('[Strada/jargon] failed:', err)
    return { jargon: fallback(err) }
  }
}
