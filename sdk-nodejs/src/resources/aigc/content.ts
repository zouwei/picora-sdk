/**
 * aigc.episodes / aigc.contents 子命名空间 —— 剧集与内容两级的直接寻址端点
 * (以自身 id 寻址;以 project 为父资源的剧集列表/创建见 projects.ts)。
 *
 * 层级:project → episode → content → asset;episode / content 删除均为
 * **硬删除**且向下级联(episode 删 contents+assets,content 删 assets),
 * 并同步父级缓存计数(episodeCount / contentCount)。
 */

import type { HttpCore } from '../../core/http.js'
import type { CoveredOperation } from '../../coverage/types.js'
import type {
  AigcAsset,
  AigcContent,
  AigcEpisode,
  CreateAigcContentInput,
  UpdateAigcContentInput,
  UpdateAigcEpisodeInput,
} from '../../types/index.js'

export interface AigcEpisodesNamespace {
  /** 获取单个剧集详情。 */
  get(id: string): Promise<AigcEpisode>
  /** 更新剧集(title / sequenceNo / status,至少提供一个字段),返回更新后对象。 */
  update(id: string, patch: UpdateAigcEpisodeInput): Promise<AigcEpisode>
  /** 硬删除剧集(级联删除其 contents / assets),并同步 project.episodeCount。需 read_write_delete scope。 */
  delete(id: string): Promise<void>
  /** 列出剧集下全部内容(按 sequenceNo ASC 排序;不分页,直接返回数组)。 */
  listContents(id: string): Promise<AigcContent[]>
  /** 在剧集内创建内容。省略 sequenceNo 时追加到末尾(episode.contentCount + 1)。 */
  createContent(id: string, input: CreateAigcContentInput): Promise<AigcContent>
}

export interface AigcContentsNamespace {
  /** 获取单个内容详情。 */
  get(id: string): Promise<AigcContent>
  /** 更新内容(title / docId / sequenceNo / status,至少提供一个字段;docId 传 null 解绑文档),返回更新后对象。 */
  update(id: string, patch: UpdateAigcContentInput): Promise<AigcContent>
  /** 硬删除内容(级联删除其 assets),并同步 episode.contentCount。需 read_write_delete scope。 */
  delete(id: string): Promise<void>
  /** 列出内容下全部未删除资产(按 sequenceNo DESC, createdAt DESC 排序;不分页,直接返回数组)。 */
  listAssets(id: string): Promise<AigcAsset[]>
}

export function createAigcEpisodesNamespace(http: HttpCore): AigcEpisodesNamespace {
  return {
    get: (id) =>
      http.request<AigcEpisode>({
        method: 'GET',
        path: `/v1/aigc/episodes/${encodeURIComponent(id)}`,
      }),
    update: (id, patch) =>
      http.request<AigcEpisode>({
        method: 'PATCH',
        path: `/v1/aigc/episodes/${encodeURIComponent(id)}`,
        body: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.sequenceNo !== undefined ? { sequenceNo: patch.sequenceNo } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        },
      }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/aigc/episodes/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    listContents: async (id) => {
      const raw = await http.request<{ items?: AigcContent[] }>({
        method: 'GET',
        path: `/v1/aigc/episodes/${encodeURIComponent(id)}/contents`,
      })
      return raw.items ?? []
    },
    createContent: (id, input) =>
      http.request<AigcContent>({
        method: 'POST',
        path: `/v1/aigc/episodes/${encodeURIComponent(id)}/contents`,
        body: {
          title: input.title,
          ...(input.docId !== undefined ? { docId: input.docId } : {}),
          ...(input.sequenceNo !== undefined ? { sequenceNo: input.sequenceNo } : {}),
        },
      }),
  }
}

export function createAigcContentsNamespace(http: HttpCore): AigcContentsNamespace {
  return {
    get: (id) =>
      http.request<AigcContent>({
        method: 'GET',
        path: `/v1/aigc/contents/${encodeURIComponent(id)}`,
      }),
    update: (id, patch) =>
      http.request<AigcContent>({
        method: 'PATCH',
        path: `/v1/aigc/contents/${encodeURIComponent(id)}`,
        body: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          // docId 支持显式 null(解绑文档),undefined 才是"不修改"
          ...(patch.docId !== undefined ? { docId: patch.docId } : {}),
          ...(patch.sequenceNo !== undefined ? { sequenceNo: patch.sequenceNo } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        },
      }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/aigc/contents/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    listAssets: async (id) => {
      const raw = await http.request<{ items?: AigcAsset[] }>({
        method: 'GET',
        path: `/v1/aigc/contents/${encodeURIComponent(id)}/assets`,
      })
      return raw.items ?? []
    },
  }
}

export const AIGC_CONTENT_COVERAGE = [
  { method: 'GET', path: '/v1/aigc/episodes/{id}', client: 'aigc.episodes.get' },
  { method: 'PATCH', path: '/v1/aigc/episodes/{id}', client: 'aigc.episodes.update' },
  { method: 'DELETE', path: '/v1/aigc/episodes/{id}', client: 'aigc.episodes.delete' },
  { method: 'GET', path: '/v1/aigc/episodes/{id}/contents', client: 'aigc.episodes.listContents' },
  { method: 'POST', path: '/v1/aigc/episodes/{id}/contents', client: 'aigc.episodes.createContent' },
  { method: 'GET', path: '/v1/aigc/contents/{id}', client: 'aigc.contents.get' },
  { method: 'PATCH', path: '/v1/aigc/contents/{id}', client: 'aigc.contents.update' },
  { method: 'DELETE', path: '/v1/aigc/contents/{id}', client: 'aigc.contents.delete' },
  { method: 'GET', path: '/v1/aigc/contents/{id}/assets', client: 'aigc.contents.listAssets' },
] as const satisfies readonly CoveredOperation[]
