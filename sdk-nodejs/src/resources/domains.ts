/**
 * domains 命名空间(v0.3.0 账户域批次)—— 自定义图片外链域名(Pro+ 套餐)。
 *
 * 流程:create → 用户在 DNS 配 CNAME 指向返回的 cnameTarget → verify 触发校验
 * (服务端经 DNS over HTTPS 查询)→ 通过后写入 `domain:{host}` 映射缓存立即生效。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  CreateDomainInput,
  CreateDomainResult,
  CustomDomain,
  DomainVerifyResult,
} from '../types/index.js'

export interface DomainsNamespace {
  /**
   * 添加自定义域名(Pro+ 套餐专用,非 Pro+ 403)。
   * 添加后需在 DNS 配置 CNAME 指向响应的 cnameTarget,再调用 verify 验证。
   * 域名已被占用(含其他用户)时 409。
   */
  create(input: CreateDomainInput): Promise<CreateDomainResult>
  /** 列出当前用户全部自定义域名及验证状态。 */
  list(): Promise<CustomDomain[]>
  /**
   * 触发 CNAME 验证。无论结果是否通过均返回 200,以响应的 verified 字段判定;
   * 通过后域名映射写入缓存,立即生效。
   */
  verify(id: string): Promise<DomainVerifyResult>
  /** 删除域名绑定。同步清除映射缓存(`domain:{host}`),域名立即失效。 */
  delete(id: string): Promise<void>
}

export function createDomainsNamespace(http: HttpCore): DomainsNamespace {
  return {
    create: (input) =>
      http.request<CreateDomainResult>({
        method: 'POST',
        path: '/v1/domains',
        body: { host: input.host },
      }),
    list: () => http.request<CustomDomain[]>({ method: 'GET', path: '/v1/domains' }),
    verify: (id) =>
      http.request<DomainVerifyResult>({
        method: 'POST',
        path: `/v1/domains/${encodeURIComponent(id)}/verify`,
      }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/domains/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
  }
}

export const DOMAINS_COVERAGE = [
  { method: 'POST', path: '/v1/domains', client: 'domains.create' },
  { method: 'GET', path: '/v1/domains', client: 'domains.list' },
  { method: 'POST', path: '/v1/domains/{id}/verify', client: 'domains.verify' },
  { method: 'DELETE', path: '/v1/domains/{id}', client: 'domains.delete' },
] as const satisfies readonly CoveredOperation[]
