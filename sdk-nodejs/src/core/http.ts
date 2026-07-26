/**
 * HTTP 请求核心(v0.3.0,自 client.ts 抽出并扩展)。
 *
 * 职责:URL 构建、鉴权注入(经 AuthProvider)、超时、错误归类、自动重试、响应解码。
 * 所有 resource 命名空间共用同一实例,保证行为一致(这正是 SDK 要收敛的漂移点)。
 *
 * 重试矩阵(与 0.2.x 保持一致):
 *   429            → 默认重试 3 次,指数退避 1s/2s/4s,尊重 Retry-After 头;retryOnRateLimit:false 关闭
 *   5xx / 网络错误 → 默认重试 2 次(500ms/1.5s);retryOnServerError:false 关闭
 *   AbortError(超时/主动取消)→ 不重试
 *   args.retry === false → 完全关闭 429/5xx 自动重试(TUS PATCH 等非幂等分片请求必须使用)
 *
 * 401 刷新钩子(v0.3.0 新增):
 *   捕获 401 且 AuthProvider 实现了 onUnauthorized 时,await 刷新(provider 内部负责
 *   single-flight)→ 成功则重试**恰一次**(重新取 Authorization);失败或再次 401 则抛出。
 *   静态 token 模式(apiKey / oauthToken)无该钩子,行为与 0.2.x 完全一致。
 */

import { PicoraApiError, PicoraNetworkError, PicoraRateLimitError } from '../errors.js'
import type { AuthProvider } from './auth-provider.js'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/**
 * 响应解码模式:
 *   - 'data'  默认。解析 JSON 并拆 `{ success, data }` 业务包装,返回 data
 *   - 'bare'  解析 JSON 原样返回(OAuth /oauth/* 端点为 RFC 裸 JSON,无业务包装)
 *   - 'text'  返回纯文本 string(/v1/docs/{id}/raw、/v1/kbs/{id}/raw 等 markdown 正文)
 *   - 'raw'   返回 Response 本体,2xx/3xx 均不消费 body(TUS 读 header、manifest 304、二进制下载);
 *             ≥400 仍走统一错误映射抛出
 *   - 'none'  忽略 body,resolve undefined(200/204 均适用)
 */
export type ResponseMode = 'data' | 'bare' | 'text' | 'raw' | 'none'

export interface RequestArgs {
  method: HttpMethod
  /** API 路径(以 / 开头);path 参数由调用方 encodeURIComponent 后拼入 */
  path: string
  /** query 参数;值为 undefined 的键自动跳过 */
  query?: Record<string, string | number | boolean | undefined>
  /**
   * 请求体:
   *   - 普通对象 → JSON.stringify + Content-Type: application/json
   *   - FormData / URLSearchParams / Blob → 透传(fetch 自动设置对应 Content-Type)
   *   - Uint8Array / ArrayBuffer → 透传,Content-Type 由 headers 显式指定(如 TUS 分片)
   */
  body?: unknown
  /** 附加请求头(最后合并,可覆盖默认 Content-Type;如 TUS 协议头 / Accept 版本头 / Idempotency-Key) */
  headers?: Record<string, string>
  /** 响应解码模式,默认 'data' */
  response?: ResponseMode
  /** 显式 false 关闭 429/5xx 自动重试(非幂等请求用);401 刷新重试不受影响 */
  retry?: false
}

export interface HttpConfig {
  baseUrl: string
  timeout: number
  fetch: typeof fetch
  retryOnRateLimit: boolean
  retryOnServerError: boolean
  userAgent: string
  debug: boolean
}

/** 全部 resource 命名空间共用的请求入口 */
export interface HttpCore {
  request<TResult>(args: RequestArgs): Promise<TResult>
  /** 只读配置(个别 resource 需要 baseUrl,如解析 TUS Location 相对地址) */
  readonly config: HttpConfig
}

const RATE_LIMIT_BACKOFF_MS = [1_000, 2_000, 4_000] as const
const SERVER_ERROR_BACKOFF_MS = [500, 1_500] as const

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

function shouldRetryServerError(err: unknown): boolean {
  if (err instanceof PicoraRateLimitError) return false
  if (err instanceof PicoraApiError) return err.status >= 500 && err.status < 600
  if (err instanceof PicoraNetworkError) return err.cause?.name !== 'AbortError'
  return false
}

function mapStatusToCode(status: number): string {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  if (status === 409) return 'CONFLICT'
  if (status === 422) return 'VALIDATION_ERROR'
  if (status >= 500) return 'INTERNAL'
  return 'BAD_REQUEST'
}

/** body 是否为可直接透传给 fetch 的原始类型(不做 JSON 序列化、不设 JSON Content-Type) */
function isRawBody(body: unknown): body is BodyInit {
  return (
    body instanceof FormData ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof Uint8Array
  )
}

/**
 * 统一错误构造。区分两种错误 body 形态:
 *   - 业务包装(mode ≠ 'bare'):{ success:false, error:<人类可读消息>, code?:<机器码> }
 *   - OAuth 裸错误(mode = 'bare'):{ error:<RFC 6749 错误码>, error_description?:<描述> }
 */
function buildHttpError(
  status: number,
  statusText: string,
  bodyJson: unknown,
  mode: ResponseMode,
  retryAfterHeader: string | null,
  requestId: string | undefined,
): PicoraApiError {
  const errBody = (bodyJson ?? {}) as {
    error?: unknown
    code?: unknown
    error_description?: unknown
    error_reason?: unknown
    meta?: Record<string, unknown>
  }
  const rawError = typeof errBody.error === 'string' ? errBody.error : undefined

  let code: string
  let message: string
  let meta = errBody.meta
  if (mode === 'bare') {
    // OAuth 形态:error 字段是机器码(invalid_grant 等)
    code = rawError ?? mapStatusToCode(status)
    message = typeof errBody.error_description === 'string'
      ? errBody.error_description
      : (rawError ?? `${status} ${statusText}`)
    // Picora 扩展:透传 error_reason 到 meta,供 OAuth 会话据此区分终态原因(如重放吊销)
    if (typeof errBody.error_reason === 'string') {
      meta = { ...(meta ?? {}), error_reason: errBody.error_reason }
    }
  } else {
    code = typeof errBody.code === 'string' ? errBody.code : mapStatusToCode(status)
    message = rawError ?? `${status} ${statusText}`
  }

  if (status === 429) {
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : 0
    return new PicoraRateLimitError(message, Number.isFinite(retryAfterSec) ? retryAfterSec : 0, requestId)
  }
  return new PicoraApiError(status, code, message, meta, requestId)
}

async function executeOnce<TResult>(
  cfg: HttpConfig,
  auth: AuthProvider,
  args: RequestArgs,
): Promise<TResult> {
  const url = new URL(cfg.baseUrl + args.path)
  if (args.query) {
    for (const [k, v] of Object.entries(args.query)) {
      if (v === undefined) continue
      url.searchParams.set(k, String(v))
    }
  }

  // 每次尝试都重新取 Authorization(401 刷新重试后拿到的是新 token)
  const authorization = await auth.getAuthorization()

  const headers: Record<string, string> = { 'User-Agent': cfg.userAgent }
  if (authorization !== null) headers['Authorization'] = authorization
  if (args.body !== undefined && !isRawBody(args.body)) {
    headers['Content-Type'] = 'application/json'
  }
  if (args.headers) Object.assign(headers, args.headers)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeout)
  const startedAt = Date.now()

  let response: Response
  try {
    response = await cfg.fetch(url.toString(), {
      method: args.method,
      headers,
      ...(args.body !== undefined
        ? { body: isRawBody(args.body) ? args.body : JSON.stringify(args.body) }
        : {}),
      signal: controller.signal,
    })
  } catch (err) {
    const cause = err instanceof Error ? err : new Error(String(err))
    throw new PicoraNetworkError(`fetch failed: ${cause.message}`, cause)
  } finally {
    clearTimeout(timer)
  }

  if (cfg.debug) {
    console.debug(`[picora-sdk] ${args.method} ${url.pathname} → ${response.status} (${Date.now() - startedAt}ms)`)
  }

  const requestId = response.headers.get('X-Request-Id') ?? undefined
  const mode = args.response ?? 'data'

  // 'raw':2xx/3xx 原样返回(调用方读 header / status / 二进制 body);≥400 走统一错误映射
  if (mode === 'raw') {
    if (response.status >= 400) {
      let bodyJson: unknown = null
      try {
        const text = await response.text()
        if (text.length > 0) bodyJson = JSON.parse(text)
      } catch {
        // 非 JSON 错误体:仅用 status 归类
      }
      throw buildHttpError(
        response.status, response.statusText, bodyJson, mode,
        response.headers.get('Retry-After'), requestId,
      )
    }
    return response as unknown as TResult
  }

  if (response.status === 204) {
    return undefined as TResult
  }

  const text = await response.text()

  if (response.ok) {
    if (mode === 'none') return undefined as TResult
    if (mode === 'text') return text as TResult
    let bodyJson: unknown = null
    if (text.length > 0) {
      try {
        bodyJson = JSON.parse(text)
      } catch {
        bodyJson = text
      }
    }
    if (mode === 'bare') return bodyJson as TResult
    // 'data':拆业务包装 { success, data }
    if (typeof bodyJson === 'object' && bodyJson !== null && 'data' in bodyJson) {
      return (bodyJson as { data: TResult }).data
    }
    return bodyJson as TResult
  }

  // 错误响应(非 raw 模式)
  let bodyJson: unknown = null
  if (text.length > 0) {
    try {
      bodyJson = JSON.parse(text)
    } catch {
      bodyJson = text
    }
  }
  throw buildHttpError(
    response.status, response.statusText, bodyJson, mode,
    response.headers.get('Retry-After'), requestId,
  )
}

/**
 * 带重试的请求调度。重试预算相互独立:
 *   - 429 退避与 5xx 退避各自计数(与 0.2.x 一致)
 *   - 401 刷新重试恰一次,不消耗 429/5xx 预算,也不受 args.retry:false 影响
 */
async function execute<TResult>(
  cfg: HttpConfig,
  auth: AuthProvider,
  args: RequestArgs,
): Promise<TResult> {
  let lastError: unknown
  let rateLimitBackoffIdx = 0
  let serverErrorBackoffIdx = 0
  let authRetried = false
  // +1 预留 401 刷新重试的额外一轮
  const totalAttempts = 2 + Math.max(RATE_LIMIT_BACKOFF_MS.length, SERVER_ERROR_BACKOFF_MS.length)

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      return await executeOnce<TResult>(cfg, auth, args)
    } catch (err) {
      lastError = err
      const autoRetryAllowed = args.retry !== false

      if (
        err instanceof PicoraApiError && err.status === 401
        && !authRetried && auth.onUnauthorized
      ) {
        authRetried = true
        // 刷新失败抛出的错误(如 PicoraReauthRequiredError)比原 401 信息量更大,直接透传
        const refreshed = await auth.onUnauthorized()
        if (refreshed) continue
        throw err
      }
      if (
        autoRetryAllowed && err instanceof PicoraRateLimitError
        && cfg.retryOnRateLimit && rateLimitBackoffIdx < RATE_LIMIT_BACKOFF_MS.length
      ) {
        const backoff = err.retryAfterSec > 0
          ? err.retryAfterSec * 1_000
          : (RATE_LIMIT_BACKOFF_MS[rateLimitBackoffIdx] ?? 4_000)
        rateLimitBackoffIdx += 1
        await delay(backoff)
        continue
      }
      if (
        autoRetryAllowed && cfg.retryOnServerError
        && serverErrorBackoffIdx < SERVER_ERROR_BACKOFF_MS.length
        && shouldRetryServerError(err)
      ) {
        await delay(SERVER_ERROR_BACKOFF_MS[serverErrorBackoffIdx] ?? 1_500)
        serverErrorBackoffIdx += 1
        continue
      }
      throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function createHttpCore(cfg: HttpConfig, auth: AuthProvider): HttpCore {
  return {
    config: cfg,
    request: <TResult>(args: RequestArgs) => execute<TResult>(cfg, auth, args),
  }
}

// 测试注入口(fake timers 校验退避间隔用)
export const __testing__ = { delay }
