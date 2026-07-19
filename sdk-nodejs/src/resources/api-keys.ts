/**
 * apiKeys 命名空间(v0.3.0 账户域批次)—— 工具端集成 API Key 管理。
 *
 * 安全语义:服务端只存哈希,**明文 Key 仅 create 响应返回一次**;
 * 吊销(delete)立即生效(写入 `revoked:{keyId}` 缓存,后续请求 401)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  ApiKey,
  ApiKeyToolConfigs,
  CreateApiKeyInput,
  CreatedApiKey,
  UpdateApiKeyInput,
  UpdatedApiKey,
} from '../types/index.js'

export interface ApiKeysNamespace {
  /**
   * 创建 API Key(PicGo / Moraya / Typora 等工具端集成用)。
   *
   * **明文 Key(`sk_live_` 前缀,共 40 字符)仅在本次响应返回一次**,服务端只存哈希,
   * 之后无法再次查看 —— 请立即持久化保存。Pro 套餐最多 3 个,Pro+ 最多 10 个
   * (超限 403 QUOTA_EXCEEDED)。
   */
  create(input: CreateApiKeyInput): Promise<CreatedApiKey>
  /** 列出当前用户全部 API Key(不含明文;含 keyPrefix、scope/scopesV2 权限、最后使用时间)。 */
  list(): Promise<ApiKey[]>
  /**
   * 更新 API Key 元数据(v0.81+):name / description / scopes,至少提供一个字段。
   * 变更 scopes 会立即清鉴权缓存使新权限生效;name/description 不影响鉴权判定。
   * 明文 Key 不会返回(更新不涉及明文)。
   */
  update(id: string, patch: UpdateApiKeyInput): Promise<UpdatedApiKey>
  /**
   * 吊销并删除 API Key。**立即生效**:写入吊销缓存,后续携带此 Key 的请求一律 401。
   * 操作不可撤销(需重新创建新 Key)。
   */
  delete(id: string): Promise<void>
  /**
   * 获取该 Key 的工具配置模板(v0.4.0+):PicGo / Moraya / Typora 预填充配置,
   * 用户填入完整明文 Key 即可使用。Key 不属于当前用户时返回 null(不暴露存在性)。
   */
  toolConfigs(id: string): Promise<ApiKeyToolConfigs | null>
}

export function createApiKeysNamespace(http: HttpCore): ApiKeysNamespace {
  return {
    create: (input) =>
      http.request<CreatedApiKey>({
        method: 'POST',
        path: '/v1/api-keys',
        body: { name: input.name },
      }),
    list: () => http.request<ApiKey[]>({ method: 'GET', path: '/v1/api-keys' }),
    update: (id, patch) =>
      http.request<UpdatedApiKey>({
        method: 'PATCH',
        path: `/v1/api-keys/${encodeURIComponent(id)}`,
        body: patch,
      }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/api-keys/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    toolConfigs: (id) =>
      http.request<ApiKeyToolConfigs | null>({
        method: 'GET',
        path: `/v1/api-keys/${encodeURIComponent(id)}/tool-configs`,
      }),
  }
}

export const API_KEYS_COVERAGE = [
  { method: 'POST', path: '/v1/api-keys', client: 'apiKeys.create' },
  { method: 'GET', path: '/v1/api-keys', client: 'apiKeys.list' },
  { method: 'PATCH', path: '/v1/api-keys/{id}', client: 'apiKeys.update' },
  { method: 'DELETE', path: '/v1/api-keys/{id}', client: 'apiKeys.delete' },
  { method: 'GET', path: '/v1/api-keys/{id}/tool-configs', client: 'apiKeys.toolConfigs' },
] as const satisfies readonly CoveredOperation[]
