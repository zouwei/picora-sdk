/**
 * orgs 域类型(v0.3.0 平台域批次,v0.50~v0.52 Teams 功能)。
 *
 * 对应 spec tag=orgs 共 11 个 operation:Org CRUD(list/create/get)+ 审计日志 +
 * 成员管理(list/remove/updateRole)+ 邀请(create/accept)+ 订阅(checkout/seats)。
 *
 * 权限模型:owner > editor > viewer。移除成员 / 变更角色 / 订阅操作须 owner;
 * 邀请成员 / 查看审计日志须 editor+;其余成员均可读。
 */

/** Org 套餐档位 */
export type OrgPlan = 'org_starter' | 'org_pro' | 'org_enterprise'

/** Org 成员角色 */
export type OrgRole = 'owner' | 'editor' | 'viewer'

/** Org 组织对象(v0.50) */
export interface Org {
  /** Org ID(nanoid 21 字符) */
  id: string
  /** 组织名称(≤120 字符) */
  name: string
  /** URL 友好标识(小写字母+数字+短横线,2~48 字符) */
  slug: string
  /** 组织描述;null 表示未填写 */
  description?: string | null
  /** Org 套餐 */
  plan: OrgPlan
  /** 已用坐席数 */
  seatCount: number
  /** 坐席上限 */
  seatLimit: number
  /** 账单负责人用户 ID;null 表示未绑定 */
  billingUserId?: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 更新时间(ISO 8601) */
  updatedAt?: string
}

/** 列表视角的 Org(附带当前用户在该 Org 中的角色) */
export interface OrgWithRole extends Org {
  /** 当前用户在该 Org 中的角色 */
  myRole?: OrgRole
}

/** 详情视角的 Org(附带角色与活跃成员数;仅成员可见) */
export interface OrgDetail extends Org {
  /** 当前用户在该 Org 中的角色 */
  myRole?: OrgRole
  /** 活跃成员数 */
  memberCount?: number
}

/** POST /v1/orgs 入参 */
export interface CreateOrgInput {
  /** 组织名称(2~60 字符) */
  name: string
  /** URL 友好标识(3~32 字符,小写字母+数字+短横线) */
  slug: string
  /** 账单邮箱;未传则默认 owner email */
  billingEmail?: string
}

/** Org 成员记录 */
export interface OrgMember {
  /** 成员记录 ID(nanoid 21 字符) */
  id: string
  /** 所属 Org ID */
  orgId: string
  /** 成员用户 ID */
  userId: string
  /** 成员角色 */
  role: OrgRole
  /** 邀请时间(ISO 8601) */
  invitedAt: string
  /** 加入时间(ISO 8601);null 表示已邀请未接受 */
  joinedAt?: string | null
}

/** Org 审计日志条目(成员邀请/移除/角色变更/订阅变更/资源访问) */
export interface OrgAuditLogItem {
  /** 日志 ID */
  id: string
  /** 操作者用户 ID */
  userId: string
  /** 操作类型(如 'member.invited') */
  action: string
  /** 操作对象类型 */
  resourceType: string
  /** 操作对象 ID */
  resourceId: string
  /** 附加上下文 */
  metadata: Record<string, unknown>
  /** 发生时间(ISO 8601) */
  createdAt: string
}

/** GET /v1/orgs/{id}/audit-logs 查询选项(非游标分页,一次性返回条目数组) */
export interface OrgAuditLogParams {
  /** 精确过滤操作类型(如 'member.invited');不传返回全部类型 */
  action?: string
  /** 返回条数上限(默认 50) */
  limit?: number
}

/** PATCH /v1/orgs/{id}/members/{userId}/role 入参 */
export interface UpdateOrgMemberRoleInput {
  /** 目标角色(晋升为 owner 即转让所有权;owner 不能自降,除非另存在 owner) */
  role: OrgRole
}

/** POST /v1/orgs/{id}/invites 入参(editor+ 可邀请) */
export interface InviteOrgMemberInput {
  /** 被邀请者邮箱 */
  email: string
  /** 邀请角色(owner 不可邀请,仅可通过 role 变更晋升) */
  role: 'editor' | 'viewer'
}

/** POST /v1/orgs/{id}/invites 结果(邀请 token 经邮件发送,7 天有效) */
export interface InviteOrgMemberResult {
  /** 邀请记录 ID */
  inviteId: string
  /** 邀请过期时间(ISO 8601) */
  expiresAt: string
}

/** POST /v1/orgs/invites/accept 入参 */
export interface AcceptOrgInviteInput {
  /** 邀请邮件中的 token(email 与登录账号不一致时 403) */
  token: string
}

/** POST /v1/orgs/invites/accept 结果 */
export interface AcceptOrgInviteResult {
  /** 加入的 Org ID */
  orgId: string
  /** 获得的角色 */
  role: 'editor' | 'viewer'
}

/** POST /v1/orgs/{id}/subscription/checkout 入参(owner 专属) */
export interface OrgCheckoutInput {
  /** 产品档位:teams_starter(5 seats 起,$299/seat/yr)/ teams_pro(20 seats 起,$599/seat/yr) */
  productKey: 'teams_starter_yearly' | 'teams_pro_yearly'
  /** 购买坐席数(≥5) */
  seats: number
  /** 支付成功回跳 URL */
  successUrl?: string
  /** 取消支付回跳 URL */
  cancelUrl?: string
}

/** POST /v1/orgs/{id}/subscription/checkout 结果(跳转 checkoutUrl 付款,经 webhook 异步到账) */
export interface OrgCheckoutResult {
  /** Creem checkout 页面 URL */
  checkoutUrl: string
  /** 总价(分) */
  totalCents: number
  /** 产品档位 */
  productKey: string
  /** 坐席数 */
  seats: number
}

/** POST /v1/orgs/{id}/subscription/seats 入参(owner 专属) */
export interface ChangeOrgSeatsInput {
  /** 目标坐席总数(非增量,≥5;不可低于当前 active member 数) */
  seats: number
}

/** POST /v1/orgs/{id}/subscription/seats 结果(加坐席 prorate 立即补差价;减坐席下周期生效) */
export interface ChangeOrgSeatsResult {
  /** 变更后坐席总数 */
  seats: number
  /** 生效时间(ISO 8601):加坐席立即生效;减坐席为下周期开始日期 */
  effectiveAt: string
  /** 加坐席场景立即收取的补差价(分);减坐席为 0 */
  prorateCents: number
}
