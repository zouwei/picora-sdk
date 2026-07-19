import { describe, it, expect, vi } from 'vitest'
import { createOAuthTokenProvider } from '../core/oauth-session.js'
import { MemoryTokenStorage, type DeviceFlowToken, type TokenStorage } from '../device-flow.js'
import { PicoraReauthRequiredError } from '../errors.js'
import { createPicoraClient } from '../client.js'

/**
 * OAuth 自动刷新会话测试。核心不变式:
 *   ① single-flight:并发多个 401 只触发一次真实 refresh
 *   ② 旋转安全:storage.put 失败 → 抛错,绝不返回新 access(防旧 refresh 重放吊销整链)
 *   ③ invalid_grant → storage.clear + PicoraReauthRequiredError(终态)
 *   ④ skew 预刷新:临近过期先续期再发业务请求
 */

const nowSec = () => Math.floor(Date.now() / 1000)

function validToken(overrides?: Partial<DeviceFlowToken>): DeviceFlowToken {
  return {
    accessToken: 'at_old',
    refreshToken: 'rt_old',
    tokenType: 'Bearer',
    expiresAt: nowSec() + 3600,
    scopes: ['kb.read'],
    ...overrides,
  }
}

function tokenResponse(access: string, refresh: string): Response {
  return new Response(
    JSON.stringify({
      access_token: access,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refresh,
      scope: 'kb.read',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('OAuthTokenProvider', () => {
  it('④ returns stored access token when far from expiry (no refresh call)', async () => {
    const storage = new MemoryTokenStorage()
    await storage.put(validToken())
    const fetchMock = vi.fn()
    const provider = createOAuthTokenProvider({ clientId: 'app', storage, fetch: fetchMock })
    expect(await provider.getAuthorization()).toBe('Bearer at_old')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('④ proactively refreshes when within skew window and persists rotated pair', async () => {
    const storage = new MemoryTokenStorage()
    await storage.put(validToken({ expiresAt: nowSec() + 10 }))   // 10s < 默认 skew 300s
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse('at_new', 'rt_new'))
    const provider = createOAuthTokenProvider({ clientId: 'app', storage, fetch: fetchMock })
    expect(await provider.getAuthorization()).toBe('Bearer at_new')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('grant_type=refresh_token')
    expect(body).toContain('refresh_token=rt_old')
    // 旋转后的新 refresh 已持久化
    const stored = await storage.get()
    expect(stored?.refreshToken).toBe('rt_new')
    expect(stored?.accessToken).toBe('at_new')
  })

  it('① single-flight: concurrent 401s trigger exactly one refresh', async () => {
    const storage = new MemoryTokenStorage()
    await storage.put(validToken())

    let refreshCalls = 0
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).endsWith('/oauth/token')) {
        refreshCalls += 1
        return Promise.resolve(tokenResponse('at_new', 'rt_new'))
      }
      // 业务请求:旧 token 401,新 token 200
      const authHeader = (init?.headers as Record<string, string>)?.['Authorization']
      if (authHeader === 'Bearer at_new') {
        return Promise.resolve(jsonResponse({ data: { ok: true } }))
      }
      return Promise.resolve(jsonResponse({ success: false, error: 'expired' }, 401))
    })

    const provider = createOAuthTokenProvider({ clientId: 'app', storage, fetch: fetchMock })
    const client = createPicoraClient({ session: provider, fetch: fetchMock, retryOnServerError: false })
    // 三个并发请求同时遭遇 401
    const results = await Promise.all([
      client.auth.me(), client.auth.me(), client.auth.me(),
    ])
    expect(results).toHaveLength(3)
    expect(refreshCalls).toBe(1)
  })

  it('② storage.put failure → throws, does NOT hand out new access token', async () => {
    const puts: DeviceFlowToken[] = []
    const storage: TokenStorage = {
      get: async () => validToken({ expiresAt: nowSec() + 10 }),
      put: async (t) => { puts.push(t); throw new Error('disk full') },
      clear: async () => {},
    }
    const fetchMock = vi.fn().mockResolvedValue(tokenResponse('at_new', 'rt_new'))
    const provider = createOAuthTokenProvider({ clientId: 'app', storage, fetch: fetchMock })
    await expect(provider.getAuthorization()).rejects.toThrow('disk full')
    expect(puts).toHaveLength(1)   // 确实尝试过持久化,失败后未吞错
  })

  it('③ invalid_grant → storage cleared + PicoraReauthRequiredError', async () => {
    const storage = new MemoryTokenStorage()
    await storage.put(validToken({ expiresAt: nowSec() + 10 }))
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: 'invalid_grant', error_description: 'refresh token revoked' }, 400),
    )
    const provider = createOAuthTokenProvider({ clientId: 'app', storage, fetch: fetchMock })
    await expect(provider.getAuthorization()).rejects.toBeInstanceOf(PicoraReauthRequiredError)
    expect(await storage.get()).toBeNull()
  })

  it('empty storage → PicoraReauthRequiredError without network call', async () => {
    const storage = new MemoryTokenStorage()
    const fetchMock = vi.fn()
    const provider = createOAuthTokenProvider({ clientId: 'app', storage, fetch: fetchMock })
    await expect(provider.getAuthorization()).rejects.toBeInstanceOf(PicoraReauthRequiredError)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
