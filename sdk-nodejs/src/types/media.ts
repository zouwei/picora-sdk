/**
 * 媒体域类型 —— 图片 + 增量同步 + 统一媒体列表(v0.3.0 媒体域批次补齐)。
 *
 * videos / audio / TUS / watermark / storage-tier 类型分别在
 * types/videos.ts / types/audio.ts / types/uploads.ts / types/watermark.ts /
 * types/storage-tier.ts 中定义。
 */

import type { UploadSource } from '../core/multipart.js'

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

/**
 * GET /v1/images 查询参数。
 * 注:0.2.x 曾暴露 `isPublic` 过滤,但服务端 `/v1/images` 并不支持按可见性过滤
 * (仅支持 tag + 时间范围),0.3.0 移除该无效参数,改暴露 startDate/endDate。
 */
export interface ImageListParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 每页条数(映射到服务端 limit 参数);缺省服务端默认 20 */
  pageSize?: number
  /** 按标签精确筛选 */
  tag?: string
  /** 起始时间(ISO 8601,含);按 created_at 过滤 */
  startDate?: string
  /** 截止时间(ISO 8601,含);按 created_at 过滤 */
  endDate?: string
}

/** POST /v1/images 上传入参(multipart/form-data) */
export interface UploadImageInput {
  /** 文件内容(Blob / ArrayBuffer / Uint8Array,含 Node Buffer) */
  file: UploadSource
  /** 文件名(服务端据扩展名做格式白名单校验) */
  filename: string
  /** MIME 类型;缺省时 Blob 用自身 type,其余为 application/octet-stream */
  contentType?: string
  /** 标签列表;SDK 自动序列化为 form 字段 tags 的 JSON 字符串 */
  tags?: string[]
  /** 是否公开,默认 true(form-data 限制,SDK 自动转字符串 'true'/'false') */
  isPublic?: boolean
}

/** PATCH /v1/images/{id} 入参(全部可选,仅传需要修改的字段;wire 字段 is_public 由 SDK 映射) */
export interface UpdateImageInput {
  /** 图片标题(文件名展示用) */
  title?: string
  /** 新的标签列表(全量替换,非增量更新) */
  tags?: string[]
  /** 是否公开可访问;改为 false 后图片外链返回 403 */
  isPublic?: boolean
}

/** DELETE /v1/images 批量删除结果 */
export interface ImageBatchDeleteResult {
  /** 成功删除数量 */
  deleted: number
  /** 删除失败数量(通常因图片不属于当前用户) */
  failed: number
}

/** POST /v1/images/batch-move 入参 */
export interface ImageBatchMoveInput {
  /** 图片 ID 列表(nanoid 11 字符),单次最多 50 张 */
  ids: string[]
  /** 目标合集 ID(nanoid 21 字符);null = 移出合集(kb_id 置 NULL) */
  kbId: string | null
}

/** POST /v1/images/batch-move 结果 */
export interface ImageBatchMoveResult {
  /** 实际迁移的图片数量 */
  moved: number
}

/** POST /v1/images/exists 结果(v0.37.0 批量哈希查重) */
export interface ImageExistsResult {
  /** 命中映射:sha256 hash → { id, url } */
  existing: Record<string, { id: string; url: string }>
  /** 未命中的 hash 数组,客户端据此决定继续上传哪些 */
  missing: string[]
}

/** POST /v1/images/{id}/sign 结果 */
export interface SignImageResult {
  /** 含 sig / exp 参数的完整签名 URL */
  signedUrl: string
  /** 过期时间(ISO 8601) */
  expiresAt: string
  /** 过期 Unix 时间戳(秒) */
  exp: number
}

/** GET /v1/images/{id}/public-meta 结果(内部端点,供 media-serve 回源) */
export interface ImagePublicMeta {
  /** R2 object key */
  storageKey: string
  mimeType: string
  isPublic: boolean
}

/** GET /v1/sync/state 查询参数(v0.37.0 增量同步) */
export interface SyncStateParams {
  /** 资源类型过滤;'all'(默认)同时返回 image / video / audio 三类 */
  type?: 'image' | 'video' | 'audio' | 'all'
  /** 上一页响应的 nextCursor(base64 编码);首次同步不传 */
  since?: string
  /** 单次返回条数,默认 100,上限 500 */
  limit?: number
}

/** 增量同步 upsert 事件(新增或更新) */
export interface SyncUpsertChange {
  op: 'upsert'
  type: 'image' | 'video' | 'audio'
  id: string
  updatedAt: string
  url?: string
  contentHash?: string | null
  sizeBytes?: number
  mimeType?: string
  filename?: string
  isPublic?: boolean
}

/** 增量同步 delete 事件(updatedAt 为 sync_tombstones.deleted_at,墓碑保留 30 天) */
export interface SyncDeleteChange {
  op: 'delete'
  type: 'image' | 'video' | 'audio'
  id: string
  updatedAt: string
}

/** 增量同步变更事件(按 (updated_at, id) 升序) */
export type SyncChange = SyncUpsertChange | SyncDeleteChange

/** GET /v1/sync/state 结果 */
export interface SyncStateResult {
  changes: SyncChange[]
  /** 下一页游标;null 表示已到末页 */
  nextCursor: string | null
  hasMore: boolean
}

/** 统一媒体资源类型 discriminator */
export type MediaType = 'image' | 'video' | 'audio'

/**
 * 统一媒体列表元素(v0.12.0+)。type 字段是 discriminator:
 * image / video / audio 三种形态字段集合不同(如 playbackUrl 仅视频存在)。
 */
export interface MediaItem {
  /** 图片 11 字符,视频 / 音频 21 字符 nanoid */
  id: string
  type: MediaType
  /** 图片 / 音频公开 CDN URL(视频此字段不存在) */
  url?: string
  /** 视频 HLS 播放地址(图片 / 音频不存在) */
  playbackUrl?: string
  /** 缩略图 / 封面 URL */
  thumbnailUrl?: string
  filename: string
  title?: string
  sizeBytes: number
  /** 视频 / 音频时长(秒),图片此字段不存在 */
  durationSeconds?: number | null
  /** 音频码率(kbps),其它类型不存在 */
  bitrate?: number | null
  /** 图片 / 音频固定 ready;视频可能为 processing / ready / failed */
  status?: string
  isPublic: boolean
  /** 图片标签,视频 / 音频不存在 */
  tags?: string[]
  createdAt: string
}

/** GET /v1/media 查询参数 */
export interface MediaListParams {
  /** 限定资源类型,缺省返回全部混合 */
  type?: MediaType
  /** 上一页 nextCursor,首页留空 */
  cursor?: string
  /** 每页数量,1-100,默认 20 */
  limit?: number
  /** 标题 / 文件名模糊搜索 */
  q?: string
  /** 按可见性过滤(wire 参数名 is_public,SDK 自动映射) */
  isPublic?: boolean
}

/** DELETE /v1/media 批量删除条目引用 */
export interface MediaRef {
  /** 资源 ID。图片 11 字符,视频 / 音频 21 字符 */
  id: string
  type: MediaType
}

/** DELETE /v1/media 批量删除结果(部分失败不回滚) */
export interface MediaBatchDeleteResult {
  /** 成功删除的资源 ID 列表 */
  deleted: string[]
  /** 失败列表(资源不存在 / 权限不匹配 / 存储后端故障) */
  failed: Array<{ id: string; type: string; reason: string }>
}
