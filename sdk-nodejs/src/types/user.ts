/**
 * 用户域类型(v0.3.0 账户域批次)。
 *
 * 覆盖 /v1/user/me* 端点:资料更新 / 用量统计 / 登录身份 / 密码管理 /
 * 头像上传 / 限流状态 / 文档历史版本清理。User 本体沿用 types/account.ts。
 */

import type { Plan } from './common.js'
import type { UploadSource } from '../core/multipart.js'

/** PATCH /v1/user/me 入参(仅上送提供的字段) */
export interface UpdateUserInput {
  /** 昵称,最长 50 字符 */
  nickname?: string
  /** 头像图片 URL(建议使用 Picora 自身存储的图片;文件上传走 uploadAvatar) */
  avatarUrl?: string
  /** 语言偏好,影响邮件模板语言 */
  locale?: 'en' | 'zh-CN'
}

/** 图片资源用量 */
export interface ImageUsage {
  /** 已用图片存储(字节) */
  storageUsed: number
  /** 本月已用图片 CDN 带宽(字节,估算值;CDN 边缘缓存命中未计入,实际值偏低) */
  bandwidthUsed: number
  /** 今日上传次数 */
  uploadCountToday: number
  /** 本月上传次数 */
  uploadCountMonth: number
  /** 图片总数 */
  totalCount: number
}

/** 视频资源用量 */
export interface VideoUsage {
  /** 已用视频存储(字节;未开通视频的套餐始终为 0) */
  storageUsed: number
  /** 本月已用视频 CDN 带宽(字节;Cron 每小时从 CDN 拉取后按存储占比分摊,存在轻微延迟) */
  bandwidthUsed: number
}

/** GET /v1/user/me/usage 响应数据 */
export interface UsageStats {
  plan: Plan
  images: ImageUsage
  videos: VideoUsage
}

/** DELETE /v1/user/me/doc-revisions 响应数据(单批最多 200 条) */
export interface ClearDocRevisionsResult {
  /** 本批删除的版本条数 */
  deleted: number
  /** 本批释放的存储字节数 */
  freedBytes: number
  /** 是否还有剩余版本待清理(true 时应继续调用直到 false) */
  hasMore: boolean
}

/** 单档限流状态(v0.12.0+) */
export interface RateLimitTierStatus {
  /** 当前档位总额度(admin 用户已含 ×10 倍率) */
  limit: number
  /** 当前窗口剩余可用次数(不小于 0) */
  remaining: number
  /** 距窗口重置的秒数 */
  resetSeconds: number
  /** 窗口重置时刻(ISO 8601) */
  resetAt: string
}

/** GET /v1/user/me/rate-limits 响应数据(读取本身不消耗限流额度) */
export interface UserRateLimits {
  /** 读档(list / get)分钟桶 */
  read: RateLimitTierStatus
  /** 上传档分钟桶 */
  upload: RateLimitTierStatus
  /** 变更档(update / delete)分钟桶 */
  mutation: RateLimitTierStatus
  /** 每小时合计上限 */
  hourly: RateLimitTierStatus
}

/**
 * 登录身份提供方。
 *   email=邮箱密码,firebase=Google/Apple,wechat=微信,phone=手机号
 */
export type IdentityProvider = 'email' | 'firebase' | 'wechat' | 'phone'

/** 已绑定登录身份(provider_id 服务端脱敏,不返回完整值) */
export interface Identity {
  /** 身份记录 ID,用于解绑操作 */
  id: string
  provider: IdentityProvider
  /** 脱敏后的 provider ID(邮箱:前 2 位+***@domain;手机:前 3 位+****+后 4 位) */
  providerIdMasked: string
  /** 绑定时间(ISO 8601) */
  createdAt: string
}

/** POST /v1/user/me/avatar 入参(multipart;JPEG/PNG/WebP/GIF,≤ 2 MB) */
export interface UploadAvatarInput {
  /** 头像文件内容 */
  file: UploadSource
  /** 文件名(服务端据扩展名校验格式白名单) */
  filename: string
  /** MIME 类型;缺省时 Blob 用自身 type,其余为 application/octet-stream */
  contentType?: string
}

/** POST /v1/user/me/avatar 响应数据 */
export interface AvatarUploadResult {
  /** 新头像 URL(含 ?v=timestamp cache-bust 参数) */
  avatarUrl: string
}
