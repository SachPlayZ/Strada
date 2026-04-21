import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnalysisStateType } from './state'
import type { ExtractedCopy, Issue, NodeResult } from '../types'

vi.mock('../llm', () => ({
  createLLM: () => {
    throw new Error('LLM disabled in aggregator unit tests — forces deterministic fallback summary')
  },
}))

import { aggregatorNode } from './nodes/aggregator'

const extracted: ExtractedCopy = {
  url: 'https://example.com',
  title: 'Example',
  headlines: ['Hello'],
  ctas: ['Sign up'],
  valueProps: ['Best product ever'],
  bodyText: 'Lorem ipsum dolor sit amet.',
  extractedAt: 1_700_000_000_000,
}

function issue(
  partial: Partial<Issue> & Pick<Issue, 'id' | 'category' | 'severity' | 'originalText'>,
): Issue {
  return {
    problem: 'problem',
    suggestion: 'suggestion',
    ...partial,
  }
}

function result(score: number, issues: Issue[]): NodeResult {
  return { issues, categoryScore: score, rationale: 'test' }
}

function baseState(partial: Partial<AnalysisStateType> = {}): AnalysisStateType {
  return {
    extracted,
    valueProp: undefined,
    cta: undefined,
    jargon: undefined,
    tone: undefined,
    readability: undefined,
    report: undefined,
    ...partial,
  }
}

describe('aggregatorNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('produces a report with weighted overall score from all categories', async () => {
    const out = await aggregatorNode(
      baseState({
        valueProp: result(100, []),
        cta: result(100, []),
        jargon: result(100, []),
        tone: result(100, []),
        readability: result(100, []),
      }),
    )

    expect(out.report).toBeDefined()
    expect(out.report!.overallScore).toBe(100)
    expect(out.report!.categoryScores).toEqual({
      value_prop: 100,
      cta: 100,
      readability: 100,
      tone: 100,
      jargon: 100,
    })
    expect(out.report!.meta.url).toBe(extracted.url)
    expect(out.report!.meta.title).toBe(extracted.title)
    expect(out.report!.meta.estimatedCategories).toEqual([])
  })

  it('falls back to a deterministic summary when the LLM throws', async () => {
    const out = await aggregatorNode(
      baseState({
        valueProp: result(80, [
          issue({
            id: 'v1',
            category: 'value_prop',
            severity: 'high',
            originalText: 'Generic tagline',
          }),
        ]),
        cta: result(70, []),
        jargon: result(60, []),
        tone: result(90, []),
        readability: result(75, []),
      }),
    )

    expect(out.report!.summary).toMatch(/Overall copy score:/)
    expect(out.report!.summary).toMatch(/1 high-severity issues/)
  })

  it('dedupes near-duplicate issues within a category via Jaccard similarity', async () => {
    const originalA = 'Sign up today to get started with our platform instantly'
    // Near-duplicate: same tokens, one extra filler word -> Jaccard >= 0.85
    const originalB = 'Sign up today to get started with our platform instantly now'
    const originalC = 'Contact sales for enterprise pricing information'

    const out = await aggregatorNode(
      baseState({
        valueProp: result(50, []),
        cta: result(50, [
          issue({ id: '1', category: 'cta', severity: 'high', originalText: originalA }),
          issue({ id: '2', category: 'cta', severity: 'medium', originalText: originalB }),
          issue({ id: '3', category: 'cta', severity: 'low', originalText: originalC }),
        ]),
        jargon: result(50, []),
        tone: result(50, []),
        readability: result(50, []),
      }),
    )

    const issues = out.report!.issues
    expect(issues).toHaveLength(2)
    const texts = issues.map(i => i.originalText)
    expect(texts).toContain(originalA)
    expect(texts).toContain(originalC)
    expect(texts).not.toContain(originalB)
  })

  it('keeps near-duplicates when they are in different categories', async () => {
    const text = 'Click here to learn more about our amazing product today'
    const out = await aggregatorNode(
      baseState({
        valueProp: result(50, [
          issue({ id: 'v', category: 'value_prop', severity: 'medium', originalText: text }),
        ]),
        cta: result(50, [
          issue({ id: 'c', category: 'cta', severity: 'medium', originalText: text }),
        ]),
        jargon: result(50, []),
        tone: result(50, []),
        readability: result(50, []),
      }),
    )

    expect(out.report!.issues).toHaveLength(2)
  })

  it('sorts by severity first then by category weight', async () => {
    const out = await aggregatorNode(
      baseState({
        valueProp: result(50, [
          issue({
            id: 'vp-low',
            category: 'value_prop',
            severity: 'low',
            originalText: 'low sev VP item',
          }),
          issue({
            id: 'vp-high',
            category: 'value_prop',
            severity: 'high',
            originalText: 'high sev VP item',
          }),
        ]),
        cta: result(50, [
          issue({
            id: 'cta-high',
            category: 'cta',
            severity: 'high',
            originalText: 'high sev CTA item',
          }),
          issue({
            id: 'cta-med',
            category: 'cta',
            severity: 'medium',
            originalText: 'medium sev CTA item',
          }),
        ]),
        jargon: result(50, [
          issue({
            id: 'jrg-high',
            category: 'jargon',
            severity: 'high',
            originalText: 'high sev jargon item',
          }),
        ]),
        tone: result(50, []),
        readability: result(50, []),
      }),
    )

    const ids = out.report!.issues.map(i => i.id)
    // Every 'high' must precede every 'medium' which must precede every 'low'.
    const bySeverity = (id: string) => out.report!.issues.find(i => i.id === id)!.severity
    for (let i = 0; i < ids.length - 1; i++) {
      const a = bySeverity(ids[i])
      const b = bySeverity(ids[i + 1])
      const rank = (s: string) => (s === 'high' ? 0 : s === 'medium' ? 1 : 2)
      expect(rank(a)).toBeLessThanOrEqual(rank(b))
    }

    // Within the 'high' tier: value_prop (w=0.3) > cta (w=0.25) > jargon (w=0.1).
    const highIds = ids.filter(id => bySeverity(id) === 'high')
    expect(highIds).toEqual(['vp-high', 'cta-high', 'jrg-high'])
  })

  it('defaults missing node results to score 50 and marks them as estimated', async () => {
    const out = await aggregatorNode(baseState({}))
    expect(out.report!.categoryScores).toEqual({
      value_prop: 50,
      cta: 50,
      readability: 50,
      tone: 50,
      jargon: 50,
    })
    expect(out.report!.overallScore).toBe(50)
    expect(out.report!.issues).toHaveLength(0)
    expect(out.report!.meta.estimatedCategories.sort()).toEqual(
      ['cta', 'jargon', 'readability', 'tone', 'value_prop'].sort(),
    )
  })

  it('flags categories whose node returned the ESTIMATED sentinel', async () => {
    const out = await aggregatorNode(
      baseState({
        valueProp: result(80, []),
        cta: { issues: [], categoryScore: 50, rationale: '__ESTIMATED__' },
        jargon: result(70, []),
        tone: { issues: [], categoryScore: 50, rationale: '__ESTIMATED__' },
        readability: result(75, []),
      }),
    )
    expect(out.report!.meta.estimatedCategories.sort()).toEqual(['cta', 'tone'].sort())
  })
})
