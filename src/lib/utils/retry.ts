export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseMs = 400): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, 2 ** i * baseMs))
      }
    }
  }
  throw lastErr
}

export const ESTIMATED_SENTINEL = '__ESTIMATED__'
