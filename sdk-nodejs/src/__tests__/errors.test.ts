import { describe, it, expect } from 'vitest'
import {
  PicoraApiError,
  PicoraNetworkError,
  PicoraRateLimitError,
  isRetryable,
} from '../errors.js'

describe('PicoraApiError', () => {
  it('captures status / code / message / meta / requestId', () => {
    const err = new PicoraApiError(403, 'FORBIDDEN', 'Plan required', { plan: 'pro' }, 'req_123')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('PicoraApiError')
    expect(err.status).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
    expect(err.message).toBe('Plan required')
    expect(err.meta).toEqual({ plan: 'pro' })
    expect(err.requestId).toBe('req_123')
  })
})

describe('PicoraNetworkError', () => {
  it('preserves cause for stack inspection', () => {
    const cause = new Error('ECONNREFUSED')
    const err = new PicoraNetworkError('fetch failed', cause)
    expect(err.cause).toBe(cause)
    expect(err.name).toBe('PicoraNetworkError')
  })
})

describe('PicoraRateLimitError', () => {
  it('extends PicoraApiError with status=429 + retryAfterSec', () => {
    const err = new PicoraRateLimitError('Too Many Requests', 30, 'req_xx')
    expect(err).toBeInstanceOf(PicoraApiError)
    expect(err.status).toBe(429)
    expect(err.code).toBe('RATE_LIMITED')
    expect(err.retryAfterSec).toBe(30)
    expect(err.meta).toEqual({ retryAfterSec: 30 })
    expect(err.requestId).toBe('req_xx')
  })
})

describe('isRetryable', () => {
  it.each([
    [new PicoraRateLimitError('rl', 5), true],
    [new PicoraApiError(500, 'INTERNAL', 'oops'), true],
    [new PicoraApiError(503, 'INTERNAL', 'oops'), true],
    [new PicoraApiError(401, 'UNAUTHORIZED', 'no'), false],
    [new PicoraApiError(422, 'VALIDATION_ERROR', 'bad'), false],
    [new PicoraNetworkError('boom', new Error('ECONNRESET')), true],
    [new Error('plain'), false],
    ['string error', false],
  ] as Array<[unknown, boolean]>)('error → retryable=%s', (err, expected) => {
    expect(isRetryable(err)).toBe(expected)
  })

  it('AbortError network failure not retryable (user-cancelled)', () => {
    const cause = new Error('aborted')
    cause.name = 'AbortError'
    const err = new PicoraNetworkError('timeout', cause)
    expect(isRetryable(err)).toBe(false)
  })
})
