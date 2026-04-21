import { createLLM } from '../../llm'
import { NodeResultSchema } from '../../schemas'
import { withRetry, ESTIMATED_SENTINEL } from '../../utils/retry'
import type { AnalysisStateType } from '../state'

const FALLBACK = { issues: [], categoryScore: 50, rationale: ESTIMATED_SENTINEL }

export async function valuePropNode(state: AnalysisStateType): Promise<Partial<AnalysisStateType>> {
  try {
    const { headlines, valueProps, url } = state.extracted
    const chain = createLLM().withStructuredOutput(NodeResultSchema)

    const prompt = `You are a conversion copywriting expert. Analyze the value proposition copy from this webpage (${url}).

Headlines:
${headlines.join('\n')}

Value propositions / key messages:
${valueProps.join('\n')}

Evaluate:
1. Clarity — does the user immediately understand what the product/service does?
2. Differentiation — is there a unique angle vs generic claims?
3. Benefit focus — features vs outcomes for the customer?
4. Specificity — vague promises vs concrete results?

Return a JSON with:
- issues: array of specific copy problems found (each with id, category="value_prop", severity, originalText, problem, suggestion, optionally improvedText)
- categoryScore: 0-100 (100 = excellent value prop)
- rationale: 1-2 sentence explanation of the score`

    const result = await withRetry(() => chain.invoke(prompt))
    return { valueProp: result }
  } catch {
    return { valueProp: FALLBACK }
  }
}
