/**
 * 自定义域名域类型(v0.3.0 账户域批次,Pro+ 套餐功能)。
 *
 * 流程:create 添加域名 → 用户在 DNS 配置 CNAME 指向 cnameTarget →
 * verify 触发 CNAME 校验(DNS over HTTPS)→ 验证通过后域名立即生效。
 */

/** 自定义域名绑定记录 */
export interface CustomDomain {
  /** 域名记录 ID,nanoid 21 字符 */
  id: string
  /** 域名(不含协议和端口),全小写 */
  host: string
  /** CNAME 验证状态;true 表示已验证,图片可通过此域名访问 */
  verified: boolean
  /** 验证通过时间(ISO 8601);null 表示未验证 */
  verifiedAt?: string | null
  /** 添加时间(ISO 8601) */
  createdAt: string
}

/** POST /v1/domains 入参 */
export interface CreateDomainInput {
  /** 域名,全小写,如 img.mysite.com;不含 https:// 协议头 */
  host: string
}

/** POST /v1/domains 响应数据(添加成功,等待 CNAME 验证) */
export interface CreateDomainResult {
  /** 域名记录 ID,nanoid 21 字符 */
  id: string
  host: string
  /** 创建时固定为 false,须经 verify 通过后才生效 */
  verified: boolean
  /** CNAME 目标(需在 DNS 配置此记录),如 img.picora.com */
  cnameTarget: string
  /** 人类可读的 DNS 配置指引 */
  instructions: string
}

/** POST /v1/domains/{id}/verify 响应数据(无论验证是否通过均为 200) */
export interface DomainVerifyResult {
  /** true=验证通过并立即生效;false=CNAME 记录未找到或不正确 */
  verified: boolean
  /** 验证结果说明 */
  message: string
}
