/**
 * collections 命名空间 —— 合集(多媒体统一容器,v0.61.0)。
 * manifest(v3 多资源清单)随 v0.3.0 分批补齐追加。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  Collection,
  CollectionListParams,
  CollectionManifest,
  CollectionManifestParams,
  CreateCollectionInput,
  PaginatedResponse,
  UpdateCollectionInput,
} from '../types/index.js'

export interface CollectionsNamespace {
  /** 游标分页列出合集(默认 updated_at DESC;支持按类型 type / kbType 过滤,includeDeleted 含软删项)。 */
  list(params?: CollectionListParams): Promise<PaginatedResponse<Collection>>
  /** 获取单个合集详情(含 doc / image / video / audio 各资源类型计数)。不存在或无权访问返回 404。 */
  get(id: string): Promise<Collection>
  /**
   * 创建合集(多媒体统一容器)。collectionType 创建后不可更改;allowedResourceTypes
   * 缺省按类型默认值填充,之后只可扩展不可缩小;collectionType='custom' 时必须提供
   * customTypeId。合集数量超套餐上限返回 403,字段校验失败 422。
   */
  create(input: CreateCollectionInput): Promise<Collection>
  /**
   * 更新合集元数据(name / description / isDefault / allowedResourceTypes)。
   * collectionType / slug / customTypeId 创建后不可改(尝试改 collectionType 返回 409);
   * allowedResourceTypes 只可扩展不可缩小(缩减被服务端拒绝)。
   */
  update(id: string, patch: UpdateCollectionInput): Promise<Collection>
  /**
   * 软删合集(需 read_write_delete scope)。默认拒绝删除非空合集;
   * cascade:true 级联删除合集内全部资源。
   */
  delete(id: string, opts?: { cascade?: boolean }): Promise<void>
  /**
   * 获取合集 v3 多资源清单:合集内 doc / image / video / audio 资源轻量列表 +
   * 各类型计数,游标分页。协议参数 version=3 由 SDK 固定携带(当前唯一受支持版本);
   * KB 的 doc-only v2 清单请用 kbs.manifest()。
   */
  manifest(id: string, opts?: CollectionManifestParams): Promise<CollectionManifest>
}

export function createCollectionsNamespace(http: HttpCore): CollectionsNamespace {
  return {
    list: (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      if (params?.sort !== undefined) query['sort'] = params.sort
      if (params?.type !== undefined && params.type !== 'all') query['type'] = params.type
      if (params?.kbType !== undefined && params.kbType !== 'all') query['kbType'] = params.kbType
      if (params?.includeDeleted) query['includeDeleted'] = 'true'
      return http.request<PaginatedResponse<Collection>>({ method: 'GET', path: '/v1/collections', query })
    },
    get: (id) =>
      http.request<Collection>({ method: 'GET', path: `/v1/collections/${encodeURIComponent(id)}` }),
    create: (input) =>
      http.request<Collection>({ method: 'POST', path: '/v1/collections', body: input }),
    update: (id, patch) =>
      http.request<Collection>({
        method: 'PATCH',
        path: `/v1/collections/${encodeURIComponent(id)}`,
        body: patch,
      }),
    delete: async (id, opts) => {
      const baseArgs = {
        method: 'DELETE' as const,
        path: `/v1/collections/${encodeURIComponent(id)}`,
      }
      await http.request<void>(opts?.cascade
        ? { ...baseArgs, query: { cascade: 'true' } }
        : baseArgs)
    },
    manifest: (id, opts) => {
      // version=3 是必填协议参数且当前唯一合法值,SDK 固定携带
      const query: Record<string, string | number | boolean | undefined> = { version: '3' }
      if (opts?.cursor !== undefined) query['cursor'] = opts.cursor
      if (opts?.limit !== undefined) query['limit'] = opts.limit
      return http.request<CollectionManifest>({
        method: 'GET',
        path: `/v1/collections/${encodeURIComponent(id)}/manifest`,
        query,
      })
    },
  }
}

export const COLLECTIONS_COVERAGE = [
  { method: 'GET', path: '/v1/collections', client: 'collections.list' },
  { method: 'POST', path: '/v1/collections', client: 'collections.create' },
  { method: 'GET', path: '/v1/collections/{id}', client: 'collections.get' },
  { method: 'PATCH', path: '/v1/collections/{id}', client: 'collections.update' },
  { method: 'DELETE', path: '/v1/collections/{id}', client: 'collections.delete' },
  { method: 'GET', path: '/v1/collections/{id}/manifest', client: 'collections.manifest' },
] as const satisfies readonly CoveredOperation[]
