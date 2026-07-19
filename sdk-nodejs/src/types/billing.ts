/**
 * billing 域类型(v0.3.0 平台域批次)。
 *
 * 对应 spec tag=billing 共 7 个 operation:套餐定价(公开)/ 订阅 checkout /
 * 体验版一次性付费 checkout / 邀请码激活(POST /v1/activate,注意非 /v1/billing 前缀)/
 * 订阅信息 / 订单列表 / 支付历史。
 *
 * 支付链路共性:checkout 类端点仅创建支付会话并返回跳转 URL,SDK 不感知支付回调;
 * 用户付款后由支付平台向服务端 webhook 通知,套餐异步升级(存在到账延迟)。
 */

/** 单个套餐的定价信息(货币随平台:海外 USD / 国内 CNY) */
export interface PlanPricing {
  /** 月付价格(主货币单位,如 9 表示 $9) */
  monthly: number
  /** 年付价格(主货币单位) */
  yearly: number
  /** 币种(如 'USD' / 'CNY') */
  currency: string
}

/** GET /v1/billing/plans 结果(公开端点,定价页展示用) */
export interface BillingPlans {
  /** Pro 套餐定价 */
  pro: PlanPricing
  /** Pro+ 套餐定价 */
  pro_plus: PlanPricing
}

/** POST /v1/billing/checkout 入参 */
export interface CreateCheckoutInput {
  /** 目标套餐 */
  plan: 'pro' | 'pro_plus'
  /**
   * 促销码(v0.66.0,选填,6~32 字符)。传入时下单前校验并占用一次使用记录,
   * 校验失败 422 且不创建支付会话;支付到账后自动在套餐到期日追加活动配置的赠送月数。
   */
  couponCode?: string
}

/** POST /v1/billing/checkout 结果(前端重定向到 checkoutUrl 完成支付) */
export interface CheckoutSession {
  /** 支付页面 URL(LemonSqueezy 海外 / 迅虎国内) */
  checkoutUrl: string
}

/** 体验版一次性付费支付渠道 */
export type ActivateCheckoutProvider = 'creem' | 'polar' | 'xunhu'

/** POST /v1/billing/activate-checkout 入参 */
export interface ActivateCheckoutInput {
  /** 支付渠道;不传时服务端按 Accept-Language 自动推断(zh → 迅虎,其他 → Polar/Creem) */
  provider?: ActivateCheckoutProvider
}

/** POST /v1/billing/activate-checkout 结果 */
export interface ActivateCheckoutSession {
  /** 支付页面跳转 URL */
  checkoutUrl: string
  /** 二维码 URL(迅虎支付扫码场景才返回) */
  qrCodeUrl?: string
  /** 实际使用的支付渠道 */
  provider: ActivateCheckoutProvider
}

/** POST /v1/activate 入参(邀请码激活体验版) */
export interface ActivateInviteCodeInput {
  /** 邀请码(6~32 字符,大小写敏感) */
  code: string
}

/** POST /v1/activate 结果 */
export interface ActivateInviteCodeResult {
  /** 激活后的套餐 */
  plan: 'trial' | 'pro' | 'pro_plus'
  /** 是否完成体验版激活 */
  trialActivated: boolean
}

/** GET /v1/billing/subscription 结果(当前用户订阅信息) */
export interface BillingSubscription {
  /** 当前套餐 */
  plan: 'none' | 'trial' | 'pro' | 'pro_plus'
  /** 订阅状态 */
  status: 'active' | 'cancelled' | 'expired' | 'none'
  /** 当前周期结束时间(ISO 8601);订阅中为到期时间,null 表示无周期 */
  currentPeriodEnd: string | null
  /** 支付渠道;null 表示无支付记录(如 manual 之外的免费用户) */
  provider: 'polar' | 'creem' | 'xunhu' | 'lemon' | 'manual' | null
  /** 是否在当前周期结束时取消(已取消但仍在有效期内为 true) */
  cancelAtPeriodEnd: boolean
}

/** 支付订单条目(GET /v1/billing/orders,按创建时间倒序) */
export interface BillingOrder {
  /** 订单 ID */
  id: string
  /** 支付渠道 */
  provider: 'polar' | 'creem' | 'xunhu' | 'lemon'
  /** 金额(分) */
  amountCents: number
  /** 币种(如 'USD') */
  currency: string
  /** 购买的套餐 */
  plan: 'trial' | 'pro' | 'pro_plus'
  /** 订阅周期;null 表示未知/不适用 */
  period: 'onetime' | 'monthly' | 'yearly' | null
  /** 订单状态 */
  status: 'pending' | 'paid' | 'refunded' | 'failed'
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/** 支付历史条目(GET /v1/billing/history,按时间降序) */
export interface BillingHistoryItem {
  /** 支付记录 ID(nanoid 21 字符) */
  id: string
  /** 购买的套餐 */
  plan: 'pro' | 'pro_plus'
  /** 支付金额(分) */
  amountCents: number
  /** 币种(如 'USD') */
  currency: string
  /** 支付渠道(历史端点沿用旧枚举命名) */
  provider: 'lemon_squeezy' | 'xunhu'
  /** 支付状态(如 'paid') */
  status: string
  /** 支付时间(ISO 8601) */
  createdAt: string
}
