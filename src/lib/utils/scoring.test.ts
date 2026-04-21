import { describe, it, expect } from 'vitest'
import { weightedOverall, severityRank } from './scoring'
import type { Category } from '../types'

function scores(partial: Partial<Record<Category, number>>): Record<Category, number> {
  return {
    value_prop: 50,
    cta: 50,
    readability: 50,
    tone: 50,
    jargon: 50,
    ...partial,
  }
}

describe('weightedOverall', () => {
  it('returns 50 when all categories are 50', () => {
    expect(
      weightedOverall({
        value_prop: 50,
        cta: 50,
        readability: 50,
        tone: 50,
        jargon: 50,
      }),
    ).toBe(50)
  })

  it('returns 100 when all categories are 100', () => {
    expect(
      weightedOverall({
        value_prop: 100,
        cta: 100,
        readability: 100,
        tone: 100,
        jargon: 100,
      }),
    ).toBe(100)
  })

  it('returns 0 when all categories are 0', () => {
    expect(
      weightedOverall({
        value_prop: 0,
        cta: 0,
        readability: 0,
        tone: 0,
        jargon: 0,
      }),
    ).toBe(0)
  })

  it('computes hand-rolled mixed case correctly', () => {
    // weights: value_prop=0.3, cta=0.25, readability=0.2, tone=0.15, jargon=0.1
    // 100*0.3 + 50*0.25 + 80*0.2 + 60*0.15 + 40*0.1
    // = 30 + 12.5 + 16 + 9 + 4 = 71.5 -> rounds to 72
    expect(
      weightedOverall({
        value_prop: 100,
        cta: 50,
        readability: 80,
        tone: 60,
        jargon: 40,
      }),
    ).toBe(72)
  })

  it('gives the most weight to value_prop', () => {
    const onlyVP = weightedOverall(scores({ value_prop: 100 }))
    const onlyCTA = weightedOverall(scores({ cta: 100 }))
    const onlyJargon = weightedOverall(scores({ jargon: 100 }))
    expect(onlyVP).toBeGreaterThan(onlyCTA)
    expect(onlyCTA).toBeGreaterThan(onlyJargon)
  })

  it('defaults missing categories to 50', () => {
    // @ts-expect-error intentionally incomplete to exercise fallback
    expect(weightedOverall({})).toBe(50)
  })
})

describe('severityRank', () => {
  it('orders high < medium < low', () => {
    expect(severityRank('high')).toBeLessThan(severityRank('medium'))
    expect(severityRank('medium')).toBeLessThan(severityRank('low'))
  })

  it('high is rank 0 for sort stability', () => {
    expect(severityRank('high')).toBe(0)
  })
})
