/**
 * system 命名空间(v0.3.0 账户域批次)—— 服务健康检查。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type { HealthStatus } from '../types/index.js'

export interface SystemNamespace {
  /**
   * 服务健康检查(公开端点,无需认证;负载均衡探活同款)。
   * 响应为裸 JSON(**非** { success, data } 业务包装),含服务版本与
   * features 特性开关 —— 客户端可据此做能力检测(如 KB 同步是否可用)。
   */
  health(): Promise<HealthStatus>
}

export function createSystemNamespace(http: HttpCore): SystemNamespace {
  return {
    // /health 返回裸 JSON(无业务包装),用 'bare' 模式原样解析
    health: () => http.request<HealthStatus>({ method: 'GET', path: '/health', response: 'bare' }),
  }
}

export const SYSTEM_COVERAGE = [
  { method: 'GET', path: '/health', client: 'system.health' },
] as const satisfies readonly CoveredOperation[]
