/**
 * 音频域类型(v0.12.0 音频托管;v0.3.0 媒体域批次进 SDK)。
 *
 * 与视频不同,音频上传是同步的:201 返回时文件已可立即播放(无转码流程)。
 */

import type { UploadSource } from '../core/multipart.js'

/** 音频资源对象(v0.12.0+) */
export interface Audio {
  /** 21 字符 nanoid */
  id: string
  type: 'audio'
  /** 公开 CDN URL,永久稳定 */
  url: string
  filename: string
  sizeBytes: number
  mimeType?: string
  title: string
  /** 封面图 URL —— 内嵌 ID3 / FLAC 封面或格式化默认 SVG */
  thumbnailUrl: string
  /** 时长(秒),无法解析时为 null */
  durationSeconds?: number | null
  /** 码率(kbps),无法解析时为 null */
  bitrate?: number | null
  /** 音频固定为 ready(无转码流程) */
  status: 'ready'
  isPublic: boolean
  createdAt: string
}

/** POST /v1/audio 上传入参(multipart/form-data) */
export interface UploadAudioInput {
  /** 音频文件内容;MIME 须在白名单内(mp3/m4a/wav/flac/ogg),服务端做幻数校验 */
  file: UploadSource
  /** 文件名 */
  filename: string
  /** MIME 类型;缺省时 Blob 用自身 type,其余为 application/octet-stream */
  contentType?: string
  /** 显示标题,缺省取文件名(最长 255 字符) */
  title?: string
}

/** PATCH /v1/audio/{id} 入参(两个字段均可选,空对象为 no-op;wire 字段 is_public 由 SDK 映射) */
export interface UpdateAudioInput {
  /** 新标题(最长 255 字符) */
  title?: string
  /** 是否公开 */
  isPublic?: boolean
}
