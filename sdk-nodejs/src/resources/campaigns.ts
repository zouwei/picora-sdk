/**
 * campaigns 命名空间(v0.3.0 平台域批次,v0.66.0 促销活动)—— 进行中活动查询 /
 * 私有券领取 / 促销码校验。
 *
 * 路径注意:验券是 **POST /v1/coupons/validate**(coupons 前缀,不在 /v1/campaigns 下)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  ActiveCampaignResult,
  ClaimCouponResult,
  CouponValidation,
  ValidateCouponInput,
} from '../types/index.js'

export interface CampaignsNamespace {
  /**
   * 查询进行中的促销折扣活动(header banner 与领券页共用数据源)。
   * 无进行中活动时 data.campaign 为 null(HTTP 仍 200)。
   */
  active(): Promise<ActiveCampaignResult>
  /**
   * 领取私有促销券。每用户每活动限领 1 张(重复领取幂等返回原券);
   * 发放池领完 422 error.coupon_sold_out 且活动自动提前结束。限流 5 次/分钟/用户。
   */
  claim(campaignId: string): Promise<ClaimCouponResult>
  /**
   * 校验促销码(下单页优惠码输入框实时校验)。注意路径为 **POST /v1/coupons/validate**。
   * 所有失败原因统一抛 422 error.coupon_invalid,不区分不存在/禁用/过期/用尽
   * (防撞库探测);私有券在活动结束后只要未超领取有效期仍校验通过。
   * 限流 10 次/分钟/用户。
   */
  validateCoupon(input: ValidateCouponInput): Promise<CouponValidation>
}

export function createCampaignsNamespace(http: HttpCore): CampaignsNamespace {
  return {
    active: () =>
      http.request<ActiveCampaignResult>({ method: 'GET', path: '/v1/campaigns/active' }),
    claim: (campaignId) =>
      http.request<ClaimCouponResult>({
        method: 'POST',
        path: `/v1/campaigns/${encodeURIComponent(campaignId)}/claim`,
      }),
    validateCoupon: (input) =>
      http.request<CouponValidation>({
        method: 'POST',
        path: '/v1/coupons/validate',
        body: { code: input.code },
      }),
  }
}

export const CAMPAIGNS_COVERAGE = [
  { method: 'GET', path: '/v1/campaigns/active', client: 'campaigns.active' },
  { method: 'POST', path: '/v1/campaigns/{id}/claim', client: 'campaigns.claim' },
  { method: 'POST', path: '/v1/coupons/validate', client: 'campaigns.validateCoupon' },
] as const satisfies readonly CoveredOperation[]
