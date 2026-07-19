/**
 * billing 命名空间(v0.3.0 平台域批次)—— 套餐定价 / checkout / 邀请码激活 /
 * 订阅信息 / 订单 / 支付历史。
 *
 * 支付链路:checkout 类方法仅创建支付会话并返回跳转 URL,用户付款后由支付平台
 * 向服务端发送 webhook 异步升级套餐(SDK 不感知回调,存在到账延迟)。
 * checkout 类 POST 关闭 429/5xx 自动重试(防重复下单)。
 *
 * 路径注意:邀请码激活是 **POST /v1/activate**(历史原因不在 /v1/billing 前缀下)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  ActivateCheckoutInput,
  ActivateCheckoutSession,
  ActivateInviteCodeInput,
  ActivateInviteCodeResult,
  BillingHistoryItem,
  BillingOrder,
  BillingPlans,
  BillingSubscription,
  CheckoutSession,
  CreateCheckoutInput,
} from '../types/index.js'

export interface BillingNamespace {
  /** 获取所有套餐的定价信息(公开端点,无需登录;定价页展示与套餐对比用)。 */
  plans(): Promise<BillingPlans>
  /**
   * 创建订阅支付 checkout(LemonSqueezy 海外 / 迅虎国内),返回支付页 URL,
   * 前端重定向到该 URL 完成支付;支付成功后经 webhook 异步升级套餐。
   * 传 couponCode 时下单前校验并占用一次使用记录,校验失败 422 不创建会话。
   * 非幂等支付发起,SDK 关闭 429/5xx 自动重试(防重复下单)。
   */
  checkout(input: CreateCheckoutInput): Promise<CheckoutSession>
  /**
   * 创建体验版一次性付费 checkout(¥9 / $4.99;Creem / Polar / 迅虎),
   * 返回支付页跳转 URL(迅虎扫码场景另含 qrCodeUrl);付款后经 webhook 异步到账。
   * 未指定 provider 时服务端按 Accept-Language 自动推断;已是 trial+ 套餐 409。
   * 非幂等支付发起,SDK 关闭 429/5xx 自动重试(防重复下单)。
   */
  activateCheckout(input?: ActivateCheckoutInput): Promise<ActivateCheckoutSession>
  /**
   * 使用邀请码将账户从 none 升级到 trial(体验版)。
   * 注意路径为 **POST /v1/activate**(非 /v1/billing 前缀)。
   * 幂等:已激活的用户再次调用不报错。
   */
  activateInviteCode(input: ActivateInviteCodeInput): Promise<ActivateInviteCodeResult>
  /** 获取当前用户订阅信息(套餐 / 状态 / 到期时间 / 支付渠道 / 是否周期末取消)。 */
  subscription(): Promise<BillingSubscription>
  /** 获取当前用户支付订单列表(按创建时间倒序;账单页历史购买记录用)。 */
  orders(): Promise<BillingOrder[]>
  /** 获取当前用户支付历史记录(按时间降序)。 */
  history(): Promise<BillingHistoryItem[]>
}

export function createBillingNamespace(http: HttpCore): BillingNamespace {
  return {
    plans: () => http.request<BillingPlans>({ method: 'GET', path: '/v1/billing/plans' }),
    checkout: (input) =>
      http.request<CheckoutSession>({
        method: 'POST',
        path: '/v1/billing/checkout',
        body: {
          plan: input.plan,
          ...(input.couponCode !== undefined ? { couponCode: input.couponCode } : {}),
        },
        retry: false,
      }),
    activateCheckout: (input) =>
      http.request<ActivateCheckoutSession>({
        method: 'POST',
        path: '/v1/billing/activate-checkout',
        body: {
          ...(input?.provider !== undefined ? { provider: input.provider } : {}),
        },
        retry: false,
      }),
    activateInviteCode: (input) =>
      http.request<ActivateInviteCodeResult>({
        method: 'POST',
        path: '/v1/activate',
        body: { code: input.code },
      }),
    subscription: () =>
      http.request<BillingSubscription>({ method: 'GET', path: '/v1/billing/subscription' }),
    orders: () => http.request<BillingOrder[]>({ method: 'GET', path: '/v1/billing/orders' }),
    history: () =>
      http.request<BillingHistoryItem[]>({ method: 'GET', path: '/v1/billing/history' }),
  }
}

export const BILLING_COVERAGE = [
  { method: 'GET', path: '/v1/billing/plans', client: 'billing.plans' },
  { method: 'POST', path: '/v1/billing/checkout', client: 'billing.checkout' },
  { method: 'POST', path: '/v1/billing/activate-checkout', client: 'billing.activateCheckout' },
  { method: 'POST', path: '/v1/activate', client: 'billing.activateInviteCode' },
  { method: 'GET', path: '/v1/billing/subscription', client: 'billing.subscription' },
  { method: 'GET', path: '/v1/billing/orders', client: 'billing.orders' },
  { method: 'GET', path: '/v1/billing/history', client: 'billing.history' },
] as const satisfies readonly CoveredOperation[]
