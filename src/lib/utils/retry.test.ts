import { describe, it, expect, vi } from 'vitest'
import { withRetry, TimeoutError } from './retry'

describe('withRetry', () => {
  it('returns the first successful result without retrying', async () => {
    const fn = vi.fn(async () => 'ok')
    const out = await withRetry(fn, { attempts: 3, baseMs: 1 })
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
    const out = await withRetry(fn, { attempts: 3, baseMs: 1 })
    expect(out).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('throws the last error when all attempts fail', async () => {
    const err = new Error('boom')
    const fn = vi.fn(async () => {
      throw err
    })
    await expect(withRetry(fn, { attempts: 3, baseMs: 1 })).rejects.toBe(err)
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('uses exponential backoff between attempts', async () => {
    vi.useFakeTimers()
    try {
      const fn = vi.fn(async () => {
        throw new Error('x')
      })
      const p = withRetry(fn, { attempts: 3, baseMs: 100, timeoutMs: 1_000_000 }).catch(() => {})
      await Promise.resolve()
      expect(fn).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(100)
      expect(fn).toHaveBeenCalledTimes(2)
      await vi.advanceTimersByTimeAsync(200)
      expect(fn).toHaveBeenCalledTimes(3)
      await p
    } finally {
      vi.useRealTimers()
    }
  })

  it('times out a stuck attempt and retries', async () => {
    let callNo = 0
    const fn = vi.fn(async () => {
      callNo++
      if (callNo === 1) await new Promise(() => {}) // hangs — should be aborted
      return 'ok'
    })
    await expect(withRetry(fn, { attempts: 2, baseMs: 1, timeoutMs: 20 })).resolves.toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws TimeoutError when all attempts hang', async () => {
    const fn = vi.fn(async () => {
      await new Promise(() => {})
    })
    await expect(withRetry(fn, { attempts: 2, baseMs: 1, timeoutMs: 15 })).rejects.toBeInstanceOf(
      TimeoutError,
    )
  })
})
