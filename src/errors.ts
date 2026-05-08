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
