import { describe, it, expect, vi } from 'vitest'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import type { ExtractedCopy } from '../types'

const cannedNodeResult = {
  issues: [
    {
      id: 'canned-1',
      category: 'value_prop',
      severity: 'high',
      originalText: 'The one marketing platform for everyone',
      problem: 'Vague and generic — "everyone" signals no clear ICP.',
      suggestion: 'Name the buyer and the concrete outcome you deliver.',
      improvedText: 'The marketing platform indie SaaS founders use to hit $10k MRR.',
    },
    {
      id: 'canned-2',
      category: 'value_prop',
      severity: 'medium',
      originalText: 'Best-in-class solutions',
      problem: 'Cliché with no proof.',
      suggestion: 'Replace with a specific differentiator or metric.',
    },
  ],
  categoryScore: 72,
  rationale: 'Clear enough structurally but lacks specificity and proof.',
}

// FakeListChatModel returns responses[i % length] for each call. A single canned
// JSON payload is valid for every node in the graph and for the aggregator's
// summary call (which just reads .content as a string).
vi.mock('../llm', () => ({
  createLLM: () =>
    new FakeListChatModel({
      responses: [JSON.stringify(cannedNodeResult)],
    }),
}))

import { buildGraph, analyzeExtractedCopy } from './graph'

const fixture: ExtractedCopy = {
  url: 'https://example.com/pricing',
  title: 'Pricing — Example',
  headlines: [
    'The one marketing platform for everyone',
    'Plans for every team',
    'Join thousands of customers',
  ],
  ctas: ['Get started', 'Book a demo', 'Sign up free'],
  valueProps: [
    'The one marketing platform for everyone',
    'Best-in-class solutions trusted by industry leaders.',
  ],
  bodyText: Array.from({ length: 6 })
    .map(
      () =>
        'Our best-in-class marketing platform empowers synergistic cross-functional teams to leverage actionable insights and drive measurable business outcomes across the entire customer journey through intelligent automation.',
    )
    .join(' '),
  extractedAt: 1_700_000_000_000,
}

describe('LangGraph end-to-end fan-out / fan-in', () => {
  it('buildGraph().invoke(...) aggregates results from all 5 analysis nodes', async () => {
    const graph = buildGraph()
    const state = await graph.invoke({ extracted: fixture })
    const report = state.report

    expect(report).toBeDefined()
    expect(report!.meta.url).toBe(fixture.url)
    expect(report!.meta.title).toBe(fixture.title)

    // Every analysis node contributed a score -> proves fan-in.
    const scoredCategories = Object.entries(report!.categoryScores)
      .filter(([, v]) => typeof v === 'number')
      .map(([k]) => k)
      .sort()
    expect(scoredCategories).toEqual(['cta', 'jargon', 'readability', 'tone', 'value_prop'].sort())

    // Overall score is the weighted roll-up of the 5 scores.
    expect(report!.overallScore).toBeGreaterThan(0)
    expect(report!.overallScore).toBeLessThanOrEqual(100)

    // Issues were collected and deduped (each non-readability node emits the
    // same 2 canned issues in the `value_prop` category; they must collapse).
    const vpIssues = report!.issues.filter(i => i.category === 'value_prop')
    expect(vpIssues.length).toBeGreaterThan(0)
    expect(vpIssues.length).toBeLessThanOrEqual(2)
  })

  it('analyzeExtractedCopy returns a well-formed report', async () => {
    const report = await analyzeExtractedCopy(fixture)
    expect(report).toBeDefined()
    expect(report!.overallScore).toBeGreaterThanOrEqual(0)
    expect(report!.overallScore).toBeLessThanOrEqual(100)
    expect(typeof report!.summary).toBe('string')
    expect(report!.summary.length).toBeGreaterThan(0)
    expect(Array.isArray(report!.issues)).toBe(true)
    expect(report!.meta.analyzedAt).toBeGreaterThan(0)
  })

  it('parallel analysis nodes each run (all category scores populated, not just one)', async () => {
    const report = await analyzeExtractedCopy(fixture)
    const scores = Object.values(report!.categoryScores)
    expect(scores.every(s => typeof s === 'number')).toBe(true)
    expect(scores).toHaveLength(5)
  })
})
