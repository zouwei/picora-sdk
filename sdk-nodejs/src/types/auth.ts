/**
 * 认证域类型(v0.3.0 账户域批次)。
 *
 * 覆盖 /v1/auth/* 无状态端点的入参与响应:验证码 / 注册登录 / 三方登录 /
 * 会话刷新 / 凭证校验 / 一次性导出令牌(OTT)。
 *
 * 与 core/jwt-session.ts 的分工:JwtSession 管完整会话生命周期(自动捕获
 * Set-Cookie、预刷新、401 兜底);本文件类型服务于 auth 命名空间的逐端点直调。
 */

import type { Plan } from './common.js'
import type { User } from './account.js'

/**
 * 邮箱验证码用途。
 *   - register:       注册 / 验证码登录(login/code 复用此类型)
 *   - reset_password:  密码重置(forgot-password 流程)
 *   - bind_email:      三方登录账号绑定新邮箱
 */
export type VerificationCodeType = 'register' | 'reset_password' | 'bind_email'

/** POST /v1/auth/send-code 入参 */
export interface SendCodeInput {
  /** 目标邮箱地址 */
  email: string
  /** 验证码用途 */
  type: VerificationCodeType
}

/** 仅含提示消息的响应(send-code / forgot-password / reset-password 等) */
export interface AuthMessageResult {
  /** 服务端提示消息(英文固定文案,非 i18n 展示用) */
  message: string
}

/** POST /v1/auth/register 入参 */
export interface RegisterInput {
  email: string
  /** 密码,最少 8 字符(服务端 bcrypt cost 12 存储) */
  password: string
  /** 6 位邮箱验证码(sendCode type=register 获取,5 分钟有效、单次使用) */
  code: string
}

/** POST /v1/auth/login 入参 */
export interface LoginInput {
  email: string
  password: string
}

/** POST /v1/auth/login/code 入参(验证码无密码登录,新邮箱自动注册) */
export interface LoginWithCodeInput {
  email: string
  /** 6 位邮箱验证码 */
  code: string
}

/**
 * 登录 / 注册成功响应数据。
 *
 * 注意:refresh token **不在**响应体中 —— 经 httpOnly Set-Cookie 下发。
 * 需要完整会话管理(自动刷新 / Cookie 捕获)请使用 createJwtSession;
 * auth 命名空间方法只返回本 body 数据。
 */
export interface AuthResult {
  /** JWT access token,15 分钟有效。请存内存,勿落 localStorage */
  accessToken: string
  /** 登录用户信息 */
  user: User
}

/** POST /v1/auth/refresh 响应数据 */
export interface RefreshSessionResult {
  /** 新的 JWT access token(15 分钟有效) */
  accessToken: string
  /** 用户 ID(nanoid 21 字符) */
  userId: string
  /** 用户当前套餐 */
  plan: Plan
}

/** GET /v1/auth/verify 响应数据(轻量凭证校验,替代「上传占位图测试连接」反模式) */
export interface AuthVerifyResult {
  /** 固定为 true(无效凭证直接 401,不会到达此字段) */
  valid: boolean
  /** 用户 ID(nanoid 21 字符) */
  userId: string
  /** 用户当前套餐(客户端可据此提前决定功能可见性) */
  plan: Plan
  /** 本次请求使用的认证方式 */
  authType: 'jwt' | 'apiKey'
  /** API Key 记录 ID,仅 authType='apiKey' 时存在 */
  apiKeyId?: string
}

/** POST /v1/auth/reset-password 入参 */
export interface ResetPasswordInput {
  email: string
  /** 6 位验证码(forgotPassword 发送) */
  code: string
  /** 新密码,最少 8 字符 */
  newPassword: string
}

/** POST /v1/auth/create-export-token 入参 */
export interface CreateExportTokenInput {
  /** API Key 记录 ID(须属于当前登录用户) */
  keyId: string
  /** 明文 API Key(sk_live_ 前缀,共 40 字符;服务端校验与 keyId 匹配) */
  apiKey: string
}

/** POST /v1/auth/create-export-token 响应数据(一次性导出令牌) */
export interface ExportTokenGrant {
  /** 一次性导出令牌,格式 ott_ + 43 字符;5 分钟过期、单次使用 */
  ott: string
  /** 过期时刻(ISO 8601) */
  expiresAt: string
}

/** POST /v1/auth/exchange-export-token 响应数据(完整导入载荷) */
export interface ExportTokenPayload {
  /** API 基地址,如 https://api.picora.me */
  apiUrl: string
  /** 被导入的明文 API Key */
  apiKey: string
  /** 图片外链域名,如 media.picora.me */
  imgDomain: string
  /** Key 所属用户概要(spec 未标 required,字段按可缺省处理) */
  user: {
    email?: string
    plan?: Plan
    nickname?: string
  }
}
