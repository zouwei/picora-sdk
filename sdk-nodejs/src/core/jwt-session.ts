/**
 * 第一方 JWT 会话(邮箱密码 / 邮箱验证码登录)(v0.3.0,Node 环境)。
 *
 * 与 OAuth 会话的差异(务必区分):
 *   - refresh token 经 httpOnly Set-Cookie 下发,响应 body 只有 accessToken;
 *     Node 侧由本模块从 Set-Cookie 头捕获并在 /v1/auth/refresh 时以 Cookie 头带回
 *   - 服务端 /v1/auth/refresh **不轮换** refresh token(与 OAuth 强制旋转相反),
 *     持久化压力小;refresh cookie 7 天有效
 *   - access token 为 15 分钟 JWT,SDK 解析 exp claim 做预刷新(解析失败按 14 分钟兜底)
 *
 * 用法:
 *   const session = createJwtSession({ baseUrl })
 *   await session.login('user@example.com', 'P@ssw0rd')
 *   const picora = createPicoraClient({ session })
 */

import { PicoraApiError, PicoraReauthRequiredError } from '../errors.js'
import { createOAuthHttpCore, type OAuthHttpOptions } from '../oauth/authorization.js'
import type { AuthProvider } from './auth-provider.js'
import type { HttpCore } from './http.js'
import type { User } from '../types/index.js'

export interface JwtSessionOptions extends OAuthHttpOptions {
  /** access token 距过期多少秒内触发预刷新。默认 60(access 仅 15 分钟,skew 不宜过大) */
  refreshSkewSec?: number
}

/** POST /v1/auth/login|login/code 的 data(AuthResult) */
interface AuthResultData {
  accessToken: string
  user: User
}

export interface JwtSession extends AuthProvider {
  /** 邮箱 + 密码登录(连续失败 5 次锁定 15 分钟)。成功后本会话立即可用。 */
  login(email: string, password: string): Promise<User>
  /** 邮箱 + 6 位验证码登录(验证码经 auth.sendCode 发送;新邮箱自动注册)。 */
  loginWithCode(email: string, code: string): Promise<User>
  /** 手动刷新 access token(通常无需调用,SDK 自动预刷新 + 401 兜底)。 */
  refresh(): Promise<void>
  /** 登出:服务端吊销 refresh token,并清空本地会话状态。 */
  logout(): Promise<void>
  /** 当前是否已登录(有 refresh cookie 即视为可恢复会话)。 */
  isAuthenticated(): boolean
}

/** 解析 JWT payload 的 exp claim(unix 秒);解析失败返回 null */
function decodeJwtExp(jwt: string): number | null {
  const parts = jwt.split('.')
  const payload = parts[1]
  if (payload === undefined) return null
  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = JSON.parse(atob(normalized)) as { exp?: unknown }
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

/**
 * 从响应头捕获 refresh_token cookie 值。
 * 优先 Headers.getSetCookie()(Node 18.14+ / undici);老运行时回退解析
 * 合并的 set-cookie 字符串(逗号分隔存在歧义,仅取 refresh_token= 段,足够健壮)。
 */
function extractRefreshCookie(headers: Headers): string | null {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] }
  const cookieStrings = typeof withGetSetCookie.getSetCookie === 'function'
    ? withGetSetCookie.getSetCookie()
    : (headers.get('set-cookie') !== null ? [headers.get('set-cookie') as string] : [])
  for (const cookieString of cookieStrings) {
    const match = /(?:^|[;,]\s*)refresh_token=([^;,\s]+)/.exec(cookieString)
    if (match?.[1] !== undefined && match[1].length > 0) return match[1]
  }
  return null
}

class JwtSessionImpl implements JwtSession {
  private readonly http: HttpCore
  private readonly skewSec: number

  private accessToken: string | null = null
  /** access token 过期时间(unix 秒);JWT exp 解析失败时按登录时刻 + 14 分钟兜底 */
  private accessExpiresAt = 0
  private refreshCookie: string | null = null
  /** single-flight 守卫:并发预刷新 / 401 刷新共享同一次真实请求 */
  private refreshing: Promise<void> | null = null

  constructor(opts?: JwtSessionOptions) {
    // 复用统一 http core(重试矩阵 / 错误映射);会话端点走 'raw' 以便读 Set-Cookie
    this.http = createOAuthHttpCore(opts)
    this.skewSec = opts?.refreshSkewSec ?? 60
  }

  async login(email: string, password: string): Promise<User> {
    return this.loginVia('/v1/auth/login', { email, password })
  }

  async loginWithCode(email: string, code: string): Promise<User> {
    return this.loginVia('/v1/auth/login/code', { email, code })
  }

  private async loginVia(path: string, body: Record<string, string>): Promise<User> {
    const res = await this.http.request<Response>({
      method: 'POST',
      path,
      body,
      response: 'raw',
    })
    const parsed = (await res.json()) as { data?: AuthResultData }
    const data = parsed.data
    if (!data?.accessToken) {
      throw new PicoraReauthRequiredError('登录响应缺少 accessToken(服务端契约变化?)')
    }
    this.adoptAccessToken(data.accessToken)
    const cookie = extractRefreshCookie(res.headers)
    if (cookie !== null) this.refreshCookie = cookie
    return data.user
  }

  async refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<void> {
    if (this.refreshCookie === null) {
      throw new PicoraReauthRequiredError('没有可用的 refresh cookie,请先 login()')
    }
    let res: Response
    try {
      res = await this.http.request<Response>({
        method: 'POST',
        path: '/v1/auth/refresh',
        headers: { Cookie: `refresh_token=${this.refreshCookie}` },
        response: 'raw',
      })
    } catch (err) {
      // refresh 401 = refresh token 过期/吊销,会话终态
      if (err instanceof PicoraApiError && err.status === 401) {
        this.clearSession()
        throw new PicoraReauthRequiredError('会话已过期(refresh token 失效),请重新登录', err)
      }
      throw err
    }
    const parsed = (await res.json()) as { data?: { accessToken?: string } }
    const accessToken = parsed.data?.accessToken
    if (accessToken === undefined) {
      throw new PicoraReauthRequiredError('刷新响应缺少 accessToken(服务端契约变化?)')
    }
    this.adoptAccessToken(accessToken)
    // 服务端不轮换 refresh cookie;但若某天开始轮换(响应带新 Set-Cookie),这里自动跟上
    const rotated = extractRefreshCookie(res.headers)
    if (rotated !== null) this.refreshCookie = rotated
  }

  async logout(): Promise<void> {
    if (this.refreshCookie !== null) {
      // 尽力通知服务端吊销;网络失败不阻断本地清理
      try {
        await this.http.request<void>({
          method: 'POST',
          path: '/v1/auth/logout',
          headers: { Cookie: `refresh_token=${this.refreshCookie}` },
          response: 'none',
        })
      } catch {
        // 忽略:本地清理是主要目标,服务端 refresh token 会自然过期
      }
    }
    this.clearSession()
  }

  isAuthenticated(): boolean {
    return this.refreshCookie !== null
  }

  async getAuthorization(): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000)
    if (this.accessToken !== null && this.accessExpiresAt - nowSec > this.skewSec) {
      return `Bearer ${this.accessToken}`
    }
    await this.refresh()
    if (this.accessToken === null) {
      throw new PicoraReauthRequiredError('刷新后仍无 access token,请重新登录')
    }
    return `Bearer ${this.accessToken}`
  }

  async onUnauthorized(): Promise<boolean> {
    await this.refresh()
    return true
  }

  private adoptAccessToken(token: string): void {
    this.accessToken = token
    const exp = decodeJwtExp(token)
    this.accessExpiresAt = exp ?? Math.floor(Date.now() / 1000) + 14 * 60
  }

  private clearSession(): void {
    this.accessToken = null
    this.accessExpiresAt = 0
    this.refreshCookie = null
  }
}

/**
 * 构造第一方 JWT 会话(邮箱密码 / 邮箱验证码登录),注入 createPicoraClient({ session })。
 *
 * 返回对象既是会话句柄(login / loginWithCode / refresh / logout / isAuthenticated)也是
 * AuthProvider —— 须先 login/loginWithCode 建立会话,再交给 createPicoraClient 的 session 字段。
 * 与 OAuth 会话的关键差异:refresh token 经 httpOnly Set-Cookie 下发,由本会话从响应头捕获并在
 * /v1/auth/refresh 时以 Cookie 头带回(浏览器之外的 Node 用法);服务端刷新**不轮换** refresh token
 * (与 OAuth 强制旋转相反),cookie 7 天有效。access token 为 15 分钟 JWT,请求前按 exp 预刷新
 * (默认 skew 60s,解析失败按 14 分钟兜底),401 经 onUnauthorized 兜底刷新并重试一次;并发刷新
 * single-flight 合并。refresh 返回 401(refresh cookie 过期/被吊销)会清空本地会话并抛
 * PicoraReauthRequiredError(会话终态,须重新登录)。
 *
 * @param opts 连接与预刷新配置(baseUrl / fetch / refreshSkewSec,默认 skew 60s)
 * @returns    JwtSession(同时实现 AuthProvider)
 */
export function createJwtSession(opts?: JwtSessionOptions): JwtSession {
  return new JwtSessionImpl(opts)
}
