/**
 * agreements 命名空间 —— AIGC 服务条款同意管理(v0.46)。
 *
 * 客户端接入流程:get()(公开)拿当前版本 → status() 查用户是否已同意该版本 →
 * agreed=false 时展示条款并在用户确认后 accept()。AIGC 生成端点要求已同意最新版。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  AcceptAgreementInput,
  AgreementStatus,
  AgreementVersionInfo,
} from '../types/index.js'

export interface AgreementsNamespace {
  /** 获取当前生效的 AIGC 协议版本号(公开端点,无需鉴权;客户端据此判断是否需重新同意)。 */
  get(): Promise<AgreementVersionInfo>
  /** 记录用户同意指定版本协议(幂等:服务端 INSERT OR IGNORE 兜底重复请求,并记录 IP + UA 审计)。 */
  accept(input: AcceptAgreementInput): Promise<void>
  /** 查询当前用户对最新版协议的同意状态(agreed=false 时客户端应弹出同意对话框)。 */
  status(): Promise<AgreementStatus>
}

export function createAgreementsNamespace(http: HttpCore): AgreementsNamespace {
  return {
    get: () => http.request<AgreementVersionInfo>({ method: 'GET', path: '/v1/agreements/aigc' }),
    accept: async (input) => {
      await http.request<void>({
        method: 'POST',
        path: '/v1/agreements/aigc/accept',
        body: { type: input.type, version: input.version },
        response: 'none',
      })
    },
    status: () => http.request<AgreementStatus>({ method: 'GET', path: '/v1/agreements/aigc/status' }),
  }
}

export const AGREEMENTS_COVERAGE = [
  { method: 'GET', path: '/v1/agreements/aigc', client: 'agreements.get' },
  { method: 'POST', path: '/v1/agreements/aigc/accept', client: 'agreements.accept' },
  { method: 'GET', path: '/v1/agreements/aigc/status', client: 'agreements.status' },
] as const satisfies readonly CoveredOperation[]
