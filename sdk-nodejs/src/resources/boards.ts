/**
 * boards 命名空间 —— 教学画板(`.boardraw`,Excalidraw 兼容场景 JSON,v0.80.0)。
 *
 * 与 docs 平行:元数据用 Board(list/get),场景全文用 getRaw(纯文本 JSON 字符串)。
 * 上传 create 受套餐门禁(需 active plan);公开画板 getRaw 无需认证。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  Board,
  BoardBatchDeleteResult,
  BoardListParams,
  BoardListResult,
  CreateBoardInput,
  UpdateBoardInput,
} from '../types/index.js'

export interface BoardsNamespace {
  /**
   * 上传教学画板(`.boardraw`)。filename 必须以 `.boardraw` 结尾,content 为
   * Excalidraw 兼容场景 JSON 字符串(≤5 MB)。source_hash 命中既有画板时返回原记录
   * 不重复计费;场景 JSON 非法返回 422 BOARD_SCENE_INVALID。
   */
  create(input: CreateBoardInput): Promise<Board>
  /** 游标分页列出画板(默认 created_desc;支持 q 模糊搜索 / tag 过滤 / isPublic 过滤;sort 切换时游标失效)。 */
  list(params?: BoardListParams): Promise<BoardListResult>
  /** 获取单个画板元数据(不含场景全文)。不存在或无权访问返回 404。 */
  get(id: string): Promise<Board>
  /**
   * 获取画板场景全文(Excalidraw JSON 字符串,原样返回未解析)。
   * 公开画板(isPublic=true)无需认证即可读取。
   */
  getRaw(id: string): Promise<string>
  /** 更新画板元数据(title / isPublic / tags,至少提供一个字段;不改场景内容)。 */
  update(id: string, patch: UpdateBoardInput): Promise<Board>
  /** 删除单个画板(硬删 DB + R2 场景对象)。 */
  delete(id: string): Promise<void>
  /** 批量删除画板(1~50 个)。部分失败不回滚成功项,失败 ID 记入 failed。 */
  batchDelete(ids: string[]): Promise<BoardBatchDeleteResult>
}

export function createBoardsNamespace(http: HttpCore): BoardsNamespace {
  return {
    create: (input) =>
      http.request<Board>({ method: 'POST', path: '/v1/boards', body: input }),
    list: (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      if (params?.q !== undefined) query['q'] = params.q
      if (params?.tag !== undefined) query['tag'] = params.tag
      if (params?.isPublic !== undefined) query['isPublic'] = params.isPublic ? 'true' : 'false'
      if (params?.sort !== undefined) query['sort'] = params.sort
      return http.request<BoardListResult>({ method: 'GET', path: '/v1/boards', query })
    },
    get: (id) =>
      http.request<Board>({ method: 'GET', path: `/v1/boards/${encodeURIComponent(id)}` }),
    getRaw: (id) =>
      http.request<string>({
        method: 'GET',
        path: `/v1/boards/${encodeURIComponent(id)}/raw`,
        response: 'text',
      }),
    update: (id, patch) =>
      http.request<Board>({
        method: 'PATCH',
        path: `/v1/boards/${encodeURIComponent(id)}`,
        body: patch,
      }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/boards/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    batchDelete: (ids) =>
      http.request<BoardBatchDeleteResult>({
        method: 'DELETE',
        path: '/v1/boards',
        body: { ids },
      }),
  }
}

export const BOARDS_COVERAGE = [
  { method: 'POST', path: '/v1/boards', client: 'boards.create' },
  { method: 'GET', path: '/v1/boards', client: 'boards.list' },
  { method: 'DELETE', path: '/v1/boards', client: 'boards.batchDelete' },
  { method: 'GET', path: '/v1/boards/{id}', client: 'boards.get' },
  { method: 'GET', path: '/v1/boards/{id}/raw', client: 'boards.getRaw' },
  { method: 'PATCH', path: '/v1/boards/{id}', client: 'boards.update' },
  { method: 'DELETE', path: '/v1/boards/{id}', client: 'boards.delete' },
] as const satisfies readonly CoveredOperation[]
