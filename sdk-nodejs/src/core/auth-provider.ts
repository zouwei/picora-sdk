/**
 * 鉴权提供者抽象(v0.3.0)。
 *
 * SDK 的传输层(core/http.ts)不关心 token 从哪来、如何续期,一切经由本接口注入:
 *   - StaticTokenProvider   固定 token(apiKey / oauthToken 两种静态模式,行为与 0.2.x 完全一致)
 *   - OAuthTokenProvider    TokenStorage 驱动的 OAuth 自动刷新(core/oauth-session.ts)
 *   - JwtSession            第一方邮箱密码登录会话(core/jwt-session.ts)
 *   - 消费者自定义          实现本接口后经 PicoraClientOptions.session 注入
 */

export interface AuthProvider {
  /**
   * 返回当前请求应携带的 Authorization 头完整值(如 `Bearer sk_live_xxx`)。
   *
   * 返回 null 表示本请求不带 Authorization 头(匿名访问公开端点)。
   * 实现方可在此处做惰性刷新(如 access token 临近过期时先续期再返回)。
   */
  getAuthorization(): Promise<string | null>

  /**
   * 收到 401 后的刷新钩子(可选)。
   *
   * http core 捕获 401 时调用一次;返回 true 表示凭证已刷新、请求可重试**恰一次**
   * (重试时会重新调用 getAuthorization 取新值);返回 false 或抛错则将原 401 抛给调用方。
   * 实现方必须自行保证并发安全(single-flight,多个并发 401 只触发一次真实刷新)。
   */
  onUnauthorized?(): Promise<boolean>
}

/**
 * 固定 token 提供者 —— apiKey(sk_live_ 前缀)与 oauthToken(静态 access token)
 * 两种模式共用。无刷新能力(不实现 onUnauthorized),401 直接抛给调用方,
 * 与 0.2.x 行为完全一致。
 */
export class StaticTokenProvider implements AuthProvider {
  private readonly authorization: string

  constructor(token: string) {
    this.authorization = `Bearer ${token}`
  }

  async getAuthorization(): Promise<string> {
    return this.authorization
  }
}
