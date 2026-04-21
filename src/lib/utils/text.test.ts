import { describe, it, expect } from 'vitest'
import {
  countSyllables,
  fleschKincaidGrade,
  fleschReadingEase,
  normalizeWhitespace,
  truncateChars,
  dedupeIssues,
} from './text'
import type { Issue } from '../types'

describe('countSyllables', () => {
  it('counts 1 for short words', () => {
    expect(countSyllables('cat')).toBe(1)
    expect(countSyllables('the')).toBe(1)
    expect(countSyllables('a')).toBe(1)
  })

  it('drops trailing silent e', () => {
    expect(countSyllables('make')).toBe(1)
    expect(countSyllables('time')).toBe(1)
  })

  it('counts multi-syllable words', () => {
    expect(countSyllables('beautiful')).toBe(3)
    expect(countSyllables('readability')).toBeGreaterThanOrEqual(4)
    expect(countSyllables('computer')).toBe(3)
  })

  it('handles empty / non-alpha input', () => {
    expect(countSyllables('')).toBe(0)
    expect(countSyllables('123')).toBe(0)
    expect(countSyllables('!!!')).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(countSyllables('BEAUTIFUL')).toBe(countSyllables('beautiful'))
  })
})

describe('fleschKincaidGrade', () => {
  it('matches the canonical "cat sat on the mat" benchmark (~-1.4)', () => {
    const grade = fleschKincaidGrade('The cat sat on the mat.')
    expect(grade).toBeGreaterThan(-1.6)
    expect(grade).toBeLessThan(-1.3)
  })

  it('returns a higher grade for complex academic prose than simple text', () => {
    const simple = fleschKincaidGrade('The dog ran. The cat sat. We had fun.')
    const complex = fleschKincaidGrade(
      'The indefatigable bureaucratic infrastructure systematically perpetuates institutional inefficiencies throughout multinational organizations.',
    )
    expect(complex).toBeGreaterThan(simple)
  })

  it('returns 0 for empty text', () => {
    expect(fleschKincaidGrade('')).toBe(0)
    expect(fleschKincaidGrade('   ')).toBe(0)
  })
})

describe('fleschReadingEase', () => {
  it('matches the canonical "cat sat on the mat" benchmark (~116)', () => {
    const ease = fleschReadingEase('The cat sat on the mat.')
    expect(ease).toBeGreaterThan(115)
    expect(ease).toBeLessThan(117)
  })

  it('returns a lower ease score for complex prose than simple text', () => {
    const simple = fleschReadingEase('The dog ran. The cat sat. We had fun.')
    const complex = fleschReadingEase(
      'The indefatigable bureaucratic infrastructure systematically perpetuates institutional inefficiencies throughout multinational organizations.',
    )
    expect(simple).toBeGreaterThan(complex)
  })

  it('returns 0 for empty text', () => {
    expect(fleschReadingEase('')).toBe(0)
  })
})

describe('normalizeWhitespace', () => {
  it('collapses runs of whitespace and trims', () => {
    expect(normalizeWhitespace('  hello\n\tworld   ')).toBe('hello world')
  })
})

describe('truncateChars', () => {
  it('returns the text unchanged when under the limit', () => {
    expect(truncateChars('hi', 10)).toBe('hi')
  })

  it('truncates text that exceeds the limit', () => {
    expect(truncateChars('abcdefghij', 5)).toBe('abcde')
  })
})

describe('dedupeIssues', () => {
  it('removes issues with the same category + original text prefix', () => {
    const issues: Issue[] = [
      {
        id: '1',
        category: 'cta',
        severity: 'high',
        originalText: 'Click here to get started now',
        problem: 'Generic CTA',
        suggestion: 'Be specific',
      },
      {
        id: '2',
        category: 'cta',
        severity: 'medium',
        originalText: 'Click here to get started now',
        problem: 'Duplicate',
        suggestion: 'Skip',
      },
      {
        id: '3',
        category: 'tone',
        severity: 'low',
        originalText: 'Click here to get started now',
        problem: 'Different category keeps it',
        suggestion: 'Keep',
      },
    ]
    const out = dedupeIssues(issues)
    expect(out).toHaveLength(2)
    expect(out.map(i => i.id).sort()).toEqual(['1', '3'])
  })
})
