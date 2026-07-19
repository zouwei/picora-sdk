/**
 * 系统域类型(v0.3.0 账户域批次)。
 */

/**
 * GET /health 响应(公开端点,**非** { success, data } 业务包装,原样裸 JSON)。
 * 供负载均衡探活与客户端能力检测(features 开关)使用。
 */
export interface HealthStatus {
  /** 服务是否正常 */
  ok: boolean
  /** 服务器时间(ISO 8601) */
  ts: string
  /** 服务版本(来自 APP_VERSION 环境变量;未配置时缺省) */
  version?: string
  /** 已启用功能特性开关(如 kb / mediaListingV2),供客户端能力检测 */
  features?: Record<string, boolean>
}
