/**
 * 合集域类型(v0.61.0 Collections / 合集类型 / 剧集 / episode.sync)。
 */

// ─── v0.61.0 Collections(合集)类型 ───────────────────────────────

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
  /** v0.38 语义保留(creator/output)。 */
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
  /** 仅可扩,不可缩(服务端拒绝缩减)。 */
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

// ─── v0.61.1 Episodes(剧集)类型 ───────────────────────────────────

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

// ─── v0.61.2 episode.sync(第三方 AI 视频接入主链路)─────────────

export interface EpisodeSyncAssetRef {
  resourceType: CollectionResourceType
  resourceId: string
  sourceHash?: string
  metadata?: Record<string, string | number | boolean>
}

export interface EpisodeSyncInput {
  /** 客户端幂等键(建议 `${clientId}-${batchId}` 或 nanoid)。同 owner 下 24 小时内重发返回首次响应。 */
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

// ─── v0.3.0 docs/KB 域批次:合集 v3 多资源清单 ─────────────────────

/** GET /v1/collections/{id}/manifest 选项(协议参数 version=3 由 SDK 固定携带) */
export interface CollectionManifestParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 每页条数,最大 1000 */
  limit?: number
}

/** v3 清单单条资源(doc / image / video / audio 混合) */
export interface CollectionManifestItem {
  /** 资源类型 discriminator */
  resourceType: CollectionResourceType
  /** 资源 ID */
  id: string
  /** 资源名(文档为 relativePath / filename,媒体为 filename) */
  name: string
  /** 内容 SHA-256 hex;媒体资源可能为 null */
  sourceHash: string | null
  /** 字节数 */
  sizeBytes: number
  /** 最后更新时间(ISO 8601) */
  updatedAt: string
}

/** v3 清单各资源类型计数 */
export interface CollectionManifestCounts {
  doc: number
  image: number
  video: number
  audio: number
  total: number
}

/** GET /v1/collections/{id}/manifest 结果(v3 多资源清单,游标分页) */
export interface CollectionManifest {
  /** 协议版本(当前恒为 3) */
  protocolVersion: number
  /** 合集 ID */
  collectionId: string
  /** 资源轻量列表 */
  items: CollectionManifestItem[]
  /** 各类型计数 */
  counts: CollectionManifestCounts
  /** 下一页游标;null 表示已是最后一页 */
  nextCursor: string | null
  /** 服务端当前时间(ISO 8601) */
  serverTime: string
}
