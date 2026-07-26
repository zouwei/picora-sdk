/**
 * v0.31 `@picora/sdk` 错误类型层级。
 *
 * 设计文档：v0.31.0-public-openapi-developer-portal.md §4.8。
 *
 * 三类异常 + HTTP → 类映射规则：
 *   200/201/204            → 成功（不抛）
 *   400/401/403/404/409/422 → PicoraApiError（不重试）
 *   429                    → PicoraRateLimitError（默认重试 3 次指数退避）
 *   500/502/503/504        → PicoraApiError（默认重试 2 次）
 *   网络故障 / abort       → PicoraNetworkError（默认重试 2 次）
 *   timeout                → PicoraNetworkError(cause=AbortError)（不重试）
 */

export class PicoraApiError extends Error {
  readonly status: number
  readonly code: string
  readonly meta: Record<string, unknown> | undefined
  readonly requestId: string | undefined

  constructor(
    status: number,
    code: string,
    message: string,
    meta?: Record<string, unknown>,
    requestId?: string,
  ) {
    super(message)
    this.name = 'PicoraApiError'
    this.status = status
    this.code = code
    this.meta = meta
    this.requestId = requestId
  }
}

export class PicoraNetworkError extends Error {
  readonly cause: Error | undefined

  constructor(message: string, cause?: Error) {
    super(message)
    this.name = 'PicoraNetworkError'
    this.cause = cause
  }
}

export class PicoraRateLimitError extends PicoraApiError {
  readonly retryAfterSec: number

  constructor(message: string, retryAfterSec: number, requestId?: string) {
    super(429, 'RATE_LIMITED', message, { retryAfterSec }, requestId)
    this.name = 'PicoraRateLimitError'
    this.retryAfterSec = retryAfterSec
  }
}

/**
 * v0.3.0:需要用户重新授权的终态错误。
 *
 * 抛出场景(OAuth 自动刷新会话 / 第一方 JWT 会话):
 *   - refresh token 已失效 / 被吊销(服务端返回 invalid_grant;OAuth refresh 强制
 *     旋转,旧 token 重放会触发服务端吊销整条 token 链并邮件通知用户)
 *   - TokenStorage 中没有可用凭证
 *
 * 捕获到本错误后,自动重试无意义 —— 消费者应引导用户重新走授权流程
 * (createAuthorizationRequest / startDeviceFlow / login)。
 */
/**
 * 重新授权原因(对齐 Picora 服务端 OAuth `error_reason` 扩展,v0.5.0)。
 *
 * 四个已知值**均意味着「refresh token 已终态失效 → 必须重新授权」**,差异仅用于面向用户的文案:
 *   - `refresh_token_reuse`    已旋转/失效的 refresh 被再次使用 → 触发重放保护、整链吊销
 *                              (**安全事件**;应提示用户「登录因安全原因已终止,可能被盗用,请重新登录」)
 *   - `refresh_token_revoked`  该链被显式吊销(改密 / 登出全部 / 管理员)
 *   - `refresh_token_expired`  refresh token 自然过期
 *   - `refresh_token_invalid`  refresh token 不存在 / client 不匹配
 *
 * `(string & {})` 分支保留前向兼容:服务端未来可能新增值,消费者对**未知值一律按
 * 「终态、需重新授权」处理**,仅在识别到具体值时定制文案。
 */
export type OAuthReauthReason =
  | 'refresh_token_reuse'
  | 'refresh_token_revoked'
  | 'refresh_token_expired'
  | 'refresh_token_invalid'
  | (string & {})

export class PicoraReauthRequiredError extends PicoraApiError {
  /**
   * 机器可读的重新授权原因(对齐服务端 `error_reason`);服务端未提供时为 undefined。
   * 消费者可据此定制文案(如 `refresh_token_reuse` → 安全告警),未知值按终态处理。
   */
  readonly reason?: OAuthReauthReason | undefined

  constructor(message: string, cause?: unknown, reason?: OAuthReauthReason) {
    const meta: Record<string, unknown> = {}
    if (cause instanceof Error) meta.cause = cause.message
    if (reason) meta.error_reason = reason
    super(401, 'REAUTH_REQUIRED', message, Object.keys(meta).length > 0 ? meta : undefined)
    this.name = 'PicoraReauthRequiredError'
    this.reason = reason
  }
}

/** 类型守卫：判定异常是否可自动重试。 */
export function isRetryable(err: unknown): boolean {
  if (err instanceof PicoraRateLimitError) return true
  if (err instanceof PicoraNetworkError) {
    // timeout / AbortError 不重试（用户已主动 cancel）
    return err.cause?.name !== 'AbortError'
  }
  if (err instanceof PicoraApiError) {
    return err.status >= 500 && err.status < 600
  }
  return false
}
