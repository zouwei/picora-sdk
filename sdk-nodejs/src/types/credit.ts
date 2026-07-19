/**
 * Credit 钱包 + AIGC 协议(agreements)域类型(v0.3.0 AIGC 域批次)。
 *
 * 对应 spec tag=credit(balance / ledger / topup)与 tag=agreements
 * (AIGC 服务条款版本 / 同意状态 / 接受)共 6 个 operation。
 * Credit 是 AIGC 生成与 AI 工具的计费货币(cents 计价),充值经 Creem checkout。
 */

/** GET /v1/credit/balance 结果(余额 + 月度 MCP 用量 + lifetime 统计) */
export interface CreditBalance {
  /** 当前余额(Credit cents,≥0) */
  balanceCents: number
  /** 累计充值总额(cents) */
  lifetimeTopupCents: number
  /** 累计消费总额(cents) */
  lifetimeSpentCents: number
  /** 当月 MCP 调用累计次数 */
  monthlyMcpUsed: number
  /** 月度统计周期(如 '2026-07') */
  monthlyPeriod?: string
  /** 最近一次充值时间(ISO 8601);null 表示从未充值 */
  lastTopupAt?: string | null
}

/** Credit 流水事由(正负向共用枚举) */
export type CreditLedgerReason =
  | 'topup'      // 充值入账
  | 'promo'      // 活动赠送
  | 'refund'     // 生成失败退款
  | 'admin_adj'  // 管理员手工调整
  | 'aigc'       // AIGC 生成扣款
  | 'ai_tool'    // AI 工具扣款
  | 'mcp'        // MCP 调用扣款

/** Credit 流水条目 */
export interface CreditLedgerItem {
  /** 流水 ID(nanoid 21 字符) */
  id: string
  /** 变动额(cents):正数=入账,负数=扣款 */
  deltaCents: number
  /** 本笔结算后余额(cents,≥0) */
  balanceAfter: number
  /** 事由 */
  reason: CreditLedgerReason
  /** 关联对象类型(如 aigc_asset);null 表示无关联 */
  refType?: string | null
  /** 关联对象 ID;null 表示无关联 */
  refId?: string | null
  /** 记账时间(ISO 8601) */
  createdAt: string
}

/** GET /v1/credit/ledger 查询选项(游标分页,按 created_at DESC + id DESC 排序) */
export interface CreditLedgerParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 每页数量(1~100,默认 20) */
  limit?: number
  /** 可选:按事由过滤 */
  reason?: CreditLedgerReason
}

/** Credit 充值套餐(credit_10k=$100/1000 Credit · credit_60k=$500/6000 Credit · credit_100k=$500 Pro+ 专属) */
export type CreditTopupPackageKey = 'credit_10k' | 'credit_60k' | 'credit_100k'

/** POST /v1/credit/topup 入参 */
export interface CreditTopupInput {
  /** 充值套餐 */
  packageKey: CreditTopupPackageKey
}

/** POST /v1/credit/topup 结果(跳转 checkoutUrl 付款;付款后经 webhook 异步入账 reason=topup) */
export interface CreditTopupCheckout {
  /** Creem checkout 页面 URL(用户跳转付款) */
  checkoutUrl: string
  /** 本次充值套餐 */
  packageKey: string
  /** 应付金额(cents) */
  amountCents: number
}

/** 协议类型(当前 SDK 覆盖 aigc_terms;accept 端点契约同时接受 privacy / tos) */
export type AgreementType = 'aigc_terms' | 'privacy' | 'tos'

/** GET /v1/agreements/aigc 结果(当前生效的 AIGC 协议版本;公开端点) */
export interface AgreementVersionInfo {
  /** 协议类型(固定 aigc_terms) */
  type: 'aigc_terms'
  /** 当前版本号(如 '2026-11-16-v1') */
  version: string
}

/** GET /v1/agreements/aigc/status 结果(当前用户对最新版协议的同意状态) */
export interface AgreementStatus {
  /** 是否已同意当前版本(false 时客户端应弹出同意对话框) */
  agreed: boolean
  /** 当前生效版本号 */
  currentVersion: string
}

/** POST /v1/agreements/aigc/accept 入参(服务端 INSERT OR IGNORE 兜底重复请求,并记录 IP + UA 审计) */
export interface AcceptAgreementInput {
  /** 协议类型 */
  type: AgreementType
  /** 所同意的版本号(≤64 字符,应传 get() 返回的当前版本) */
  version: string
}
