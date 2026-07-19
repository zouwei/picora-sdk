/**
 * 视频域类型(v0.3.0 媒体域批次)。
 *
 * 视频上传为异步转码流程:POST /v1/videos 返回 202 → 轮询
 * GET /v1/videos/{id}/status → 转码完成后 playbackUrl 可用。
 */

import type { UploadSource } from '../core/multipart.js'

/** 视频转码状态:processing=转码中,ready=可播放,error=转码失败 */
export type VideoStatus = 'processing' | 'ready' | 'error'

/** 视频元数据对象(需 Pro 及以上套餐) */
export interface Video {
  /** 视频唯一标识符,nanoid 21 字符 */
  id: string
  /** 视频标题,默认为去掉扩展名的文件名 */
  title: string
  status: VideoStatus
  /** 原始文件大小(字节),按此值计费存储配额 */
  sizeBytes: number
  /** 视频时长(秒),转码完成后写入 */
  durationSeconds?: number | null
  /** HLS 播放列表 URL(.m3u8),转码完成后可用;带宽降级时自动指向 360p 列表 */
  playbackUrl?: string | null
  /** 封面图 URL,转码完成后自动生成 */
  thumbnailUrl?: string | null
  isPublic: boolean
  createdAt: string
  updatedAt?: string
}

/** GET /v1/videos 查询参数(游标分页,按上传时间降序) */
export interface VideoListParams {
  /** 上一页响应的 nextCursor,首次请求不传 */
  cursor?: string
  /** 每页返回数量,最大 100,默认 20 */
  limit?: number
}

/** POST /v1/videos 上传入参(multipart/form-data) */
export interface UploadVideoInput {
  /** 视频文件内容(支持格式:MP4 / MOV / AVI) */
  file: UploadSource
  /** 文件名 */
  filename: string
  /** MIME 类型;缺省时 Blob 用自身 type,其余为 application/octet-stream */
  contentType?: string
  /** 视频标题,可选;不传则使用文件名(去掉扩展名) */
  title?: string
}

/** POST /v1/videos 202 响应:上传已受理,转码异步进行 */
export interface UploadVideoAccepted {
  /** 视频 ID,nanoid 21 字符,用于后续轮询状态 */
  videoId: string
  /** 固定为 processing */
  status: 'processing'
}

/** PATCH /v1/videos/{id} 入参(wire 字段 is_public 由 SDK 映射) */
export interface UpdateVideoInput {
  /** 新标题 */
  title?: string
  /** 是否公开 */
  isPublic?: boolean
}

/** GET /v1/videos/{id}/status 结果(前端轮询转码进度用) */
export interface VideoStatusInfo {
  id: string
  status: VideoStatus
  /** HLS 播放列表 URL,status=ready 时可用;带宽 degraded 时自动重写为 360p 列表 */
  playbackUrl: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  /** 转码进度 0-100,仅 processing 状态有值 */
  progress: number | null
}

/** GET /v1/videos/{id}/public-meta 结果(内部端点,仅 R2 fallback 行) */
export interface VideoPublicMeta {
  /** R2 object key */
  storageKey: string
  mimeType: string
  sizeBytes: number
  filename: string
}
