import { createLLM } from '../../llm'
import { NodeResultSchema } from '../../schemas'
import { fleschKincaidGrade, fleschReadingEase, truncateChars } from '../../utils/text'
import type { AnalysisStateType } from '../state'

const FALLBACK = { issues: [], categoryScore: 50, rationale: 'unavailable' }

function gradeToScore(grade: number): number {
  // Grade 6 or below = 100, grade 16+ = 0; linear in between
  return Math.max(0, Math.min(100, Math.round(100 - Math.max(0, grade - 6) * 10)))
}

export async function readabilityNode(state: AnalysisStateType): Promise<Partial<AnalysisStateType>> {
  try {
    const { bodyText, url } = state.extracted

    if (!bodyText || bodyText.trim().length < 50) {
      return {
        readability: {
          issues: [],
          categoryScore: 50,
          rationale: 'Insufficient body text to assess readability.',
        },
      }
    }

    const grade = fleschKincaidGrade(bodyText)
    const ease = fleschReadingEase(bodyText)
    const computedScore = gradeToScore(grade)

    const sample = truncateChars(bodyText, 3000)
    const chain = createLLM().withStructuredOutput(NodeResultSchema)

    const prompt = `You are a readability and UX writing expert. Analyze the readability of this webpage's body copy (${url}).

Computed metrics:
- Flesch-Kincaid Grade Level: ${grade.toFixed(1)} (target: ≤ 8 for general web)
- Flesch Reading Ease: ${ease.toFixed(1)} (target: ≥ 60; higher = easier)

Body text sample:
${sample}

Based on the metrics AND the actual text, identify:
1. Sentences that are too long (> 25 words)
2. Paragraphs that are dense walls of text
3. Unnecessarily complex words when simpler ones exist
4. Passive voice overuse
5. Missing scannable structure (no subheadings, bullets, short paragraphs)

Return a JSON with:
- issues: specific readability problems (each with id, category="readability", severity, originalText quoting the problematic passage, problem, suggestion, optionally improvedText)
- categoryScore: ${computedScore} (use this computed score, adjust ±5 based on qualitative assessment)
- rationale: mention the FK grade level and what it means for the target audience`

    const result = await chain.invoke(prompt)
    // Clamp score to computed ±5 range to prevent LLM from ignoring metrics
    const clampedScore = Math.max(
      Math.max(0, computedScore - 10),
      Math.min(Math.min(100, computedScore + 10), result.categoryScore)
    )
    return { readability: { ...result, categoryScore: clampedScore } }
  } catch {
    return { readability: FALLBACK }
  }
}
