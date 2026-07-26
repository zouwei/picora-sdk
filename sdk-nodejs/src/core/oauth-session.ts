/**
 * OAuth 自动刷新会话(TokenStorage 驱动)(v0.3.0)。
 *
 * 用法:
 *   const provider = createOAuthTokenProvider({ clientId: 'my_app', storage })
 *   const picora = createPicoraClient({ session: provider })
 *
 * 行为:
 *   - 惰性预刷新:access token 距过期 < refreshSkewSec(默认 300s)时先续期再发请求
 *   - 反应式刷新:请求返回 401 时经 http core 的 onUnauthorized 钩子刷新并重试一次
 *   - single-flight:并发请求同时触发刷新时只有一次真实的 /oauth/token 调用
 *     (参照 picora-center api-client.ts 的 refreshingPromise 模式)
 *   - **旋转不变式**(参照 folia token.service.ts 的教训):拿到新 token 对后
 *     必须先 storage.put 成功再返回新 access;put 失败直接抛错**不吞**——
 *     否则内存里用着新 token、持久层还是旧 refresh,下次进程重启用旧值重放,
 *     会触发服务端吊销整条 token 链 + 邮件告警用户
 *   - invalid_grant → storage.clear() + 抛 PicoraReauthRequiredError(终态,须重新授权)
 */

import { PicoraApiError, PicoraReauthRequiredError } from '../errors.js'
import { refreshAccessToken } from '../oauth/authorization.js'
import type { AuthProvider } from './auth-provider.js'
import type { DeviceFlowToken, TokenStorage } from '../device-flow.js'

export interface OAuthSessionOptions {
  /** OAuth client_id(公开客户端,无 secret) */
  clientId: string
  /** token 持久化实现(MemoryTokenStorage / FileTokenStorage / KeychainTokenStorage / 自定义) */
  storage: TokenStorage
  /** API 基地址。默认 https://api.picora.me */
  baseUrl?: string
  /** 自定义 fetch。默认 globalThis.fetch */
  fetch?: typeof fetch
  /** access token 距过期多少秒内触发预刷新。默认 300 */
  refreshSkewSec?: number
}

export class OAuthTokenProvider implements AuthProvider {
  private readonly opts: OAuthSessionOptions
  private readonly skewSec: number
  /** single-flight 守卫:非 null 表示一次刷新正在进行,并发方 await 同一个 Promise */
  private refreshing: Promise<DeviceFlowToken> | null = null

  constructor(opts: OAuthSessionOptions) {
    this.opts = opts
    this.skewSec = opts.refreshSkewSec ?? 300
  }

  async getAuthorization(): Promise<string> {
    const token = await this.opts.storage.get()
    if (!token) {
      throw new PicoraReauthRequiredError('OAuth 会话不存在(TokenStorage 为空),请先完成授权流程')
    }
    const nowSec = Math.floor(Date.now() / 1000)
    if (token.expiresAt - nowSec > this.skewSec) {
      return `Bearer ${token.accessToken}`
    }
    const fresh = await this.refresh()
    return `Bearer ${fresh.accessToken}`
  }

  async onUnauthorized(): Promise<boolean> {
    await this.refresh()
    return true
  }

  /** single-flight 入口:并发调用共享同一次真实刷新 */
  private refresh(): Promise<DeviceFlowToken> {
    if (this.refreshing) return this.refreshing
    this.refreshing = this.doRefresh().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  private async doRefresh(): Promise<DeviceFlowToken> {
    const current = await this.opts.storage.get()
    if (!current?.refreshToken) {
      await this.opts.storage.clear()
      throw new PicoraReauthRequiredError('没有可用的 refresh token,请重新授权')
    }

    let next: DeviceFlowToken
    try {
      next = await refreshAccessToken({
        clientId: this.opts.clientId,
        refreshToken: current.refreshToken,
        ...(this.opts.baseUrl !== undefined ? { baseUrl: this.opts.baseUrl } : {}),
        ...(this.opts.fetch !== undefined ? { fetch: this.opts.fetch } : {}),
      })
    } catch (err) {
      if (err instanceof PicoraApiError && err.code === 'invalid_grant') {
        await this.opts.storage.clear()
        // 透传服务端 error_reason(如 refresh_token_reuse 安全重放)→ 消费者可据此定制文案
        const reason = err.meta?.['error_reason']
        const message = reason === 'refresh_token_reuse'
          ? 'refresh token 触发重放保护,登录已因安全原因终止(可能被盗用),请重新授权'
          : 'refresh token 已失效或被吊销(invalid_grant),请重新授权'
        throw new PicoraReauthRequiredError(
          message,
          err,
          typeof reason === 'string' ? reason : undefined,
        )
      }
      throw err
    }

    // 旋转不变式:先持久化成功,再让新 access 生效。put 抛错时不吞、不返回 next。
    await this.opts.storage.put(next)
    return next
  }
}

/**
 * 构造 OAuth 自动刷新会话(AuthProvider),注入 createPicoraClient({ session })。
 *
 * 由 TokenStorage 驱动:请求前惰性预刷新(距过期 < refreshSkewSec,默认 300s),
 * 请求 401 时经 onUnauthorized 反应式刷新并重试一次;并发刷新经 single-flight 合并为
 * 单次 /oauth/token 调用。严守旋转不变式 —— 新 token 先 storage.put 成功再返回,put 失败
 * 不吞直接抛(否则内存用新值、持久层留旧 refresh,重启重放旧值会触发服务端吊销整条 token 链)。
 * 刷新遇 invalid_grant 时清空 storage 并抛 PicoraReauthRequiredError(会话终态,须重新授权)。
 *
 * @param opts 会话配置,字段见 OAuthSessionOptions(clientId / storage / baseUrl / fetch / refreshSkewSec)
 * @returns    OAuthTokenProvider —— 实现 AuthProvider,交给 createPicoraClient 的 session 字段
 */
export function createOAuthTokenProvider(opts: OAuthSessionOptions): OAuthTokenProvider {
  return new OAuthTokenProvider(opts)
}
