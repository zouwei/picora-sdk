/**
 * 账户域类型(用户 / 订阅 / 已授权应用)。
 */

import type { Plan } from './common.js'

/** GET /v1/user/me 响应(0.2.x 曾误标 /v1/auth/me,该路径服务端不存在,0.3.0 修正) */
export interface User {
  id: string
  email: string | null
  nickname: string | null
  avatarUrl: string | null
  plan: Plan
  role: 'user' | 'admin'
  emailVerified: boolean
  /** 用户语言偏好(邮件模板语言选择用),如 'en' / 'zh-CN' */
  locale: string
  /** 账号是否激活(未被封禁) */
  isActive: boolean
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
