/**
 * apps 命名空间 —— 当前用户已授权的 OAuth 应用管理(v0.30 /v1/me/apps)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type { AuthorizedApp } from '../types/index.js'

export interface AppsNamespace {
  /**
   * 列出当前用户已授权的 OAuth 应用(含授权 scope、审核状态、最近使用时间、是否第一方)。
   * 需 BearerAuth 会话;用于「已连接的应用」管理页。
   */
  list(): Promise<AuthorizedApp[]>
  /** 按 clientId 吊销某应用的授权(其名下全部 OAuth token 立即失效)。 */
  revoke(clientId: string): Promise<void>
}

export function createAppsNamespace(http: HttpCore): AppsNamespace {
  return {
    list: () => http.request<AuthorizedApp[]>({ method: 'GET', path: '/v1/me/apps' }),
    revoke: async (clientId) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/me/apps/${encodeURIComponent(clientId)}`,
      })
    },
  }
}

export const APPS_COVERAGE = [
  { method: 'GET', path: '/v1/me/apps', client: 'apps.list' },
  { method: 'DELETE', path: '/v1/me/apps/{clientId}', client: 'apps.revoke' },
] as const satisfies readonly CoveredOperation[]
