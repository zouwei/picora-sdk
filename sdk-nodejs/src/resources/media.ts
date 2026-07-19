/**
 * media 命名空间 —— 统一媒体端点(v0.12.0+):一次拉取 / 删除图片 + 视频 + 音频混合资源。
 *
 * 为第三方客户端(Moraya / 自研工具)提供便捷入口,免去分别调三个独立接口;
 * items[] 元素以 type 字段区分资源种类。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { normalizePage } from '../core/pagination.js'
import type {
  MediaBatchDeleteResult,
  MediaItem,
  MediaListParams,
  MediaRef,
  PaginatedResponse,
} from '../types/index.js'

export interface MediaNamespace {
  /**
   * 游标分页列出混合媒体(图片 + 视频 + 音频),按 created_at 降序。支持 type 类型过滤、
   * q 标题/文件名模糊搜索、isPublic 可见性过滤;limit 每页 1-100(默认 20)。
   * items[] 元素以 type 字段区分资源种类。
   */
  list(params?: MediaListParams): Promise<PaginatedResponse<MediaItem>>
  /** 按 ID 获取单个媒体项目(视频或音频)详细元数据,依 media_type 返回对应 DTO。 */
  get(id: string): Promise<MediaItem>
  /**
   * 批量删除混合类型资源(单次最多 100 个 {id, type})。
   * 部分失败不回滚:已删除的保持成功,失败的列入 failed[];全部删除同步清理 R2 + DB + KV。
   */
  batchDelete(input: { items: MediaRef[] }): Promise<MediaBatchDeleteResult>
}

export function createMediaNamespace(http: HttpCore): MediaNamespace {
  return {
    list: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.type !== undefined) query['type'] = params.type
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      if (params?.q !== undefined) query['q'] = params.q
      // wire 参数名为 snake_case is_public
      if (params?.isPublic !== undefined) query['is_public'] = params.isPublic
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/media', query })
      return normalizePage<MediaItem>(raw, 'items')
    },
    get: (id) =>
      http.request<MediaItem>({ method: 'GET', path: `/v1/media/${encodeURIComponent(id)}` }),
    batchDelete: (input) =>
      http.request<MediaBatchDeleteResult>({
        method: 'DELETE',
        path: '/v1/media',
        body: { items: input.items },
      }),
  }
}

export const MEDIA_COVERAGE = [
  { method: 'GET', path: '/v1/media', client: 'media.list' },
  { method: 'GET', path: '/v1/media/{id}', client: 'media.get' },
  { method: 'DELETE', path: '/v1/media', client: 'media.batchDelete' },
] as const satisfies readonly CoveredOperation[]
