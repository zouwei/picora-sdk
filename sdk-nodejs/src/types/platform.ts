/**
 * 平台域类型(v0.3.0 平台域批次):campaigns(促销活动)/ notifications(站内信)/
 * tickets(客服工单)/ insights(访问统计)。
 *
 * 对应 spec tag=campaigns(3)+ notifications(4)+ tickets(5)+ insights(2)
 * 共 14 个 operation。
 */

// ────────────────────────── campaigns ──────────────────────────

/** 促销活动 banner 双语文案(前端按当前语言取) */
export interface CampaignBanner {
  /** 英文文案 */
  en?: string
  /** 中文文案 */
  'zh-CN'?: string
}

/** 进行中的促销折扣活动(GET /v1/campaigns/active) */
export interface ActiveCampaign {
  /** 活动 ID(nanoid 21 字符) */
  id: string
  /** 活动名称 */
  name: string
  /** 活动结束时间(ISO 8601) */
  endsAt: string
  /** banner 双语文案 */
  banner?: CampaignBanner
  /** 券类型:public 通用券 | private 私有券 */
  couponKind: 'public' | 'private'
  /** 支付到账后赠送的月数 */
  bonusMonths: number
  /** 通用券码(couponKind=public 时返回);null 表示无 */
  publicCode?: string | null
  /** 当前用户是否已领取私有券 */
  claimed?: boolean
  /** 当前用户已领取的私有券码;null 表示未领取 */
  claimedCode?: string | null
  /** 私有券使用截止时间(领取日 + 领券有效期天数);null 表示未领取 */
  claimedExpiresAt?: string | null
}

/** GET /v1/campaigns/active 结果(无进行中活动时 campaign 为 null,HTTP 仍为 200) */
export interface ActiveCampaignResult {
  /** 进行中的促销活动;null 表示当前无活动 */
  campaign: ActiveCampaign | null
}

/** POST /v1/campaigns/{id}/claim 结果 */
export interface ClaimCouponResult {
  /** 私有券码(PROMO-XXXX-XXXX 格式) */
  code: string
  /** 使用截止时间(ISO 8601)= 领取日 + 活动配置的领券有效期 */
  expiresAt: string
}

/** POST /v1/coupons/validate 入参 */
export interface ValidateCouponInput {
  /** 促销码(6~32 字符,大小写不敏感,服务端统一转大写) */
  code: string
}

/**
 * POST /v1/coupons/validate 结果。
 * 注意:校验失败(不存在/禁用/过期/用尽)不会走到本结果 —— 服务端统一抛
 * 422 error.coupon_invalid(不区分具体原因,防撞库探测)。
 */
export interface CouponValidation {
  /** 是否有效 */
  valid: boolean
  /** 所属活动名称 */
  campaignName?: string
  /** 折扣类型,当前仅 bonus_months(赠送套餐时长) */
  discountType?: string
  /** 支付到账后赠送的月数 */
  bonusMonths?: number
}

// ────────────────────────── notifications ──────────────────────────

/** 站内信条目(消息类型:campaign 活动 | system 系统) */
export interface NotificationItem {
  /** 站内信 ID(nanoid 21 字符) */
  id: string
  /** 消息类型:'campaign' 活动 | 'system' 系统公告 */
  type: string
  /** 标题(按用户 locale 渲染的成品文案) */
  title: string
  /** 正文纯文本(变量已替换,如邀请码) */
  body: string
  /** 点击跳转站内路径;null 表示不可点击 */
  link: string | null
  /** 已读时间(ISO 8601);null 表示未读 */
  readAt: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/** GET /v1/notifications 查询选项(游标分页,按 created_at DESC + id DESC,每页 20 条) */
export interface NotificationListParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
}

/** POST /v1/notifications/read 入参 */
export interface MarkNotificationsReadInput {
  /** 要标记已读的站内信 ID 列表(1~100 条;他人消息 ID 被静默忽略) */
  ids: string[]
}

/** 批量标记已读结果(read / read-all 共用) */
export interface MarkReadResult {
  /** 实际被标记的条数 */
  updated: number
}

/** 未读计数结果(notifications / tickets 的 unread-count 共用形态) */
export interface UnreadCountResult {
  /** 未读数量 */
  count: number
}

// ────────────────────────── tickets ──────────────────────────

/** 工单状态 */
export type TicketStatus = 'open' | 'pending' | 'closed'

/** 工单优先级 */
export type TicketPriority = 'low' | 'normal' | 'high' | 'urgent'

/** 客服工单 */
export interface Ticket {
  /** 工单 ID(nanoid 21 字符) */
  id: string
  /** 工单标题 */
  title: string
  /** 工单分类(如 bug / billing / feature) */
  category: string
  /** 工单状态 */
  status: TicketStatus
  /** 优先级(创建时默认 normal) */
  priority: TicketPriority
  /** 当前用户视角未读消息数 */
  unreadCount?: number
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 最近更新时间(ISO 8601) */
  updatedAt: string
}

/** 工单消息(用户与管理员往来记录) */
export interface TicketMessage {
  /** 消息 ID(nanoid 21 字符) */
  id: string
  /** 所属工单 ID */
  ticketId: string
  /** 发送者角色 */
  role: 'user' | 'admin'
  /** 消息内容(Markdown 格式) */
  content: string
  /** 发送时间(ISO 8601) */
  createdAt: string
}

/** POST /v1/tickets 入参(创建工单并提交首条消息) */
export interface CreateTicketInput {
  /** 工单标题(1~200 字符) */
  title: string
  /** 工单分类(如 bug / billing / feature) */
  category: string
  /** 首条消息内容(Markdown,1~10000 字符) */
  content: string
}

/** GET /v1/tickets 查询选项(游标分页,按最近更新时间倒序) */
export interface TicketListParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 工单状态过滤;不传返回全部 */
  status?: TicketStatus
}

/** GET /v1/tickets/{ticketId} 结果(打开详情自动清除用户侧未读标记) */
export interface TicketDetail {
  /** 工单元数据 */
  ticket: Ticket
  /** 全部消息列表(按时间升序) */
  messages: TicketMessage[]
}

/** POST /v1/tickets/{ticketId}/messages 入参 */
export interface ReplyTicketInput {
  /** 回复内容(Markdown,1~10000 字符) */
  content: string
}

// ────────────────────────── insights ──────────────────────────

/** GET /v1/insights/daily 查询选项(最大窗口 90 天,超出按 7 天聚合) */
export interface InsightsDailyParams {
  /** 起始日(YYYY-MM-DD) */
  from: string
  /** 结束日(YYYY-MM-DD) */
  to: string
  /** 资源范围过滤,默认 all */
  scope?: 'images' | 'videos' | 'documents' | 'all'
}

/** Referer 来源统计条目 */
export interface InsightRefererStat {
  /** 来源站点 host */
  host: string
  /** 访问次数 */
  count: number
}

/** 国家/地区统计条目 */
export interface InsightCountryStat {
  /** 国家/地区代码 */
  country: string
  /** 访问次数 */
  count: number
}

/** 单日聚合数据 */
export interface InsightDailyItem {
  /** 日期(YYYY-MM-DD) */
  date: string
  /** 浏览量 */
  views: number
  /** 被防盗链拦截次数 */
  blocked: number
  /** Top Referer 列表 */
  topReferers?: InsightRefererStat[]
  /** Top 国家/地区列表 */
  topCountries?: InsightCountryStat[]
  /** 设备类型分布(key 为设备类型,value 为次数) */
  deviceBreakdown?: Record<string, number>
}

/** 窗口期汇总统计 */
export interface InsightsSummary {
  /** 总浏览量 */
  totalViews?: number
  /** 独立访客数 */
  uniqueVisitors?: number
  /** Top Referer 列表 */
  topReferers?: InsightRefererStat[]
  /** Top 国家/地区列表 */
  topCountries?: InsightCountryStat[]
}

/** GET /v1/insights/daily 结果(pro+ / org 可见) */
export interface InsightsDaily {
  /** 按天聚合明细 */
  items: InsightDailyItem[]
  /** 窗口期汇总 */
  summary?: InsightsSummary
}

/** POST /v1/insights/rollup/day 入参(admin/dev 补救对账用) */
export interface RollupDayInput {
  /** 目标日(YYYY-MM-DD,UTC) */
  date: string
  /** 已聚合过是否覆盖重算,默认 false */
  force?: boolean
}

/** POST /v1/insights/rollup/day 结果 */
export interface RollupDayResult {
  /** 目标日(YYYY-MM-DD) */
  date: string
  /** 处理的原始行数 */
  rowsProcessed: number
  /** 聚合耗时(ms) */
  durationMs: number
}
