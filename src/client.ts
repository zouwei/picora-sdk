import {
  PicoraApiError,
  PicoraNetworkError,
  PicoraRateLimitError,
} from './errors'
import type {
  AuthorizedApp,
  Collection,
  CollectionListParams,
  CollectionType_Item,
  CreateCollectionInput,
  CreateCollectionTypeInput,
  CreateEpisodeInput,
  Episode,
  EpisodeListParams,
  EpisodeSyncInput,
  EpisodeSyncResult,
  Image,
  ImageListParams,
  PaginatedResponse,
  Subscription,
  UpdateCollectionInput,
  UpdateEpisodeInput,
  User,
} from './types'

/**
 * v0.31 `@picora/sdk` fluent client。
 *
 * 设计文档：v0.31.0-public-openapi-developer-portal.md §4.7~4.8。
 *
 * v0.1.0 已实现的命名空间：
 *   - auth.me() / auth.subscription()
 *   - images.list() / images.get() / images.delete()
 *   - apps.list() / apps.revoke()
 *
 * 待 v0.2 通过 OpenAPI codegen 补齐 videos / docs / kbs / mcp 等。
 *
 * 重试策略：
 *   429 → 默认重试 3 次，指数退避（1s / 2s / 4s 上限），可由 `retryOnRateLimit:false` 关闭
 *   5xx → 默认重试 2 次（500ms / 1500ms 退避）
 *   网络错误 → 同 5xx
 */

export interface PicoraClientOptions {
  /** Bearer token：API Key（sk_live_ 前缀）或 OAuth access_token。互斥。 */
  apiKey?: string
  oauthToken?: string

  /** API 基地址。默认 https://api.picora.me */
  baseUrl?: string

  /** 请求超时（ms）。默认 30_000。 */
  timeout?: number

  /** 自定义 fetch 实现（用于 SSR / 测试 mock）。默认 globalThis.fetch。 */
  fetch?: typeof fetch

  /** 自动重试 429。默认 true。 */
  retryOnRateLimit?: boolean

  /** 自动重试 5xx / 网络错误。默认 true。 */
  retryOnServerError?: boolean

  /** 用户代理；SDK 自动追加版本号，最终如 `MyApp/1.2 @picora/sdk/0.1.0`。 */
  userAgent?: string

  /** debug 日志；默认 false。 */
  debug?: boolean
}

const SDK_VERSION = '0.2.0'   // v0.61.4：新增 collections / collectionTypes / episodes 命名空间
const DEFAULT_BASE_URL = 'https://api.picora.me'
const DEFAULT_TIMEOUT_MS = 30_000
const RATE_LIMIT_BACKOFF_MS = [1_000, 2_000, 4_000] as const
const SERVER_ERROR_BACKOFF_MS = [500, 1_500] as const

interface NormalizedConfig {
  baseUrl: string
  timeout: number
  fetch: typeof fetch
  retryOnRateLimit: boolean
  retryOnServerError: boolean
  authorization: string
  userAgent: string
  debug: boolean
}

function normalize(opts: PicoraClientOptions): NormalizedConfig {
  if (opts.apiKey && opts.oauthToken) {
    throw new Error('PicoraClient: apiKey and oauthToken are mutually exclusive')
  }
  if (!opts.apiKey && !opts.oauthToken) {
    throw new Error('PicoraClient: either apiKey or oauthToken must be provided')
  }
  const userAgent = opts.userAgent
    ? `${opts.userAgent} @picora/sdk/${SDK_VERSION}`
    : `@picora/sdk/${SDK_VERSION}`
  const fetchImpl = opts.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('PicoraClient: fetch is not available; pass options.fetch on Node < 18')
  }
  return {
    baseUrl: (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
    timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
    fetch: fetchImpl,
    retryOnRateLimit: opts.retryOnRateLimit !== false,
    retryOnServerError: opts.retryOnServerError !== false,
    authorization: `Bearer ${opts.apiKey ?? opts.oauthToken ?? ''}`,
    userAgent,
    debug: opts.debug === true,
  }
}

interface RequestArgs {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 内部 HTTP 调度：构建 URL、注入 Auth + UA、超时、错误归类、按策略重试。
 */
async function execute<TResult>(cfg: NormalizedConfig, args: RequestArgs): Promise<TResult> {
  let lastError: unknown
  const totalAttempts = 1 + Math.max(RATE_LIMIT_BACKOFF_MS.length, SERVER_ERROR_BACKOFF_MS.length)
  let rateLimitBackoffIdx = 0
  let serverErrorBackoffIdx = 0

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      return await executeOnce<TResult>(cfg, args)
    } catch (err) {
      lastError = err
      if (err instanceof PicoraRateLimitError && cfg.retryOnRateLimit
        && rateLimitBackoffIdx < RATE_LIMIT_BACKOFF_MS.length) {
        const backoff = err.retryAfterSec > 0
          ? err.retryAfterSec * 1_000
          : (RATE_LIMIT_BACKOFF_MS[rateLimitBackoffIdx] ?? 4_000)
        rateLimitBackoffIdx += 1
        await delay(backoff)
        continue
      }
      if (cfg.retryOnServerError
        && serverErrorBackoffIdx < SERVER_ERROR_BACKOFF_MS.length
        && shouldRetryServerError(err)) {
        await delay(SERVER_ERROR_BACKOFF_MS[serverErrorBackoffIdx] ?? 1_500)
        serverErrorBackoffIdx += 1
        continue
      }
      throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function shouldRetryServerError(err: unknown): boolean {
  if (err instanceof PicoraRateLimitError) return false
  if (err instanceof PicoraApiError) return err.status >= 500 && err.status < 600
  if (err instanceof PicoraNetworkError) return err.cause?.name !== 'AbortError'
  return false
}

async function executeOnce<TResult>(cfg: NormalizedConfig, args: RequestArgs): Promise<TResult> {
  const url = new URL(cfg.baseUrl + args.path)
  if (args.query) {
    for (const [k, v] of Object.entries(args.query)) {
      if (v === undefined) continue
      url.searchParams.set(k, String(v))
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeout)

  let response: Response
  try {
    response = await cfg.fetch(url.toString(), {
      method: args.method,
      headers: {
        Authorization: cfg.authorization,
        'User-Agent': cfg.userAgent,
        ...(args.body !== undefined && !(args.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
      },
      ...(args.body !== undefined
        ? { body: args.body instanceof FormData ? args.body : JSON.stringify(args.body) }
        : {}),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    const cause = err instanceof Error ? err : new Error(String(err))
    throw new PicoraNetworkError(`fetch failed: ${cause.message}`, cause)
  } finally {
    clearTimeout(timer)
  }

  const requestId = response.headers.get('X-Request-Id') ?? undefined
  if (response.status === 204) {
    return undefined as TResult
  }

  let bodyJson: unknown = null
  const text = await response.text()
  if (text.length > 0) {
    try {
      bodyJson = JSON.parse(text)
    } catch {
      bodyJson = text
    }
  }

  if (response.ok) {
    if (typeof bodyJson === 'object' && bodyJson !== null && 'data' in bodyJson) {
      return (bodyJson as { data: TResult }).data
    }
    return bodyJson as TResult
  }

  // 错误响应
  const errBody = (bodyJson ?? {}) as {
    error?: string
    code?: string
    meta?: Record<string, unknown>
  }
  const message = errBody.error ?? `${response.status} ${response.statusText}`
  const code = errBody.code ?? mapStatusToCode(response.status)

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After')
    const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : 0
    throw new PicoraRateLimitError(message, Number.isFinite(retryAfterSec) ? retryAfterSec : 0, requestId)
  }
  throw new PicoraApiError(response.status, code, message, errBody.meta, requestId)
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

// ─── Fluent client 命名空间 ───────────────────────────────────

export interface PicoraClient {
  readonly auth: {
    me(): Promise<User>
    subscription(): Promise<Subscription>
  }
  readonly images: {
    list(params?: ImageListParams): Promise<PaginatedResponse<Image>>
    get(id: string): Promise<Image>
    delete(id: string): Promise<void>
  }
  readonly apps: {
    list(): Promise<AuthorizedApp[]>
    revoke(clientId: string): Promise<void>
  }
  /** v0.61.0：合集（Collections）— 多媒体内容容器。 */
  readonly collections: {
    list(params?: CollectionListParams): Promise<PaginatedResponse<Collection>>
    get(id: string): Promise<Collection>
    create(input: CreateCollectionInput): Promise<Collection>
    update(id: string, patch: UpdateCollectionInput): Promise<Collection>
    delete(id: string, opts?: { cascade?: boolean }): Promise<void>
  }
  /** v0.61.0：合集类型字典（内置 + 用户自定义）。 */
  readonly collectionTypes: {
    list(): Promise<CollectionType_Item[]>
    create(input: CreateCollectionTypeInput): Promise<CollectionType_Item>
    delete(id: string): Promise<void>
  }
  /** v0.61.1：剧集 CRUD + episode.sync 第三方接入主链路。 */
  readonly episodes: {
    list(collectionId: string, params?: EpisodeListParams): Promise<PaginatedResponse<Episode>>
    get(collectionId: string, id: string): Promise<Episode>
    create(collectionId: string, input: CreateEpisodeInput): Promise<Episode>
    update(collectionId: string, id: string, patch: UpdateEpisodeInput): Promise<Episode>
    delete(collectionId: string, id: string): Promise<void>
    /**
     * 按剧集同步资产（第三方 AI 视频生成软件主入口）。
     *
     * 行为：
     *   - 自动 Idempotency-Key（如未传入则用 input.idempotencyKey；都未提供则单次不去重）
     *   - 返回 applied[] 含每个 asset 的 applied / skipped_duplicate / failed 三态
     *   - 服务端写入 collection_episode_assets 关联 + sys_audit_logs 审计
     */
    sync(collectionId: string, episodeId: string, input: EpisodeSyncInput): Promise<EpisodeSyncResult>
  }
}

export function createPicoraClient(options: PicoraClientOptions): PicoraClient {
  const cfg = normalize(options)

  return {
    auth: {
      me: () => execute<User>(cfg, { method: 'GET', path: '/v1/auth/me' }),
      subscription: () => execute<Subscription>(cfg, { method: 'GET', path: '/v1/me/subscription' }),
    },
    images: {
      list: (params) => {
        const query: Record<string, string | number | boolean | undefined> = {}
        if (params?.cursor !== undefined) query['cursor'] = params.cursor
        if (params?.pageSize !== undefined) query['pageSize'] = params.pageSize
        if (params?.isPublic !== undefined) query['isPublic'] = params.isPublic
        if (params?.tag !== undefined) query['tag'] = params.tag
        return execute<PaginatedResponse<Image>>(cfg, { method: 'GET', path: '/v1/images', query })
      },
      get: (id) => execute<Image>(cfg, { method: 'GET', path: `/v1/images/${encodeURIComponent(id)}` }),
      delete: async (id) => {
        await execute<void>(cfg, { method: 'DELETE', path: `/v1/images/${encodeURIComponent(id)}` })
      },
    },
    apps: {
      list: () => execute<AuthorizedApp[]>(cfg, { method: 'GET', path: '/v1/me/apps' }),
      revoke: async (clientId) => {
        await execute<void>(cfg, { method: 'DELETE', path: `/v1/me/apps/${encodeURIComponent(clientId)}` })
      },
    },
    collections: {
      list: (params) => {
        const query: Record<string, string | number | boolean | undefined> = {}
        if (params?.cursor !== undefined) query['cursor'] = params.cursor
        if (params?.limit !== undefined) query['limit'] = params.limit
        if (params?.sort !== undefined) query['sort'] = params.sort
        if (params?.type !== undefined && params.type !== 'all') query['type'] = params.type
        if (params?.kbType !== undefined && params.kbType !== 'all') query['kbType'] = params.kbType
        if (params?.includeDeleted) query['includeDeleted'] = 'true'
        return execute<PaginatedResponse<Collection>>(cfg, { method: 'GET', path: '/v1/collections', query })
      },
      get: (id) => execute<Collection>(cfg, { method: 'GET', path: `/v1/collections/${encodeURIComponent(id)}` }),
      create: (input) =>
        execute<Collection>(cfg, { method: 'POST', path: '/v1/collections', body: input }),
      update: (id, patch) =>
        execute<Collection>(cfg, {
          method: 'PATCH',
          path: `/v1/collections/${encodeURIComponent(id)}`,
          body: patch,
        }),
      delete: async (id, opts) => {
        const baseArgs = {
          method: 'DELETE' as const,
          path: `/v1/collections/${encodeURIComponent(id)}`,
        }
        await execute<void>(cfg, opts?.cascade
          ? { ...baseArgs, query: { cascade: 'true' } }
          : baseArgs)
      },
    },
    collectionTypes: {
      list: async () => {
        const result = await execute<{ items: CollectionType_Item[] } | CollectionType_Item[]>(
          cfg,
          { method: 'GET', path: '/v1/collection-types' },
        )
        // 服务端响应形态 { items: [...] }；data 已被 execute() 拆封，这里再 normalize 一次保护
        if (Array.isArray(result)) return result
        if (result && typeof result === 'object' && 'items' in result) {
          return (result as { items: CollectionType_Item[] }).items
        }
        return []
      },
      create: (input) =>
        execute<CollectionType_Item>(cfg, { method: 'POST', path: '/v1/collection-types', body: input }),
      delete: async (id) => {
        await execute<void>(cfg, {
          method: 'DELETE',
          path: `/v1/collection-types/${encodeURIComponent(id)}`,
        })
      },
    },
    episodes: {
      list: (collectionId, params) => {
        const query: Record<string, string | number | boolean | undefined> = {}
        if (params?.cursor !== undefined) query['cursor'] = params.cursor
        if (params?.limit !== undefined) query['limit'] = params.limit
        if (params?.status !== undefined && params.status !== 'all') query['status'] = params.status
        if (params?.includeDeleted) query['includeDeleted'] = 'true'
        return execute<PaginatedResponse<Episode>>(cfg, {
          method: 'GET',
          path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes`,
          query,
        })
      },
      get: (collectionId, id) =>
        execute<Episode>(cfg, {
          method: 'GET',
          path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(id)}`,
        }),
      create: (collectionId, input) =>
        execute<Episode>(cfg, {
          method: 'POST',
          path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes`,
          body: input,
        }),
      update: (collectionId, id, patch) =>
        execute<Episode>(cfg, {
          method: 'PATCH',
          path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(id)}`,
          body: patch,
        }),
      delete: async (collectionId, id) => {
        await execute<void>(cfg, {
          method: 'DELETE',
          path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(id)}`,
        })
      },
      sync: (collectionId, episodeId, input) =>
        execute<EpisodeSyncResult>(cfg, {
          method: 'POST',
          path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(episodeId)}/sync`,
          body: input,
        }),
    },
  }
}

// 用于测试场景手动注入超时（通常不需要导出）
export const __testing__ = { delay }
