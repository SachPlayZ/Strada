import type { AnalysisSnapshot, Category, NodeResult } from './types'

const SESSION_KEY = 'strada:analysis'

export function makeIdleSnapshot(): AnalysisSnapshot {
  return {
    status: 'idle',
    stage: 'extracting',
    percent: 0,
    detail: '',
    completed: [],
    partial: {},
    updatedAt: Date.now(),
  }
}

/**
 * Reads the current analysis snapshot. Falls back to an idle snapshot if no
 * run has ever happened this browser session. We treat `chrome.storage.session`
 * as authoritative; the popup uses this on every mount before showing any UI.
 */
export async function readSnapshot(): Promise<AnalysisSnapshot> {
  if (!chrome?.storage?.session) return makeIdleSnapshot()
  const result = await chrome.storage.session.get(SESSION_KEY)
  const stored = result?.[SESSION_KEY] as AnalysisSnapshot | undefined
  return stored ?? makeIdleSnapshot()
}

export async function writeSnapshot(snapshot: AnalysisSnapshot): Promise<void> {
  if (!chrome?.storage?.session) return
  await chrome.storage.session.set({ [SESSION_KEY]: snapshot })
}

/**
 * Reads the current snapshot, merges the partial update, stamps `updatedAt`,
 * and writes it back. Returns the new snapshot so callers can broadcast it.
 */
export async function updateSnapshot(patch: Partial<AnalysisSnapshot>): Promise<AnalysisSnapshot> {
  const current = await readSnapshot()
  const next: AnalysisSnapshot = {
    ...current,
    ...patch,
    // Merge maps/lists rather than replace when the patch omits them.
    completed: patch.completed ?? current.completed,
    partial: { ...current.partial, ...(patch.partial ?? {}) },
    updatedAt: Date.now(),
  }
  await writeSnapshot(next)
  return next
}

export async function clearSnapshot(): Promise<AnalysisSnapshot> {
  const idle = makeIdleSnapshot()
  await writeSnapshot(idle)
  return idle
}

export function markNodeComplete(
  snapshot: AnalysisSnapshot,
  category: Category,
  result: NodeResult,
): AnalysisSnapshot {
  const completed = snapshot.completed.includes(category)
    ? snapshot.completed
    : [...snapshot.completed, category]
  return {
    ...snapshot,
    completed,
    partial: { ...snapshot.partial, [category]: result },
    updatedAt: Date.now(),
  }
}
