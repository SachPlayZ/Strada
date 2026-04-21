import { describe, it, expect, vi } from 'vitest'
import type { ExtractedCopy } from '../types'

// Mock createLLM so that `chain.invoke(...)` throws on every call. Each node
// wraps invoke in withRetry, exhausts its 3 attempts, hits the catch branch,
// and returns FALLBACK whose rationale === ESTIMATED_SENTINEL. The aggregator
// reads the sentinel and records the category in report.meta.estimatedCategories.
const { invokeSpy } = vi.hoisted(() => ({
  invokeSpy: vi.fn(async () => {
    throw new Error('LLM permafail (test)')
  }),
}))

vi.mock('../llm', () => ({
  createLLM: () => ({
    withStructuredOutput: () => ({ invoke: invokeSpy }),
    invoke: invokeSpy,
  }),
}))

// Keep retry backoff negligible so tests stay fast.
vi.mock('../utils/retry', async () => {
  const actual = await vi.importActual<typeof import('../utils/retry')>('../utils/retry')
  return {
    ...actual,
    withRetry: async <T>(fn: () => Promise<T>) => {
      let lastErr: unknown
      for (let i = 0; i < 3; i++) {
        try {
          return await fn()
        } catch (e) {
          lastErr = e
        }
      }
      throw lastErr
    },
  }
})

import { analyzeExtractedCopy } from './graph'

const fixture: ExtractedCopy = {
  url: 'https://example.com/',
  title: 'Example',
  headlines: ['Welcome'],
  ctas: ['Get started'],
  valueProps: ['The best product.'],
  bodyText:
    'This is a reasonably long paragraph used as body text so the readability node has enough material to score against. We want every node to attempt the LLM and then fall back to its estimated sentinel when the mock throws.',
  extractedAt: 1_700_000_000_000,
}

describe('partial results — estimated categories', () => {
  it('marks every category whose LLM call fails after retries as estimated in report.meta', async () => {
    const report = await analyzeExtractedCopy(fixture)
    expect(report).toBeDefined()

    // Each of the 5 analysis nodes should have attempted 3 retries before falling back.
    // Plus the aggregator's summary .invoke (not retried). Total invokes >= 15.
    expect(invokeSpy.mock.calls.length).toBeGreaterThanOrEqual(15)

    const est = report!.meta.estimatedCategories.slice().sort()
    expect(est).toEqual(['cta', 'jargon', 'readability', 'tone', 'value_prop'].sort())

    // Scores still populate (default to 50) so the UI renders something useful.
    Object.values(report!.categoryScores).forEach(s => {
      expect(s).toBe(50)
    })
  })
})
