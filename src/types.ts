/**
 * v0.31 `@picora/sdk` 公开类型。
 *
 * 设计：v0.1.0 不直接 import @picora/shared（保持 SDK 独立分发，免内部包污染消费者）。
 * v0.2.0 起将由 OpenAPI codegen 自动产生 paths/components 对应类型，目前手写一组高频
 * 类型供消费者使用，与服务端保持字段名一致。
 */

export type Plan = 'none' | 'trial' | 'pro' | 'pro_plus'

export type KeyScopeV2 =
  | 'media.read'
  | 'media.write'
  | 'media.delete'
  | 'kb.read'
  | 'kb.write'
  | 'account.read'
  | 'usage.read'

/** GET /v1/auth/me 响应 */
export interface User {
  id: string
  email: string | null
  nickname: string | null
  avatarUrl: string | null
  plan: Plan
  role: 'user' | 'admin'
  emailVerified: boolean
  locale?: string
  createdAt: string
}

/** GET /v1/me/subscription 响应 */
export interface Subscription {
  plan: Plan
  planName: Plan
  features: {
    video_enabled: boolean
    kb_enabled: boolean
    custom_domain: boolean
    api_keys_max: number
  }
  limits: {
    img_storage_bytes: number
    img_bandwidth_bytes: number
    media_storage_bytes: number
    media_bandwidth_bytes: number
    doc_count_limit: number
    kb_count_limit: number
  }
  trialActivated: boolean
  currentPeriodEnd: string | null
  cachedAt: string
}

/** v0.30 GET /v1/me/apps 单条记录 */
export interface AuthorizedApp {
  id: string
  clientName: string
  logoUrl: string | null
  scopes: string[]
  status: 'approved' | 'pending' | 'rejected'
  isFirstParty: boolean
  createdAt: string
  lastUsedAt: string | null
}

/** GET /v1/images/:id 单条记录 */
export interface Image {
  id: string
  userId: string
  filename: string
  title?: string | null
  mimeType: string
  sizeBytes: number
  width?: number | null
  height?: number | null
  tags: string[]
  isPublic: boolean
  url: string
  createdAt: string
  updatedAt?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

export interface ImageListParams {
  cursor?: string
  pageSize?: number
  isPublic?: boolean
  tag?: string
}

/** RateLimit-* 头解析结果 */
export interface RateLimitInfo {
  /** 当前窗口的总配额 */
  limit: number
  /** 剩余配额 */
  remaining: number
  /** 重置时间（Unix 秒）；若服务端给的是相对秒数，已加上 Date.now() */
  resetAt: number
}
