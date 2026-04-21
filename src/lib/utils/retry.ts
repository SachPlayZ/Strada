export const ESTIMATED_SENTINEL = '__ESTIMATED__'

export interface RetryOptions {
  attempts?: number
  baseMs?: number
  /** Per-attempt timeout. Aborts the pending call and counts as a failure. */
  timeoutMs?: number
  /** Label used in retry logs. */
  label?: string
}

export class TimeoutError extends Error {
  constructor(ms: number, label?: string) {
    super(`${label ?? 'operation'} timed out after ${ms}ms`)
    this.name = 'TimeoutError'
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(ms, label)), ms)
    promise.then(
      v => {
        clearTimeout(t)
        resolve(v)
      },
      e => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 2, baseMs = 400, timeoutMs = 30_000, label = 'llm' } = options
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(fn(), timeoutMs, label)
    } catch (e) {
      lastErr = e
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[Strada/retry] ${label} attempt ${i + 1}/${attempts} failed: ${msg}`)
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 2 ** i * baseMs))
      }
    }
  }
  throw lastErr
}
