import { describe, it, expect, vi } from 'vitest'
import { createJwtSession } from '../core/jwt-session.js'
import { createPicoraClient } from '../client.js'
import { PicoraReauthRequiredError } from '../errors.js'

/**
 * 第一方 JWT 会话测试:
 *   ① login 从 Set-Cookie 捕获 refresh_token(getSetCookie 与合并字符串两条路径)
 *   ② refresh 携带 Cookie 头调 /v1/auth/refresh
 *   ③ 业务请求 401 → 自动 refresh → 重试一次成功
 *   ④ refresh 返回 401 → 清会话 + PicoraReauthRequiredError
 *   ⑤ 未 login 直接用 → PicoraReauthRequiredError
 */

/** 构造带 exp claim 的假 JWT(SDK 只解析 payload 不验签) */
function fakeJwt(expiresInSec: number): string {
  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  const header = b64url({ alg: 'HS256', typ: 'JWT' })
  const payload = b64url({ sub: 'u_1', exp: Math.floor(Date.now() / 1000) + expiresInSec })
  return `${header}.${payload}.sig`
}

const sampleUser = {
  id: 'u_1', email: 'x@y.com', nickname: null, avatarUrl: null,
  plan: 'pro', role: 'user', emailVerified: true, createdAt: '',
}

function loginResponse(accessToken: string, setCookie: string | null): Response {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (setCookie !== null) headers.append('Set-Cookie', setCookie)
  return new Response(
    JSON.stringify({ success: true, data: { accessToken, user: sampleUser } }),
    { status: 200, headers },
  )
}

function refreshResponse(accessToken: string): Response {
  return new Response(
    JSON.stringify({ success: true, data: { accessToken, userId: 'u_1', plan: 'pro' } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('JwtSession', () => {
  it('① login captures refresh_token via getSetCookie() and session becomes usable', async () => {
    const jwt = fakeJwt(900)
    const fetchMock = vi.fn().mockResolvedValue(
      loginResponse(jwt, 'refresh_token=rt_abc; Path=/; HttpOnly; Secure; SameSite=Strict'),
    )
    const session = createJwtSession({ fetch: fetchMock })
    const user = await session.login('x@y.com', 'pw')
    expect(user.id).toBe('u_1')
    expect(session.isAuthenticated()).toBe(true)
    // access 未过期:直接复用,不触发 refresh
    expect(await session.getAuthorization()).toBe(`Bearer ${jwt}`)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('①(回退路径)captures refresh_token from merged set-cookie string', async () => {
    const jwt = fakeJwt(900)
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/v1/auth/login')) {
        const res = loginResponse(jwt, null)
        // 模拟老运行时 Headers:无 getSetCookie,仅 get('set-cookie') 合并字符串
        const headers = new Headers(res.headers)
        headers.set('set-cookie', 'other=1; Path=/, refresh_token=rt_merged; Path=/; HttpOnly')
        const patched = new Response(res.body, { status: 200, headers })
        Object.defineProperty(patched.headers, 'getSetCookie', { value: undefined })
        return Promise.resolve(patched)
      }
      if (u.endsWith('/v1/auth/refresh')) {
        const cookie = (init?.headers as Record<string, string>)['Cookie']
        expect(cookie).toBe('refresh_token=rt_merged')
        return Promise.resolve(refreshResponse(fakeJwt(900)))
      }
      throw new Error(`unexpected url ${u}`)
    })
    const session = createJwtSession({ fetch: fetchMock })
    await session.login('x@y.com', 'pw')
    expect(session.isAuthenticated()).toBe(true)
    await session.refresh()   // ② 断言在 mock 内完成(Cookie 头携带捕获值)
    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/v1/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
  })

  it('②③ business 401 → auto refresh (with Cookie header) → retry once', async () => {
    let phase: 'fresh' | 'expired' = 'expired'
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url)
      if (u.endsWith('/v1/auth/login')) {
        return Promise.resolve(loginResponse(fakeJwt(900), 'refresh_token=rt_1; HttpOnly'))
      }
      if (u.endsWith('/v1/auth/refresh')) {
        const cookie = (init?.headers as Record<string, string>)['Cookie']
        expect(cookie).toBe('refresh_token=rt_1')
        phase = 'fresh'
        return Promise.resolve(refreshResponse(fakeJwt(900)))
      }
      // 业务端点:refresh 前一律 401,refresh 后 200
      if (phase === 'expired') {
        return Promise.resolve(jsonResponse({ success: false, error: 'token expired' }, 401))
      }
      return Promise.resolve(jsonResponse({ data: sampleUser }))
    })

    const session = createJwtSession({ fetch: fetchMock })
    await session.login('x@y.com', 'pw')
    const client = createPicoraClient({ session, fetch: fetchMock, retryOnServerError: false })
    const me = await client.auth.me()
    expect(me.id).toBe('u_1')
    const refreshCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/v1/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
  })

  it('④ refresh 401 → session cleared + PicoraReauthRequiredError', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.endsWith('/v1/auth/login')) {
        // access 已过期(exp 在过去)→ 下次取授权必然走 refresh
        return Promise.resolve(loginResponse(fakeJwt(-10), 'refresh_token=rt_dead; HttpOnly'))
      }
      return Promise.resolve(jsonResponse({ success: false, error: 'refresh expired' }, 401))
    })
    const session = createJwtSession({ fetch: fetchMock })
    await session.login('x@y.com', 'pw')
    await expect(session.getAuthorization()).rejects.toBeInstanceOf(PicoraReauthRequiredError)
    expect(session.isAuthenticated()).toBe(false)
  })

  it('⑤ getAuthorization before login → PicoraReauthRequiredError', async () => {
    const session = createJwtSession({ fetch: vi.fn() })
    await expect(session.getAuthorization()).rejects.toBeInstanceOf(PicoraReauthRequiredError)
  })

  it('logout revokes server-side (best effort) and clears local state', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const u = String(url)
      if (u.endsWith('/v1/auth/login')) {
        return Promise.resolve(loginResponse(fakeJwt(900), 'refresh_token=rt_x; HttpOnly'))
      }
      if (u.endsWith('/v1/auth/logout')) {
        return Promise.resolve(new Response(null, { status: 204 }))
      }
      throw new Error(`unexpected url ${u}`)
    })
    const session = createJwtSession({ fetch: fetchMock })
    await session.login('x@y.com', 'pw')
    await session.logout()
    expect(session.isAuthenticated()).toBe(false)
    const logoutCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/v1/auth/logout'))
    expect(logoutCalls).toHaveLength(1)
  })
})
