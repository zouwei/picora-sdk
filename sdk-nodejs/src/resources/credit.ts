/**
 * credit 命名空间 —— Credit 钱包(v0.40,AIGC 生成与 AI 工具的计费货币)。
 *
 * 充值链路:topup() 创建 Creem checkout → 用户跳转付款 → 服务端 webhook 异步
 * 入账(reason=topup)→ balance() 可见。SDK 不感知支付回调,入账有延迟。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { normalizePage } from '../core/pagination.js'
import type {
  CreditBalance,
  CreditLedgerItem,
  CreditLedgerParams,
  CreditTopupCheckout,
  CreditTopupInput,
  PaginatedResponse,
} from '../types/index.js'

export interface CreditNamespace {
  /** 查询 Credit 余额(cents)+ 月度 MCP 调用累计 + lifetime 充值/消费统计。 */
  balance(): Promise<CreditBalance>
  /** 游标分页列出 Credit 流水(可按 reason 过滤;按 created_at DESC + id DESC 排序)。 */
  ledger(params?: CreditLedgerParams): Promise<PaginatedResponse<CreditLedgerItem>>
  /**
   * 创建 Credit 充值 checkout,返回 Creem 付款页 URL(用户跳转付款,
   * 付款后经 webhook 异步入账)。套餐不支持充值时 402(none / 部分 trial)。
   */
  topup(input: CreditTopupInput): Promise<CreditTopupCheckout>
}

export function createCreditNamespace(http: HttpCore): CreditNamespace {
  return {
    balance: () => http.request<CreditBalance>({ method: 'GET', path: '/v1/credit/balance' }),
    ledger: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      if (params?.reason !== undefined) query['reason'] = params.reason
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/credit/ledger', query })
      return normalizePage<CreditLedgerItem>(raw, 'items')
    },
    topup: (input) =>
      http.request<CreditTopupCheckout>({
        method: 'POST',
        path: '/v1/credit/topup',
        body: { packageKey: input.packageKey },
      }),
  }
}

export const CREDIT_COVERAGE = [
  { method: 'GET', path: '/v1/credit/balance', client: 'credit.balance' },
  { method: 'GET', path: '/v1/credit/ledger', client: 'credit.ledger' },
  { method: 'POST', path: '/v1/credit/topup', client: 'credit.topup' },
] as const satisfies readonly CoveredOperation[]
