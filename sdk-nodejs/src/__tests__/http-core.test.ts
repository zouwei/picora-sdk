import { describe, it, expect, vi } from 'vitest'
import { createHttpCore, type HttpConfig } from '../core/http.js'
import { StaticTokenProvider } from '../core/auth-provider.js'
import { PicoraApiError } from '../errors.js'
import { normalizePage, paginateAll } from '../core/pagination.js'
import { toFormData } from '../core/multipart.js'
import type { PaginatedResponse } from '../types/index.js'

/**
 * http core 专项测试(client.test.ts 覆盖 'data' 模式与重试矩阵,此处补:
 * 五种响应形态 / headers 合并 / retry:false / 原始 body 透传)+ 分页归一 + multipart。
 */

function cfg(fetchImpl: typeof fetch, overrides?: Partial<HttpConfig>): HttpConfig {
  return {
    baseUrl: 'https://api.example.com',
    timeout: 30_000,
    fetch: fetchImpl,
    retryOnRateLimit: true,
    retryOnServerError: true,
    userAgent: 'test-ua',
    debug: false,
    ...overrides,
  }
}

const auth = new StaticTokenProvider('sk_live_x')

describe('http core — response modes', () => {
  it("'bare' returns raw JSON without {data} unwrapping", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ access_token: 'at', token_type: 'Bearer' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    const http = createHttpCore(cfg(fetchMock), auth)
    const out = await http.request<{ access_token: string }>({
      method: 'POST', path: '/oauth/token', response: 'bare',
    })
    expect(out.access_token).toBe('at')
  })

  it("'bare' error mode maps RFC 6749 error slug to code", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'invalid_grant', error_description: 'revoked' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    ))
    const http = createHttpCore(cfg(fetchMock), auth)
    await expect(http.request({ method: 'POST', path: '/oauth/token', response: 'bare' }))
      .rejects.toMatchObject({ code: 'invalid_grant', message: 'revoked', status: 400 })
  })

  it("'text' returns markdown body as string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      '# Hello\n\nworld', { status: 200, headers: { 'Content-Type': 'text/markdown' } },
    ))
    const http = createHttpCore(cfg(fetchMock), auth)
    const text = await http.request<string>({ method: 'GET', path: '/v1/docs/d1/raw', response: 'text' })
    expect(text).toBe('# Hello\n\nworld')
  })

  it("'raw' returns Response for 2xx/3xx (headers readable), throws for 4xx", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { 'Upload-Offset': '1024' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ success: false, error: 'nope' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ))
    const http = createHttpCore(cfg(fetchMock, { retryOnServerError: false }), auth)

    const head = await http.request<Response>({ method: 'HEAD', path: '/v1/uploads/u1', response: 'raw' })
    expect(head.headers.get('Upload-Offset')).toBe('1024')

    const notModified = await http.request<Response>({ method: 'GET', path: '/v1/kbs/k1/manifest', response: 'raw' })
    expect(notModified.status).toBe(304)

    await expect(http.request({ method: 'GET', path: '/v1/uploads/u2', response: 'raw' }))
      .rejects.toBeInstanceOf(PicoraApiError)
  })

  it("'none' ignores body and resolves undefined", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok-ish text', { status: 200 }))
    const http = createHttpCore(cfg(fetchMock), auth)
    await expect(http.request({ method: 'POST', path: '/oauth/revoke', response: 'none' }))
      .resolves.toBeUndefined()
  })
})

describe('http core — headers & body passthrough', () => {
  it('merges custom headers (TUS protocol headers) after defaults', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const http = createHttpCore(cfg(fetchMock), auth)
    await http.request({
      method: 'PATCH',
      path: '/v1/uploads/u1',
      body: new Uint8Array([1, 2, 3]),
      headers: { 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': '0', 'Tus-Resumable': '1.0.0' },
      response: 'raw',
      retry: false,
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/offset+octet-stream')
    expect(headers['Tus-Resumable']).toBe('1.0.0')
    expect(headers['Authorization']).toBe('Bearer sk_live_x')
    expect(init.body).toBeInstanceOf(Uint8Array)
  })

  it('URLSearchParams body passes through without JSON Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    const http = createHttpCore(cfg(fetchMock), auth)
    await http.request({
      method: 'POST', path: '/oauth/token',
      body: new URLSearchParams({ grant_type: 'refresh_token' }),
      response: 'bare',
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()   // fetch 对 URLSearchParams 自动设 form-urlencoded
    expect(init.body).toBeInstanceOf(URLSearchParams)
  })

  it('retry:false disables 5xx auto retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: false, error: 'boom' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    ))
    const http = createHttpCore(cfg(fetchMock), auth)
    await expect(http.request({ method: 'PATCH', path: '/v1/uploads/u1', retry: false }))
      .rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('pagination helpers', () => {
  it('normalizePage maps alternate array keys and derives hasMore', () => {
    const page = normalizePage<{ id: string }>({ images: [{ id: 'a' }], nextCursor: 'c1' }, 'images')
    expect(page.items).toEqual([{ id: 'a' }])
    expect(page.nextCursor).toBe('c1')
    expect(page.hasMore).toBe(true)
    const last = normalizePage<{ id: string }>({ images: [], nextCursor: null }, 'images')
    expect(last.hasMore).toBe(false)
  })

  it('paginateAll walks all pages lazily and terminates on null cursor', async () => {
    const pages: Record<string, PaginatedResponse<number>> = {
      start: { items: [1, 2], nextCursor: 'p2', hasMore: true },
      p2: { items: [3], nextCursor: null, hasMore: false },
    }
    const list = vi.fn(async (params: { cursor?: string }) => pages[params.cursor ?? 'start'] as PaginatedResponse<number>)
    const seen: number[] = []
    for await (const n of paginateAll(list, {})) seen.push(n)
    expect(seen).toEqual([1, 2, 3])
    expect(list).toHaveBeenCalledTimes(2)
  })
})

describe('multipart helper', () => {
  it('toFormData wraps Uint8Array with filename + extra fields, no manual Content-Type', () => {
    const form = toFormData('file', { file: new Uint8Array([104, 105]), filename: 'a.png', contentType: 'image/png' }, {
      isPublic: true, skipMe: undefined,
    })
    const file = form.get('file')
    expect(file).toBeInstanceOf(Blob)
    expect((file as File).name).toBe('a.png')
    expect((file as Blob).type).toBe('image/png')
    expect(form.get('isPublic')).toBe('true')
    expect(form.get('skipMe')).toBeNull()
  })
})
