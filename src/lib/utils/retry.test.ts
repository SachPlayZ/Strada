import { describe, it, expect, vi } from 'vitest'
import { withRetry } from './retry'

describe('withRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const fn = vi.fn(async () => 'ok')
    const out = await withRetry(fn, 3, 1)
    expect(out).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries up to `attempts` times and returns on the final successful attempt', async () => {
    let calls = 0
    const fn = vi.fn(async () => {
      calls++
      if (calls < 3) throw new Error('transient')
      return 'recovered'
    })
    const out = await withRetry(fn, 3, 1)
    expect(out).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws the last error when all attempts fail', async () => {
    const err = new Error('boom')
    const fn = vi.fn(async () => {
      throw err
    })
    await expect(withRetry(fn, 3, 1)).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('uses exponential backoff between attempts', async () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn(async () => {
        throw new Error('x')
      })
      const p = withRetry(fn, 3, 100).catch(() => {})
      // First attempt runs sync; wait for microtasks to flush
      await Promise.resolve()
      expect(fn).toHaveBeenCalledTimes(1)
      // 1st backoff: 2^0 * 100 = 100ms
      await vi.advanceTimersByTimeAsync(100)
      expect(fn).toHaveBeenCalledTimes(2)
      // 2nd backoff: 2^1 * 100 = 200ms
      await vi.advanceTimersByTimeAsync(200)
      expect(fn).toHaveBeenCalledTimes(3)
      await p
    } finally {
      vi.useRealTimers()
    }
  })
})
