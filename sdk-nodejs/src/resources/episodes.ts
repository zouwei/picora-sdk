/**
 * episodes 命名空间 —— 剧集 CRUD + episode.sync 第三方接入主链路(v0.61.1/v0.61.2)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  CreateEpisodeInput,
  Episode,
  EpisodeListParams,
  EpisodeSyncInput,
  EpisodeSyncResult,
  PaginatedResponse,
  UpdateEpisodeInput,
} from '../types/index.js'

export interface EpisodesNamespace {
  /** 游标分页列出合集内剧集(collectionId 为所属合集;支持按 status 过滤,includeDeleted 含软删项)。 */
  list(collectionId: string, params?: EpisodeListParams): Promise<PaginatedResponse<Episode>>
  /** 获取单个剧集详情。不存在或无权访问返回 404。 */
  get(collectionId: string, id: string): Promise<Episode>
  /**
   * 在合集内创建剧集。sequenceNo 在合集内唯一,重复返回 409(EPISODE_SEQUENCE_CONFLICT);
   * 字段校验失败 422。
   */
  create(collectionId: string, input: CreateEpisodeInput): Promise<Episode>
  /** 更新剧集元数据。sequenceNo 可改,但改成合集内已存在的序号返回 409。 */
  update(collectionId: string, id: string, patch: UpdateEpisodeInput): Promise<Episode>
  /** 软删剧集(需 read_write_delete scope)。 */
  delete(collectionId: string, id: string): Promise<void>
  /**
   * 按剧集批量挂载已上传资产(第三方 AI 视频生成软件接入主入口)。
   *
   * 行为:
   *   - 单次最多 100 个资产;单资产失败相互隔离,整批恒返回 HTTP 200
   *   - 幂等:自动携带 Idempotency-Key(未传入则用 input.idempotencyKey,都缺省则本次不去重),
   *     同 owner 24 小时内重放同一 key 返回首次响应
   *   - 双重去重:按 source_hash 与自然键(resourceType + resourceId)跳过重复挂载
   *   - 返回 applied[] 含每个 asset 的 applied / skipped_duplicate / failed 三态
   *   - 服务端写入 collection_episode_assets 关联 + sys_audit_logs 审计
   */
  sync(collectionId: string, episodeId: string, input: EpisodeSyncInput): Promise<EpisodeSyncResult>
}

export function createEpisodesNamespace(http: HttpCore): EpisodesNamespace {
  return {
    list: (collectionId, params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      if (params?.status !== undefined && params.status !== 'all') query['status'] = params.status
      if (params?.includeDeleted) query['includeDeleted'] = 'true'
      return http.request<PaginatedResponse<Episode>>({
        method: 'GET',
        path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes`,
        query,
      })
    },
    get: (collectionId, id) =>
      http.request<Episode>({
        method: 'GET',
        path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(id)}`,
      }),
    create: (collectionId, input) =>
      http.request<Episode>({
        method: 'POST',
        path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes`,
        body: input,
      }),
    update: (collectionId, id, patch) =>
      http.request<Episode>({
        method: 'PATCH',
        path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(id)}`,
        body: patch,
      }),
    delete: async (collectionId, id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(id)}`,
      })
    },
    sync: (collectionId, episodeId, input) =>
      http.request<EpisodeSyncResult>({
        method: 'POST',
        path: `/v1/collections/${encodeURIComponent(collectionId)}/episodes/${encodeURIComponent(episodeId)}/sync`,
        body: input,
      }),
  }
}

export const EPISODES_COVERAGE = [
  { method: 'GET', path: '/v1/collections/{collectionId}/episodes', client: 'episodes.list' },
  { method: 'POST', path: '/v1/collections/{collectionId}/episodes', client: 'episodes.create' },
  { method: 'GET', path: '/v1/collections/{collectionId}/episodes/{id}', client: 'episodes.get' },
  { method: 'PATCH', path: '/v1/collections/{collectionId}/episodes/{id}', client: 'episodes.update' },
  { method: 'DELETE', path: '/v1/collections/{collectionId}/episodes/{id}', client: 'episodes.delete' },
  { method: 'POST', path: '/v1/collections/{collectionId}/episodes/{id}/sync', client: 'episodes.sync' },
] as const satisfies readonly CoveredOperation[]
