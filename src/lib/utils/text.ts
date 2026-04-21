import type { Issue } from '../types'

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function truncateChars(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars)
}

export function countSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!cleaned) return 0
  if (cleaned.length <= 3) return 1
  const vowelGroups = cleaned.replace(/e$/, '').match(/[aeiouy]+/g)
  return Math.max(1, vowelGroups ? vowelGroups.length : 1)
}

export function fleschKincaidGrade(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = text.split(/\s+/).filter(w => w.length > 0)
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0)

  if (sentences.length === 0 || words.length === 0) return 0

  return 0.39 * (words.length / sentences.length) + 11.8 * (syllables / words.length) - 15.59
}

export function fleschReadingEase(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0)
  const words = text.split(/\s+/).filter(w => w.length > 0)
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0)

  if (sentences.length === 0 || words.length === 0) return 0

  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length)
}

export function dedupeIssues(issues: Issue[]): Issue[] {
  const seen = new Set<string>()
  return issues.filter(issue => {
    const key = `${issue.category}|${issue.originalText.slice(0, 60)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
