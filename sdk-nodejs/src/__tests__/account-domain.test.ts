/**
 * v0.3.0 账户/平台域批次 —— auth(扩展)/ user / apiKeys / domains / system 测试。
 *
 * 覆盖:
 *   auth(7):sendCode body、login 返回 data(accessToken+user)专项、
 *     refresh Cookie 头 + 不收 body 专项、logout Cookie 头 + resolve undefined、
 *     verify GET、sms.login body、exchangeExportToken body
 *   user(6):get 走 /v1/user/me、update 条件展开、uploadAvatar multipart
 *     无手动 Content-Type 专项、avatarOf raw Response 专项、clearDocRevisions、
 *     identities.unlink path 编码
 *   apiKeys(3):create 明文 key 返回断言、list 数组直返、update PATCH 条件展开
 *   domains(2):create body、verify POST 两段路径
 *   system(1,2 断言):health 走 GET /health 且 bare 模式不拆 data 包装
 */
import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client.js'
import type { User } from '../types/index.js'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock as unknown as typeof fetch })
}

function makeUser(id: string): User {
  return {
    id,
    email: 'user@example.com',
    nickname: 'Alice',
    avatarUrl: null,
    plan: 'pro',
    role: 'user',
    emailVerified: true,
    locale: 'zh-CN',
    isActive: true,
    createdAt: '2026-07-19T00:00:00.000Z',
  }
}

const USER_ID = 'V1StGXR8_Z5jdHi6B-myT'
const KEY_ID = 'Kk9MR2PQ7vB01234567ab'
const DOMAIN_ID = 'Dm9MR2PQ7vB01234567cd'
const IDENTITY_ID = 'Id9MR2PQ7vB01234567ef'

// ────────────────────────── auth ──────────────────────────

describe('@picora/sdk 账户域 — auth namespace', () => {
  it('A1: sendCode 走 POST /v1/auth/send-code + {email,type} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { message: 'Verification code sent' } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.auth.sendCode({ email: 'user@example.com', type: 'register' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/auth/send-code')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ email: 'user@example.com', type: 'register' })
    expect(result.message).toBe('Verification code sent')
  })

  it('A2: login 返回 body 的 data(accessToken + user;refresh token 在 Set-Cookie,不进返回值)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { success: true, data: { accessToken: 'jwt_abc', user: makeUser(USER_ID) } },
        200,
        { 'Set-Cookie': 'refresh_token=rt_secret; HttpOnly; Secure' },
      ),
    )
    const client = makeClient(fetchMock)
    const result = await client.auth.login({ email: 'user@example.com', password: 'P@ssw0rd123' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/auth/login')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'user@example.com',
      password: 'P@ssw0rd123',
    })
    // 只返回 data,不含 Set-Cookie 下发的 refresh token
    expect(result).toEqual({ accessToken: 'jwt_abc', user: makeUser(USER_ID) })
    expect(JSON.stringify(result)).not.toContain('rt_secret')
  })

  it('A3: refresh 以 Cookie: refresh_token=... 头携带(服务端不收 body)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { accessToken: 'jwt_new', userId: USER_ID, plan: 'pro' },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.auth.refresh({ refreshToken: 'rt_secret' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/auth/refresh')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Cookie']).toBe('refresh_token=rt_secret')
    expect(init.body).toBeUndefined()
    expect(result).toEqual({ accessToken: 'jwt_new', userId: USER_ID, plan: 'pro' })
  })

  it('A4: logout 同样走 Cookie 头,响应体忽略(resolve undefined)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null }))
    const client = makeClient(fetchMock)
    const result = await client.auth.logout({ refreshToken: 'rt_secret' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect((init.headers as Record<string, string>)['Cookie']).toBe('refresh_token=rt_secret')
    expect(result).toBeUndefined()
  })

  it('A5: verify 走 GET /v1/auth/verify 并返回认证上下文', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { valid: true, userId: USER_ID, plan: 'pro', authType: 'apiKey', apiKeyId: KEY_ID },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.auth.verify()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/auth/verify')
    expect(init.method).toBe('GET')
    expect(result.authType).toBe('apiKey')
    expect(result.apiKeyId).toBe(KEY_ID)
  })

  it('A6: sms.login 走 POST /v1/auth/sms/login + {phone,code} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { accessToken: 'jwt_sms', user: makeUser(USER_ID) } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.auth.sms.login({ phone: '+8613800138000', code: '293847' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/auth/sms/login')
    expect(JSON.parse(init.body as string)).toEqual({ phone: '+8613800138000', code: '293847' })
    expect(result.accessToken).toBe('jwt_sms')
  })

  it('A7: exchangeExportToken 走 POST + {ott} body 并返回完整导入载荷', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          apiUrl: 'https://api.picora.me',
          apiKey: 'sk_live_Example_key_not_real_do_not_use0',
          imgDomain: 'media.picora.me',
          user: { email: 'user@example.com', plan: 'pro' },
        },
      }),
    )
    const client = makeClient(fetchMock)
    const ott = `ott_${'x'.repeat(43)}`
    const result = await client.auth.exchangeExportToken({ ott })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/auth/exchange-export-token')
    expect(JSON.parse(init.body as string)).toEqual({ ott })
    expect(result.apiKey).toBe('sk_live_Example_key_not_real_do_not_use0')
    expect(result.imgDomain).toBe('media.picora.me')
  })
})

// ────────────────────────── user ──────────────────────────

describe('@picora/sdk 账户域 — user namespace', () => {
  it('U1: get 走 GET /v1/user/me(auth.me 的规范入口)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: makeUser(USER_ID) }))
    const client = makeClient(fetchMock)
    const user = await client.user.get()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/user/me')
    expect(init.method).toBe('GET')
    expect(user.id).toBe(USER_ID)
  })

  it('U2: update PATCH 条件展开,未提供字段不上送', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: makeUser(USER_ID) }))
    const client = makeClient(fetchMock)
    await client.user.update({ nickname: '小明', locale: 'zh-CN' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ nickname: '小明', locale: 'zh-CN' })
  })

  it('U3: uploadAvatar 走 multipart FormData,不手动设置 Content-Type(boundary 由 fetch 生成)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { avatarUrl: 'https://api.picora.me/v1/user/avatar/x?v=1' } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.user.uploadAvatar({
      file: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      filename: 'avatar.png',
      contentType: 'image/png',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/user/me/avatar')
    expect(init.body).toBeInstanceOf(FormData)
    const form = init.body as FormData
    const filePart = form.get('file')
    expect(filePart).toBeInstanceOf(Blob)
    expect((filePart as File).name).toBe('avatar.png')
    // 手动设置 Content-Type 会破坏 boundary,必须交给 fetch 自动生成
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect(result.avatarUrl).toContain('?v=')
  })

  it('U4: avatarOf 以 raw 模式返回 Response 本体(读二进制 body 与 Content-Type)', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
      }),
    )
    const client = makeClient(fetchMock)
    const res = await client.user.avatarOf(USER_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/user/avatar/${USER_ID}`)
    expect(res).toBeInstanceOf(Response)
    expect(res.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes)
  })

  it('U5: clearDocRevisions 走 DELETE 并返回批处理统计', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { deleted: 37, freedBytes: 8388608, hasMore: false } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.user.clearDocRevisions()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/user/me/doc-revisions')
    expect(init.method).toBe('DELETE')
    expect(result).toEqual({ deleted: 37, freedBytes: 8388608, hasMore: false })
  })

  it('U6: identities.unlink 拼接身份 ID 路径并 DELETE', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null }))
    const client = makeClient(fetchMock)
    await client.user.identities.unlink(IDENTITY_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/user/me/identities/${IDENTITY_ID}`)
    expect(init.method).toBe('DELETE')
  })
})

// ────────────────────────── apiKeys ──────────────────────────

describe('@picora/sdk 账户域 — apiKeys namespace', () => {
  it('K1: create 走 POST /v1/api-keys + {name} body,响应含一次性明文 key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            id: KEY_ID,
            name: 'PicGo 笔记本',
            key: 'sk_live_Example_key_not_real_do_not_use0',
            createdAt: '2026-07-19T00:00:00.000Z',
          },
        },
        201,
      ),
    )
    const client = makeClient(fetchMock)
    const created = await client.apiKeys.create({ name: 'PicGo 笔记本' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/api-keys')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'PicGo 笔记本' })
    expect(created.key).toMatch(/^sk_live_/)
    expect(created.key).toHaveLength(40)
  })

  it('K2: list 走 GET 并直返数组(data 即 ApiKey[],无分页包装)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            id: KEY_ID,
            name: 'PicGo 主机',
            keyPrefix: 'sk_live_xxxx',
            lastUsedAt: null,
            createdAt: '2026-07-19T00:00:00.000Z',
          },
        ],
      }),
    )
    const client = makeClient(fetchMock)
    const keys = await client.apiKeys.list()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/api-keys')
    expect(keys).toHaveLength(1)
    expect(keys[0]?.keyPrefix).toBe('sk_live_xxxx')
  })

})

// ────────────────────────── domains ──────────────────────────

describe('@picora/sdk 账户域 — domains namespace', () => {
  it('DM1: create 走 POST /v1/domains + {host} body,返回 CNAME 配置指引', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            id: DOMAIN_ID,
            host: 'img.mysite.com',
            verified: false,
            cnameTarget: 'img.picora.com',
            instructions: 'Add a CNAME record: img.mysite.com → img.picora.com',
          },
        },
        201,
      ),
    )
    const client = makeClient(fetchMock)
    const result = await client.domains.create({ host: 'img.mysite.com' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/domains')
    expect(JSON.parse(init.body as string)).toEqual({ host: 'img.mysite.com' })
    expect(result.verified).toBe(false)
    expect(result.cnameTarget).toBe('img.picora.com')
  })

  it('DM2: verify 走 POST /v1/domains/{id}/verify(无 body),以响应 verified 判定结果', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { verified: true, message: 'Domain verified' } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.domains.verify(DOMAIN_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/domains/${DOMAIN_ID}/verify`)
    expect(init.method).toBe('POST')
    expect(init.body).toBeUndefined()
    expect(result.verified).toBe(true)
  })
})

// ────────────────────────── system ──────────────────────────

describe('@picora/sdk 账户域 — system namespace', () => {
  it('S1: health 走 GET /health,bare 模式原样返回裸 JSON(不拆 {success,data} 包装)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        ts: '2026-07-19T08:00:00.000Z',
        version: '0.82.0',
        features: { kb: true, mediaListingV2: true },
      }),
    )
    const client = makeClient(fetchMock)
    const health = await client.system.health()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/health')
    expect(String(url)).not.toContain('/v1/')
    expect(init.method).toBe('GET')
    expect(health.ok).toBe(true)
    expect(health.features?.['kb']).toBe(true)
  })
})
