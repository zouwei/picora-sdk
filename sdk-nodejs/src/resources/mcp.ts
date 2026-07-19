/**
 * mcp 命名空间(v0.3.0 平台域批次)—— MCP 工具 catalog(公开)+ 当月调用用量。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type { McpToolsCatalog, McpUsage } from '../types/index.js'

export interface McpNamespace {
  /**
   * 获取公开的 MCP 工具 catalog(**GET /mcp/tools.json**,公开端点无需认证),
   * 列出 Picora 支持的全部 AI 工具及元数据(domain / inputSchema / 描述)。
   * 响应为裸 JSON(**非** { success, data } 业务包装);数据来自构建期常量,
   * 边缘缓存 5 分钟、服务端内存缓存 1 小时。
   */
  toolsCatalog(): Promise<McpToolsCatalog>
  /** 获取本月 MCP 调用统计(总数 / 按工具拆分 / 免费额度剩余 / 累计 cents)。 */
  usage(): Promise<McpUsage>
}

export function createMcpNamespace(http: HttpCore): McpNamespace {
  return {
    // /mcp/tools.json 返回裸 JSON(无业务包装),用 'bare' 模式原样解析
    toolsCatalog: () =>
      http.request<McpToolsCatalog>({ method: 'GET', path: '/mcp/tools.json', response: 'bare' }),
    usage: () => http.request<McpUsage>({ method: 'GET', path: '/v1/mcp/usage' }),
  }
}

export const MCP_COVERAGE = [
  { method: 'GET', path: '/mcp/tools.json', client: 'mcp.toolsCatalog' },
  { method: 'GET', path: '/v1/mcp/usage', client: 'mcp.usage' },
] as const satisfies readonly CoveredOperation[]
