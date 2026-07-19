/**
 * collectionTypes 命名空间 —— 合集类型字典(内置 + 用户自定义,v0.61.0)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type { CollectionType_Item, CreateCollectionTypeInput } from '../types/index.js'

export interface CollectionTypesNamespace {
  /** 列出对当前用户可见的合集类型(9 个内置在前,用户自定义按 sortOrder 在后)。 */
  list(): Promise<CollectionType_Item[]>
  /**
   * 创建自定义合集类型(仅 Pro+,每用户最多 10 个)。套餐不足或超上限返回 403,
   * 字段校验失败 422。
   */
  create(input: CreateCollectionTypeInput): Promise<CollectionType_Item>
  /**
   * 删除自定义合集类型(需 read_write_delete scope)。仅可删自有类型,内置类型不可删;
   * 仍有合集在引用该类型时返回 409。
   */
  delete(id: string): Promise<void>
}

export function createCollectionTypesNamespace(http: HttpCore): CollectionTypesNamespace {
  return {
    list: async () => {
      const result = await http.request<{ items: CollectionType_Item[] } | CollectionType_Item[]>({
        method: 'GET',
        path: '/v1/collection-types',
      })
      // 服务端响应形态 { items: [...] };data 已被 http core 拆封,这里再 normalize 一次保护
      if (Array.isArray(result)) return result
      if (result && typeof result === 'object' && 'items' in result) {
        return (result as { items: CollectionType_Item[] }).items
      }
      return []
    },
    create: (input) =>
      http.request<CollectionType_Item>({ method: 'POST', path: '/v1/collection-types', body: input }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/collection-types/${encodeURIComponent(id)}`,
      })
    },
  }
}

export const COLLECTION_TYPES_COVERAGE = [
  { method: 'GET', path: '/v1/collection-types', client: 'collectionTypes.list' },
  { method: 'POST', path: '/v1/collection-types', client: 'collectionTypes.create' },
  { method: 'DELETE', path: '/v1/collection-types/{id}', client: 'collectionTypes.delete' },
] as const satisfies readonly CoveredOperation[]
