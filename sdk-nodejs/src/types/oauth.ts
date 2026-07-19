/**
 * OAuth 域类型(v0.3.0)。
 *
 * 命名约定:
 *   - RFC 裸 JSON 端点(/oauth/register、/oauth/consent、/oauth/userinfo、/v1/oauth/clients
 *     的 data 项)保留**线上字段名**(snake_case 为主,与 RFC 7591/OIDC 规范一致);
 *   - SDK 归一化产物(OAuthTokenSet)用 camelCase,与 DeviceFlowToken 结构兼容,
 *     可直接写入 TokenStorage。
 */

import type { Plan } from './common.js'

/**
 * /oauth/token 响应的 SDK 归一化形态(expires_in 已折算为绝对 unix 秒)。
 * 与 device-flow.ts 的 DeviceFlowToken 结构兼容(多一个可选 idToken),
 * 可直接 storage.put 持久化。
 */
export interface OAuthTokenSet {
  accessToken: string
  /** 刷新令牌(7 天有效,每次使用后强制旋转 —— 旧值立即作废) */
  refreshToken?: string
  tokenType: 'Bearer'
  /** access token 过期时间(unix 秒) */
  expiresAt: number
  /** 实际授予的 scopes(可能 ⊂ 申请值) */
  scopes: readonly string[]
  /** OIDC ID Token(JWT;仅 granted scopes 含 openid 时返回) */
  idToken?: string
}

/** POST /oauth/register(RFC 7591 动态客户端注册)入参 */
export interface RegisterClientInput {
  /** 客户端显示名称(用户在同意页看到的应用名,1~100 字符) */
  clientName: string
  /** 回调 URI 列表(1~5 个,授权成功后重定向到其中一个) */
  redirectUris: readonly string[]
  /** 申请的 scope(空格分隔);服务端取与 OAUTH_SCOPES 的交集 */
  scope?: string
}

/** POST /oauth/register 响应(RFC 7591 线上字段名) */
export interface RegisteredClient {
  /** 全局唯一 client_id(nanoid 21 字符) */
  client_id: string
  client_name: string
  redirect_uris: string[]
  grant_types: string[]
  response_types: string[]
  token_endpoint_auth_method: string
  scope: string
  /** pending = 等待管理员审核;approved = 立即可用 */
  status: 'pending' | 'approved'
}

/** POST /oauth/consent 入参(SDK camelCase,发送时映射为线上 snake_case) */
export interface ConsentInput {
  clientId: string
  /** 必须与客户端注册值完全匹配 */
  redirectUri: string
  /** 原始 scope 字符串(来自 /oauth/authorize 请求) */
  scope: string
  action: 'approve' | 'deny'
  /** 用户在同意页实际勾选的 scope(缺省 = 全部同意) */
  grantedScopes?: readonly string[]
}

/** POST /oauth/consent 响应:成功时 redirect_to 含 ?code=xxx&state=yyy;拒绝时含 ?error=access_denied */
export interface ConsentResult {
  redirect_to: string
}

/** GET /v1/oauth/clients 单条记录(线上字段名) */
export interface OAuthClientInfo {
  /** client_id(nanoid 或 mw_picora 等固定 ID) */
  id: string
  client_name: string
  redirect_uris: string[]
  scopes: string[]
  status: 'approved' | 'pending'
  /** 注册时间(ISO 8601) */
  createdAt: string
}

/** POST /v1/oauth/device/verify 入参(用户对设备码授权做出决定) */
export interface DeviceVerifyInput {
  /** 8 字符大写字母+数字格式(如 ABCD-1234) */
  userCode: string
  action: 'approve' | 'deny'
  /** approve 时可缩减客户端申请的 scope(逗号或空格分隔) */
  scope?: string
}

/** POST /v1/oauth/device/verify 响应 */
export interface DeviceVerifyResult {
  action: 'approve' | 'deny'
  /** 用于在 UI 显示「已授权给 XXX」 */
  clientName: string
}

/** POST /v1/oauth/revoke-all 响应 */
export interface RevokeAllResult {
  /** 吊销的客户端授权数量 */
  revokedClients: number
  /** 吊销的 token 总数 */
  revokedTokens: number
}

/** GET /oauth/userinfo 响应(OIDC 标准 claims;非 openid 必需字段仅在对应 scope 授予时返回) */
export interface OidcUserinfo {
  /** 用户唯一标识符(nanoid 21 字符) */
  sub: string
  /** 邮箱(account.read scope 时返回) */
  email?: string
  email_verified?: boolean
  /** 显示名称(account.read scope 时返回) */
  name?: string
  /** 头像 URL(account.read scope 时返回,可能为 null) */
  picture?: string | null
  /** 当前套餐(account.read scope 时返回) */
  plan?: Exclude<Plan, 'none'>
}
