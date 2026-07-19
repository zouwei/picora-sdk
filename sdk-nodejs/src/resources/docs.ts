/**
 * docs 命名空间 —— Markdown 文档托管(v0.15.0+,历史版本 v0.74.0)。
 *
 * 上传为 JSON body(正文放 content 字符串,非 multipart);全文读取走独立 raw 端点
 * (text/markdown 纯文本,非 JSON 包络)。历史版本(revisions)以子命名空间挂载。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { normalizePage } from '../core/pagination.js'
import type {
  CreateDocInput,
  DocItem,
  DocListParams,
  DocRevisionDetail,
  DocRevisionList,
  DocUploadResult,
  DocsBatchDeleteInput,
  DocsBatchDeleteResult,
  DocsBatchMoveInput,
  DocsBatchMoveResult,
  DocsRawBatchResult,
  PaginatedResponse,
  RestoreDocRevisionResult,
  UpdateDocInput,
} from '../types/index.js'

export interface DocsNamespace {
  /**
   * 上传 Markdown 文档(JSON body)。内嵌 base64 图片默认自动上传并改写为 CDN URL;
   * 同一用户内容 sha256 相同时返回既有文档(duplicate=true,不计配额)。
   * 受文档数配额约束(记忆点目录 .claude/.moraya 等走 memory_doc_count,其余走 doc_count),
   * 超限返回 403;新建成功后同步更新配额缓存。字段校验失败 422。
   * KB 批量写入推荐走 kbs.sync 而非逐篇 create。
   */
  create(input: CreateDocInput): Promise<DocUploadResult>
  /** 游标分页列出文档(支持全文搜索 q / 标签 tag / 可见性 isPublic / KB + 路径前缀过滤)。 */
  list(params?: DocListParams): Promise<PaginatedResponse<DocItem>>
  /** 获取单个文档元数据(不含正文;正文用 raw())。私有文档需认证且为所有者,否则 404。 */
  get(id: string): Promise<DocItem>
  /**
   * 更新文档元数据(title / isPublic / tags),或经 kbId + relativePath 移入 KB;kbId 传 null 移出 KB。
   * 至少提供一个字段;正文内容不可经此端点修改(需重新上传)。
   */
  update(id: string, patch: UpdateDocInput): Promise<DocItem>
  /** 删除单个文档。默认软删;hard:true 硬删并清理 R2 文件。 */
  delete(id: string, opts?: { hard?: boolean }): Promise<void>
  /**
   * 批量删除文档(单次最多 50 个)。默认软删;hard:true 硬删。
   * 软删文档仍在 KB manifest 中可见(deletedAt 非 null);需要 KB tombstone 语义时
   * 建议改走 kbs.sync 的 delete op。
   */
  batchDelete(input: DocsBatchDeleteInput): Promise<DocsBatchDeleteResult>
  /**
   * 获取文档 Markdown 原文(text/markdown 纯文本 string,非 JSON 包络)。
   * 公开文档可匿名访问;私有文档需为所有者,否则 404。
   */
  raw(id: string): Promise<string>
  /**
   * 批量获取多个文档的 Markdown 原文(单次最多 50 个 id,把 N 次 raw 往返压到 1 次)。
   * 越权 / 不存在 / 已软删的 id 统一归入 failed[](NOT_FOUND,不泄漏存在性);
   * docs[] 顺序与入参 ids 一致。只读操作,不计上传配额。
   */
  rawBatch(input: { ids: string[] }): Promise<DocsRawBatchResult>
  /**
   * 批量迁移文档合集归属(单次最多 50 个)。kbId 传目标合集 ID 迁入
   * (每篇沿用自身相对路径,缺省用 filename);传 null 移出合集。
   * 逐篇处理,失败项(路径冲突 / 目标合集不存在等)归入 failed[]。
   */
  batchMove(input: DocsBatchMoveInput): Promise<DocsBatchMoveResult>
  /** 文档历史版本(v0.74.0:开启版本控制后 KB 文档内容变更自动留存快照,超上限滚动淘汰)。 */
  readonly revisions: {
    /** 列出文档全部历史版本(revNumber 倒序)及版本总占用字节。读取不受套餐门禁限制。 */
    list(docId: string): Promise<DocRevisionList>
    /** 获取指定历史版本的完整 Markdown 正文与版本元数据。 */
    get(docId: string, revId: string): Promise<DocRevisionDetail>
    /**
     * 还原文档到指定历史版本(等价于一次内容替换上传):当前版先快照为新历史版本
     * (origin=restore),历史内容成为新当前版(文档 ID 更新,历史版本自动重挂靠);
     * title / tags / isPublic 元数据保留。还原内容与当前内容 hash 一致时
     * duplicate=true 且无副作用。写操作,受套餐门禁限制(PLAN_INACTIVE)。
     */
    restore(docId: string, revId: string): Promise<RestoreDocRevisionResult>
  }
}

export function createDocsNamespace(http: HttpCore): DocsNamespace {
  return {
    create: (input) =>
      http.request<DocUploadResult>({
        method: 'POST',
        path: '/v1/docs',
        body: {
          filename: input.filename,
          content: input.content,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.tags !== undefined ? { tags: input.tags } : {}),
          ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
          ...(input.rewriteImages !== undefined ? { rewriteImages: input.rewriteImages } : {}),
          ...(input.kbId !== undefined ? { kbId: input.kbId } : {}),
          ...(input.relativePath !== undefined ? { relativePath: input.relativePath } : {}),
        },
      }),
    list: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      if (params?.q !== undefined) query['q'] = params.q
      if (params?.tag !== undefined) query['tag'] = params.tag
      if (params?.isPublic !== undefined) query['isPublic'] = params.isPublic
      if (params?.sort !== undefined) query['sort'] = params.sort
      if (params?.kbId !== undefined) query['kbId'] = params.kbId
      if (params?.prefix !== undefined) query['prefix'] = params.prefix
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/docs', query })
      return normalizePage<DocItem>(raw, 'items')
    },
    get: (id) =>
      http.request<DocItem>({ method: 'GET', path: `/v1/docs/${encodeURIComponent(id)}` }),
    update: (id, patch) =>
      http.request<DocItem>({
        method: 'PATCH',
        path: `/v1/docs/${encodeURIComponent(id)}`,
        body: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.isPublic !== undefined ? { isPublic: patch.isPublic } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          // kbId 显式传 null 表示移出 KB(与"未提供"语义不同,须区分)
          ...(patch.kbId !== undefined ? { kbId: patch.kbId } : {}),
          ...(patch.relativePath !== undefined ? { relativePath: patch.relativePath } : {}),
        },
      }),
    delete: async (id, opts) => {
      const baseArgs = {
        method: 'DELETE' as const,
        path: `/v1/docs/${encodeURIComponent(id)}`,
        response: 'none' as const,
      }
      await http.request<void>(opts?.hard === true ? { ...baseArgs, query: { hard: true } } : baseArgs)
    },
    batchDelete: (input) => {
      const baseArgs = {
        method: 'DELETE' as const,
        path: '/v1/docs',
        body: { ids: input.ids },
      }
      return http.request<DocsBatchDeleteResult>(
        input.hard === true ? { ...baseArgs, query: { hard: true } } : baseArgs,
      )
    },
    raw: (id) =>
      http.request<string>({
        method: 'GET',
        path: `/v1/docs/${encodeURIComponent(id)}/raw`,
        response: 'text',
      }),
    // 路径含冒号(raw:batch 是 Google AIP 风格自定义动词,非 path 参数),直接字面拼接
    rawBatch: (input) =>
      http.request<DocsRawBatchResult>({
        method: 'POST',
        path: '/v1/docs/raw:batch',
        body: { ids: input.ids },
      }),
    batchMove: (input) =>
      http.request<DocsBatchMoveResult>({
        method: 'POST',
        path: '/v1/docs/batch-move',
        body: { ids: input.ids, kbId: input.kbId },
      }),
    revisions: {
      list: (docId) =>
        http.request<DocRevisionList>({
          method: 'GET',
          path: `/v1/docs/${encodeURIComponent(docId)}/revisions`,
        }),
      get: (docId, revId) =>
        http.request<DocRevisionDetail>({
          method: 'GET',
          path: `/v1/docs/${encodeURIComponent(docId)}/revisions/${encodeURIComponent(revId)}`,
        }),
      restore: (docId, revId) =>
        http.request<RestoreDocRevisionResult>({
          method: 'POST',
          path: `/v1/docs/${encodeURIComponent(docId)}/revisions/${encodeURIComponent(revId)}/restore`,
        }),
    },
  }
}

export const DOCS_COVERAGE = [
  { method: 'POST', path: '/v1/docs', client: 'docs.create' },
  { method: 'GET', path: '/v1/docs', client: 'docs.list' },
  { method: 'DELETE', path: '/v1/docs', client: 'docs.batchDelete' },
  { method: 'GET', path: '/v1/docs/{id}', client: 'docs.get' },
  { method: 'PATCH', path: '/v1/docs/{id}', client: 'docs.update' },
  { method: 'DELETE', path: '/v1/docs/{id}', client: 'docs.delete' },
  { method: 'GET', path: '/v1/docs/{id}/raw', client: 'docs.raw' },
  { method: 'POST', path: '/v1/docs/raw:batch', client: 'docs.rawBatch' },
  { method: 'POST', path: '/v1/docs/batch-move', client: 'docs.batchMove' },
  { method: 'GET', path: '/v1/docs/{id}/revisions', client: 'docs.revisions.list' },
  { method: 'GET', path: '/v1/docs/{id}/revisions/{revId}', client: 'docs.revisions.get' },
  { method: 'POST', path: '/v1/docs/{id}/revisions/{revId}/restore', client: 'docs.revisions.restore' },
] as const satisfies readonly CoveredOperation[]
