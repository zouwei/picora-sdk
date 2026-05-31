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
  // v0.61.0
  | 'collection.read'
  | 'collection.write'
  | 'collection.delete'
  | 'episode.write'

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

// ─── v0.61.0 Collections（合集）类型 ───────────────────────────────

/** 10 个内置合集类型 + 自定义。 */
export type CollectionType =
  | 'knowledge_base'
  | 'aigc'
  | 'comic'
  | 'audio_drama'
  | 'photo_album'
  | 'album'
  | 'comic_drama'
  | 'movie'
  | 'tv_series'
  | 'custom'

/** 4 个内置资源类型。 */
export type CollectionResourceType = 'doc' | 'image' | 'video' | 'audio'

/** GET /v1/collections / GET /v1/collections/:id 单条记录。 */
export interface Collection {
  id: string
  name: string
  slug: string
  collectionType: CollectionType
  allowedResourceTypes: CollectionResourceType[]
  customTypeId: string | null
  /** v0.38 语义保留（creator/output）。 */
  kbType: 'creator' | 'output'
  description: string | null
  docCount: number
  sizeBytes: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface CollectionListParams {
  cursor?: string
  limit?: number
  sort?: 'updated_at' | 'name'
  type?: CollectionType | 'all'
  kbType?: 'all' | 'creator' | 'output'
  includeDeleted?: boolean
}

export interface CreateCollectionInput {
  name: string
  slug?: string
  description?: string
  collectionType?: CollectionType
  allowedResourceTypes?: CollectionResourceType[]
  customTypeId?: string
  kbType?: 'creator' | 'output'
}

export interface UpdateCollectionInput {
  name?: string
  description?: string
  isDefault?: boolean
  /** 仅可扩，不可缩（服务端拒绝缩减）。 */
  allowedResourceTypes?: CollectionResourceType[]
}

export interface CollectionType_Item {
  id: string
  ownerId: string | null
  name: string
  slug: string
  allowedResourceTypes: CollectionResourceType[]
  icon: string | null
  description: string | null
  sortOrder: number
  isBuiltin: boolean
  createdAt: string
}

export interface CreateCollectionTypeInput {
  name: string
  slug: string
  allowedResourceTypes: CollectionResourceType[]
  icon?: string
  description?: string
}

// ─── v0.61.1 Episodes（剧集）类型 ───────────────────────────────────

export type EpisodeStatus = 'draft' | 'generating' | 'ready' | 'published' | 'archived'

export interface Episode {
  id: string
  collectionId: string
  sequenceNo: number
  title: string
  description: string | null
  status: EpisodeStatus
  coverImageId: string | null
  assetCount: number
  sizeBytes: number
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface EpisodeListParams {
  cursor?: string
  limit?: number
  status?: EpisodeStatus | 'all'
  includeDeleted?: boolean
}

export interface CreateEpisodeInput {
  sequenceNo: number
  title: string
  description?: string
  coverImageId?: string
  status?: EpisodeStatus
}

export interface UpdateEpisodeInput {
  sequenceNo?: number
  title?: string
  description?: string
  coverImageId?: string
  status?: EpisodeStatus
}

// ─── v0.61.2 episode.sync（第三方 AI 视频接入主链路）─────────────

export interface EpisodeSyncAssetRef {
  resourceType: CollectionResourceType
  resourceId: string
  sourceHash?: string
  metadata?: Record<string, string | number | boolean>
}

export interface EpisodeSyncInput {
  /** 客户端幂等键（建议 `${clientId}-${batchId}` 或 nanoid）。同 owner 下 24 小时内重发返回首次响应。 */
  idempotencyKey?: string
  assets: EpisodeSyncAssetRef[]
}

export interface EpisodeSyncApplied {
  resourceType: CollectionResourceType
  resourceId: string
  status: 'applied' | 'skipped_duplicate' | 'failed'
  reason?: string
}

export interface EpisodeSyncResult {
  episodeId: string
  collectionId: string
  applied: EpisodeSyncApplied[]
  appliedCount: number
  skippedCount: number
  failedCount: number
  totalCount: number
  syncedAt: string
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
