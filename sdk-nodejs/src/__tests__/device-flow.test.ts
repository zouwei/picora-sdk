/**
 * v0.61.10 PR4-B-α：Device Flow helper 测试。
 *
 * 覆盖（10 case）：
 *   D1 startDeviceFlow POST /v1/oauth/device_authorization with form body
 *   D2 startDeviceFlow returns userCode + verificationUri + poll() helper
 *   D3 poll authorization_pending → 重试；最终返回 access_token
 *   D4 poll slow_down → interval += 5
 *   D5 poll access_denied → reject('access_denied')
 *   D6 poll expired_token → reject('device_flow_expired')
 *   D7 poll session 过期（expiresAt < now）→ reject('device_flow_expired')
 *   D8 token 响应解析 scope 字符串为数组
 *   D9 expiresAt 计算正确（now + expires_in）
 *   D10 MemoryTokenStorage 基本 get/put/clear
 */
import { describe, it, expect, vi } from 'vitest'
import { startDeviceFlow, MemoryTokenStorage } from '../device-flow.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('v0.61.10 — Device Flow', () => {
  it('D1: startDeviceFlow POSTs form body to /v1/oauth/device_authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      device_code: 'devcode_xxx',
      user_code: 'ABCD-1234',
      verification_uri: 'https://example.com/device',
      expires_in: 600,
    }))
    await startDeviceFlow({
      clientId: 'cli_test',
      scopes: ['collection.read', 'episode.write'],
      baseUrl: 'https://api.example.com',
      fetch: fetchMock,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const call = fetchMock.mock.calls[0]
    expect(String(call?.[0])).toContain('/v1/oauth/device_authorization')
    const init = call?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/x-www-form-urlencoded')
    const body = String(init.body)
    expect(body).toContain('client_id=cli_test')
    expect(body).toContain('scope=collection.read+episode.write')
  })

  it('D2: returns userCode + verificationUri + poll()', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      device_code: 'devcode_yyy',
      user_code: 'XXXX-1111',
      verification_uri: 'https://example.com/device',
      verification_uri_complete: 'https://example.com/device?user_code=XXXX-1111',
      expires_in: 600,
      interval: 5,
    }))
    const sess = await startDeviceFlow({
      clientId: 'cli_test',
      scopes: [],
      fetch: fetchMock,
    })
    expect(sess.userCode).toBe('XXXX-1111')
    expect(sess.verificationUri).toBe('https://example.com/device')
    expect(sess.verificationUriComplete).toBe('https://example.com/device?user_code=XXXX-1111')
    expect(typeof sess.poll).toBe('function')
  })

  it('D3: poll handles authorization_pending then returns access_token', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return Promise.resolve(jsonResponse({
          device_code: 'devcode_z', user_code: 'X', verification_uri: 'u',
          expires_in: 600, interval: 0,    // interval=0 让测试不实际等待
        }))
      }
      callCount++
      if (callCount === 1) return Promise.resolve(jsonResponse({ error: 'authorization_pending' }, 400))
      return Promise.resolve(jsonResponse({
        access_token: 'tok_xxx',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'collection.read episode.write',
      }))
    })
    const sess = await startDeviceFlow({ clientId: 'cli', scopes: [], fetch: fetchMock })
    const tok = await sess.poll()
    expect(tok.accessToken).toBe('tok_xxx')
    expect(tok.scopes).toEqual(['collection.read', 'episode.write'])
    expect(callCount).toBe(2)   // pending + success
  })

  it('D4: poll handles slow_down by extending interval', { timeout: 7000 }, async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return Promise.resolve(jsonResponse({
          device_code: 'd', user_code: 'X', verification_uri: 'u',
          expires_in: 600, interval: 0,
        }))
      }
      callCount++
      if (callCount === 1) return Promise.resolve(jsonResponse({ error: 'slow_down' }, 400))
      return Promise.resolve(jsonResponse({
        access_token: 'tok_after_slowdown', token_type: 'Bearer',
        expires_in: 3600, scope: '',
      }))
    })
    const sess = await startDeviceFlow({ clientId: 'cli', scopes: [], fetch: fetchMock })
    const tok = await sess.poll()
    expect(tok.accessToken).toBe('tok_after_slowdown')
  })

  it('D5: poll access_denied rejects', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return Promise.resolve(jsonResponse({
          device_code: 'd', user_code: 'X', verification_uri: 'u',
          expires_in: 600, interval: 0,
        }))
      }
      return Promise.resolve(jsonResponse({ error: 'access_denied' }, 400))
    })
    const sess = await startDeviceFlow({ clientId: 'cli', scopes: [], fetch: fetchMock })
    await expect(sess.poll()).rejects.toThrow('access_denied')
  })

  it('D6: poll expired_token rejects', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return Promise.resolve(jsonResponse({
          device_code: 'd', user_code: 'X', verification_uri: 'u',
          expires_in: 600, interval: 0,
        }))
      }
      return Promise.resolve(jsonResponse({ error: 'expired_token' }, 400))
    })
    const sess = await startDeviceFlow({ clientId: 'cli', scopes: [], fetch: fetchMock })
    await expect(sess.poll()).rejects.toThrow('device_flow_expired')
  })

  it('D7: session past expiresAt rejects with device_flow_expired before first poll', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      device_code: 'd', user_code: 'X', verification_uri: 'u',
      expires_in: -1,    // 已过期
      interval: 0,
    }))
    const sess = await startDeviceFlow({ clientId: 'cli', scopes: [], fetch: fetchMock })
    await expect(sess.poll()).rejects.toThrow('device_flow_expired')
  })

  it('D8: token response scope string parsed to array', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return Promise.resolve(jsonResponse({
          device_code: 'd', user_code: 'X', verification_uri: 'u',
          expires_in: 600, interval: 0,
        }))
      }
      callCount++
      return Promise.resolve(jsonResponse({
        access_token: 't',
        expires_in: 3600,
        scope: '  collection.read    collection.write  ',
      }))
    })
    const sess = await startDeviceFlow({ clientId: 'cli', scopes: [], fetch: fetchMock })
    const tok = await sess.poll()
    expect(tok.scopes).toEqual(['collection.read', 'collection.write'])
  })

  it('D9: token expiresAt = now + expires_in (3600s default)', async () => {
    let callCount = 0
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (String(url).endsWith('/oauth/device_authorization')) {
        return Promise.resolve(jsonResponse({
          device_code: 'd', user_code: 'X', verification_uri: 'u',
          expires_in: 600, interval: 0,
        }))
      }
      callCount++
      return Promise.resolve(jsonResponse({
        access_token: 't', expires_in: 100, scope: '',
      }))
    })
    const sess = await startDeviceFlow({ clientId: 'cli', scopes: [], fetch: fetchMock })
    const before = Math.floor(Date.now() / 1000)
    const tok = await sess.poll()
    const after = Math.floor(Date.now() / 1000)
    expect(tok.expiresAt).toBeGreaterThanOrEqual(before + 100)
    expect(tok.expiresAt).toBeLessThanOrEqual(after + 100)
  })

  it('D10: MemoryTokenStorage get/put/clear roundtrip', async () => {
    const storage = new MemoryTokenStorage()
    expect(await storage.get()).toBeNull()
    await storage.put({
      accessToken: 't', tokenType: 'Bearer', expiresAt: 100, scopes: ['x.read'],
    })
    const back = await storage.get()
    expect(back?.accessToken).toBe('t')
    await storage.clear()
    expect(await storage.get()).toBeNull()
  })
})
