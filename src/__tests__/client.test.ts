import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client'
import {
  PicoraApiError,
  PicoraNetworkError,
  PicoraRateLimitError,
} from '../errors'
import type { Image, PaginatedResponse, User } from '../types'

/**
 * `@picora/sdk` client 测试。
 *
 * 通过注入 `options.fetch` mock 网络层，验证：
 *   ① 配置规范化（apiKey / oauthToken 互斥；缺失抛错）
 *   ② Authorization + User-Agent 头注入
 *   ③ 路径与 query string 拼接正确
 *   ④ success body { data: ... } 拆封
 *   ⑤ 4xx → PicoraApiError，5xx → PicoraApiError，429 → PicoraRateLimitError
 *   ⑥ 自动重试：429 三次指数退避（实际等待用 fake timer 校验）
 *   ⑦ 5xx 重试 2 次后抛
 *   ⑧ retryOnRateLimit:false → 立即抛
 *   ⑨ 网络故障 → PicoraNetworkError
 *   ⑩ 204 No Content → resolve undefined
 */

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

describe('createPicoraClient — config normalization', () => {
  it('throws when neither apiKey nor oauthToken provided', () => {
    expect(() => createPicoraClient({ fetch: vi.fn() } as unknown as Parameters<typeof createPicoraClient>[0]))
      .toThrow(/either apiKey or oauthToken/i)
  })

  it('throws when both apiKey and oauthToken provided', () => {
    expect(() => createPicoraClient({
      apiKey: 'sk_live_x',
      oauthToken: 'oauth_y',
      fetch: vi.fn(),
    })).toThrow(/mutually exclusive/i)
  })

  it('throws when fetch is not available', () => {
    const originalFetch = globalThis.fetch
    // @ts-expect-error — temporarily remove
    delete globalThis.fetch
    try {
      expect(() => createPicoraClient({ apiKey: 'sk_live_x' })).toThrow(/fetch is not available/i)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('createPicoraClient — request shaping', () => {
  it('injects Authorization + User-Agent on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'u1' } }))
    const client = createPicoraClient({
      apiKey: 'sk_live_test',
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
      userAgent: 'MyApp/1.0',
    })
    await client.auth.me()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk_live_test')
    expect(headers['User-Agent']).toBe('MyApp/1.0 @picora/sdk/0.2.0')
  })

  it('builds query string from list params and unwraps {data} envelope', async () => {
    const payload: PaginatedResponse<Image> = {
      items: [],
      nextCursor: null,
      hasMore: false,
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: payload }))
    const client = createPicoraClient({
      apiKey: 'sk_live_test',
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    })
    const result = await client.images.list({ pageSize: 20, isPublic: true, tag: 'cats' })
    expect(result).toEqual(payload)
    const calledUrl = String(fetchMock.mock.calls[0]?.[0])
    expect(calledUrl).toContain('/v1/images')
    expect(calledUrl).toContain('pageSize=20')
    expect(calledUrl).toContain('isPublic=true')
    expect(calledUrl).toContain('tag=cats')
  })

  it('204 No Content resolves to undefined (used for DELETE)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(204))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await expect(client.images.delete('img_1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/images/img_1')
  })

  it('encodeURIComponent applied to path params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'x' } }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.images.get('img with spaces/and-slash')
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('img%20with%20spaces%2Fand-slash')
  })
})

describe('createPicoraClient — error mapping', () => {
  it('401 → PicoraApiError(code=UNAUTHORIZED)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Invalid token' }, 401, { 'X-Request-Id': 'req_a' }),
    )
    const client = createPicoraClient({ apiKey: 'sk_live_bad', fetch: fetchMock, retryOnServerError: false })
    await expect(client.auth.me()).rejects.toMatchObject({
      name: 'PicoraApiError',
      status: 401,
      code: 'UNAUTHORIZED',
      requestId: 'req_a',
    })
  })

  it('422 with explicit code → preserves server-provided code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Bad input', code: 'VALIDATION_FAILED' }, 422),
    )
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock, retryOnServerError: false })
    await expect(client.auth.me()).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  })

  it('429 → PicoraRateLimitError with retryAfterSec from Retry-After header', async () => {
    // 单次 429 + retryOnRateLimit=false 立即抛
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Too many' }, 429, { 'Retry-After': '7' }),
    )
    const client = createPicoraClient({
      apiKey: 'sk_live_x', fetch: fetchMock, retryOnRateLimit: false, retryOnServerError: false,
    })
    await expect(client.auth.me()).rejects.toMatchObject({
      name: 'PicoraRateLimitError',
      status: 429,
      retryAfterSec: 7,
    })
  })

  it('500 → PicoraApiError(status=500)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'oops' }, 500),
    )
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock, retryOnServerError: false })
    await expect(client.auth.me()).rejects.toMatchObject({ status: 500 })
  })

  it('network failure (fetch reject) → PicoraNetworkError', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNRESET'))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock, retryOnServerError: false })
    const promise = client.auth.me()
    await expect(promise).rejects.toBeInstanceOf(PicoraNetworkError)
  })
})

describe('createPicoraClient — auto retry', () => {
  it('429 retried up to 3 times then thrown', async () => {
    vi.useFakeTimers()
    try {
      // 每次调用返回新 Response 实例，避免 body re-read 报错
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(jsonResponse({ success: false, error: 'rate' }, 429, { 'Retry-After': '0' })),
      )
      const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
      // 提前挂上 catch 收集结果，避免 fake timers 推进期间 V8 报 unhandled rejection
      const collected = client.auth.me().then(
        (v) => ({ ok: true as const, value: v }),
        (e: unknown) => ({ ok: false as const, error: e }),
      )
      await vi.runAllTimersAsync()
      const result = await collected
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.error).toBeInstanceOf(PicoraRateLimitError)
      expect(fetchMock).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('429 succeeds on 2nd attempt → returns data', async () => {
    vi.useFakeTimers()
    try {
      const sample: User = {
        id: 'u_1', email: 'x@y.com', nickname: null, avatarUrl: null,
        plan: 'pro', role: 'user', emailVerified: true, createdAt: '',
      }
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ success: false, error: 'rl' }, 429, { 'Retry-After': '0' }))
        .mockResolvedValueOnce(jsonResponse({ data: sample }))
      const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
      const collected = client.auth.me().then(
        (v) => ({ ok: true as const, value: v }),
        (e: unknown) => ({ ok: false as const, error: e }),
      )
      await vi.runAllTimersAsync()
      const result = await collected
      expect(result.ok).toBe(true)
      expect(result.ok && result.value).toEqual(sample)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('5xx retried up to 2 times then thrown', async () => {
    vi.useFakeTimers()
    try {
      const fetchMock = vi.fn().mockImplementation(() =>
        Promise.resolve(jsonResponse({ success: false, error: 'oops' }, 503)),
      )
      const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
      const collected = client.auth.me().then(
        (v) => ({ ok: true as const, value: v }),
        (e: unknown) => ({ ok: false as const, error: e }),
      )
      await vi.runAllTimersAsync()
      const result = await collected
      expect(result.ok).toBe(false)
      expect(result.ok === false && result.error).toBeInstanceOf(PicoraApiError)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('retryOnRateLimit:false → 429 thrown immediately', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'rl' }, 429),
    )
    const client = createPicoraClient({
      apiKey: 'sk_live_x', fetch: fetchMock, retryOnRateLimit: false, retryOnServerError: false,
    })
    await expect(client.auth.me()).rejects.toBeInstanceOf(PicoraRateLimitError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('createPicoraClient — namespaces', () => {
  it('apps.list calls GET /v1/me/apps', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [] }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.apps.list()
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/me/apps')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET')
  })

  it('apps.revoke calls DELETE /v1/me/apps/:clientId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(204))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.apps.revoke('mw_picora')
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/me/apps/mw_picora')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('auth.subscription calls GET /v1/me/subscription', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      data: {
        plan: 'pro', planName: 'pro',
        features: { video_enabled: true, kb_enabled: true, custom_domain: false, api_keys_max: 3 },
        limits: { img_storage_bytes: 0, img_bandwidth_bytes: 0, media_storage_bytes: 0, media_bandwidth_bytes: 0, doc_count_limit: 0, kb_count_limit: 0 },
        trialActivated: true, currentPeriodEnd: null, cachedAt: '',
      },
    }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const sub = await client.auth.subscription()
    expect(sub.plan).toBe('pro')
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/me/subscription')
  })
})
