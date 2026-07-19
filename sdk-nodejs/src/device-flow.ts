/**
 * v0.61.10 PR4-B-α：OAuth 2.0 Device Authorization Grant（RFC 8628）helper。
 *
 * 适用场景：CLI / 桌面应用 / TV / 嵌入式设备等无浏览器或受限浏览器环境
 * 接入 Picora，无需自建 OAuth 跳转回调。
 *
 * 典型流程：
 *   1. await DeviceFlow.start({ clientId, scopes })            → 拿到 user_code + verification_uri
 *   2. 展示给用户："请访问 verification_uri 输入 user_code"
 *   3. await flow.poll()                                        → 内置 RFC 8628 退避，返回 access_token
 *   4. createPicoraClient({ oauthToken: token.accessToken })   → 用 token 调 collections / episodes / sync
 *
 * Token 持久化（可选）：
 *   - 默认仅内存（page reload 后丢失）
 *   - 传入 storage 实现可持久化到文件 / OS Keychain / sessionStorage 等
 */

export interface DeviceFlowStartOptions {
  /** OAuth client_id（用户在 Picora 开发者后台注册） */
  clientId: string
  /** 申请的 scope 列表（如 ['collection.read', 'episode.write']） */
  scopes: readonly string[]
  /** Picora API 基地址；默认 https://api.picora.me */
  baseUrl?: string
  /** 自定义 fetch（SSR / 测试 mock）；默认 globalThis.fetch */
  fetch?: typeof fetch
}

/** RFC 8628 §3.2 device authorization response */
export interface DeviceFlowSession {
  /** 给用户输入的短码（如 "ABCD-1234"） */
  userCode: string
  /** 用户访问的 URL */
  verificationUri: string
  /** verificationUri + ?user_code=xxx（已含 user_code，便于直接二维码扫码） */
  verificationUriComplete?: string
  /** 服务端给的 deviceCode（poll 时使用） */
  deviceCode: string
  /** poll 间隔（秒），可被服务端 slow_down 提升 */
  interval: number
  /** session 总过期时间（unix 秒） */
  expiresAt: number
  /** 后续 poll 用的 helper（绑定本 session） */
  poll(): Promise<DeviceFlowToken>
}

/** RFC 8628 §3.5 token response */
export interface DeviceFlowToken {
  accessToken: string
  refreshToken?: string
  tokenType: 'Bearer'
  /** Token 过期 unix 秒（如服务端返回 expires_in，已转换为绝对时间） */
  expiresAt: number
  /** 实际授予的 scopes（可能 ⊂ 申请的 scopes） */
  scopes: readonly string[]
}

/**
 * 启动 Device Flow。
 *
 * 内部 POST /v1/oauth/device_authorization → 拿到 device_code + user_code。
 * (0.2.x 曾误发到 /oauth/device_authorization —— 服务端路由实际挂载在 /v1 前缀下,
 * 该 bug 因测试全 mock fetch 从未暴露,0.3.0 修正,见 CHANGELOG Fixed。)
 * 返回的 session 对象内置 poll() 方法，调用即开始按 interval 轮询 token endpoint。
 *
 * @throws Error('invalid_request' / 'invalid_client' / network 错误等)
 */
export async function startDeviceFlow(opts: DeviceFlowStartOptions): Promise<DeviceFlowSession> {
  const baseUrl = (opts.baseUrl ?? 'https://api.picora.me').replace(/\/$/, '')
  const fetchImpl = opts.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('DeviceFlow.start: fetch is not available')
  }

  const body = new URLSearchParams({
    client_id: opts.clientId,
    scope: opts.scopes.join(' '),
  })
  const res = await fetchImpl(`${baseUrl}/v1/oauth/device_authorization`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`device_authorization failed: HTTP ${res.status} ${text.slice(0, 200)}`)
  }
  const json = await res.json() as {
    device_code: string
    user_code: string
    verification_uri: string
    verification_uri_complete?: string
    expires_in: number
    interval?: number
  }

  const interval = json.interval ?? 5   // RFC 8628 §3.2 默认 5s
  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in

  const session: DeviceFlowSession = {
    userCode: json.user_code,
    verificationUri: json.verification_uri,
    ...(json.verification_uri_complete ? { verificationUriComplete: json.verification_uri_complete } : {}),
    deviceCode: json.device_code,
    interval,
    expiresAt,
    poll: () =>
      pollDeviceFlow({
        clientId: opts.clientId,
        deviceCode: json.device_code,
        baseUrl,
        fetch: fetchImpl,
        initialInterval: interval,
        expiresAt,
      }),
  }
  return session
}

/**
 * RFC 8628 §3.4 轮询 token endpoint，按服务端规则退避。
 *
 * 状态机：
 *   - authorization_pending → 等待 interval 后重试
 *   - slow_down            → interval += 5（RFC 8628 §3.5），等待新 interval
 *   - access_denied        → 立即抛错（用户拒绝）
 *   - expired_token        → 抛错（session 过期）
 *   - 拿到 access_token    → 返回
 */
async function pollDeviceFlow(args: {
  clientId: string
  deviceCode: string
  baseUrl: string
  fetch: typeof fetch
  initialInterval: number
  expiresAt: number
}): Promise<DeviceFlowToken> {
  let interval = args.initialInterval

  while (true) {
    const nowSec = Math.floor(Date.now() / 1000)
    if (nowSec >= args.expiresAt) {
      throw new Error('device_flow_expired')
    }
    await sleep(interval * 1000)

    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: args.deviceCode,
      client_id: args.clientId,
    })
    const res = await args.fetch(`${args.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const json = await res.json() as {
      error?: string
      access_token?: string
      refresh_token?: string
      expires_in?: number
      scope?: string
    }
    if (res.ok && json.access_token) {
      const tokenExpiresAt = Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600)
      return {
        accessToken: json.access_token,
        ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
        tokenType: 'Bearer',
        expiresAt: tokenExpiresAt,
        scopes: (json.scope ?? '').split(' ').filter(Boolean),
      }
    }
    if (json.error === 'authorization_pending') continue
    if (json.error === 'slow_down') {
      interval += 5
      continue
    }
    if (json.error === 'access_denied') throw new Error('access_denied')
    if (json.error === 'expired_token') throw new Error('device_flow_expired')
    throw new Error(`device_flow_failed: ${json.error ?? `HTTP ${res.status}`}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 简易 Token 持久化抽象（消费者可实现 fs / Keychain / sessionStorage）。
 *
 * 默认 MemoryTokenStorage 在进程内存活跃。
 */
export interface TokenStorage {
  get(): Promise<DeviceFlowToken | null>
  put(token: DeviceFlowToken): Promise<void>
  clear(): Promise<void>
}

export class MemoryTokenStorage implements TokenStorage {
  private value: DeviceFlowToken | null = null
  async get(): Promise<DeviceFlowToken | null> {
    return this.value
  }
  async put(token: DeviceFlowToken): Promise<void> {
    this.value = token
  }
  async clear(): Promise<void> {
    this.value = null
  }
}

// ─── 覆盖率声明(v0.3.0)────────────────────────────────────────
// POST /oauth/token 的规范覆盖登记在 oauth/authorization.ts,此处不重复。

/** 本模块覆盖的 spec operation */
export const DEVICE_FLOW_COVERAGE = [
  { method: 'POST', path: '/v1/oauth/device_authorization', client: 'startDeviceFlow' },
] as const
