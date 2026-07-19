/**
 * aiTools 命名空间 —— AI 工具箱(v0.48,5 个图片 AI 工具)。
 *
 * 计费模型:每次 invoke 按工具单价从 Credit 钱包预扣,24h 内同图同参去重,
 * 失败自动 refund。Trial 套餐不支持 AI 工具(403)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  AiToolKey,
  AiToolLogItem,
  AiToolLogsParams,
  AiToolResult,
  AiToolSpec,
  InvokeAiToolInput,
} from '../types/index.js'

export interface AiToolsNamespace {
  /** 列出全部 AI 工具的 metadata + 定价(公开端点,无需鉴权)。 */
  list(): Promise<AiToolSpec[]>
  /**
   * 执行单个 AI 工具(tool 为 path 参数,取 AiToolKey 枚举)。HTTP 202 但实际同步完成
   * (202 仅表示已计费),返回值即最终结果,无需轮询;status=failed 时 Credit 已自动 refund。
   * imageId 与 imageUrl 二选一(二者皆缺 422,同时提供以 imageId 为准);
   * Credit 不足 402 INSUFFICIENT_CREDIT;trial 套餐不支持 AI 工具(403)。
   * 非幂等扣费请求,SDK 关闭自动重试(避免重复扣费)。
   */
  invoke(tool: AiToolKey, input: InvokeAiToolInput): Promise<AiToolResult>
  /** 倒序列出当前用户最近的 AI 工具调用记录(可按 tool 过滤;不分页,直接返回数组)。 */
  logs(params?: AiToolLogsParams): Promise<AiToolLogItem[]>
}

export function createAiToolsNamespace(http: HttpCore): AiToolsNamespace {
  return {
    list: () => http.request<AiToolSpec[]>({ method: 'GET', path: '/v1/ai/tools' }),
    invoke: (tool, input) =>
      http.request<AiToolResult>({
        method: 'POST',
        path: `/v1/ai/${encodeURIComponent(tool)}`,
        body: {
          ...(input.imageId !== undefined ? { imageId: input.imageId } : {}),
          ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
          ...(input.options !== undefined ? { options: input.options } : {}),
        },
        retry: false,
      }),
    logs: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.tool !== undefined) query['tool'] = params.tool
      if (params?.limit !== undefined) query['limit'] = params.limit
      return http.request<AiToolLogItem[]>({ method: 'GET', path: '/v1/ai/logs', query })
    },
  }
}

export const AI_TOOLS_COVERAGE = [
  { method: 'GET', path: '/v1/ai/tools', client: 'aiTools.list' },
  { method: 'POST', path: '/v1/ai/{tool}', client: 'aiTools.invoke' },
  { method: 'GET', path: '/v1/ai/logs', client: 'aiTools.logs' },
] as const satisfies readonly CoveredOperation[]
