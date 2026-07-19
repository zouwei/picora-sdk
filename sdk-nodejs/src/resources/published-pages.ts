/**
 * publishedPages 命名空间(v0.3.0 平台域批次,v0.43 发布页)—— 从 KB 文档创建
 * 公开渲染页,CRUD + 公众号 HTML 导出 + 公开页读取。
 *
 * 公开访问路径 GET /p/{slug} 无需认证(KV 缓存 24h,text/html);
 * exportWechat 按 spec 为 JSON 包装({ html }),非纯文本响应。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  CreatePublishedPageInput,
  PublishedPage,
  UpdatePublishedPageInput,
  WechatExportResult,
} from '../types/index.js'

export interface PublishedPagesNamespace {
  /** 列出当前用户的全部发布页(draft / published / unpublished)。 */
  list(): Promise<PublishedPage[]>
  /** 从 KB 文档创建发布页(201)。slug 全 owner 唯一;layout 决定渲染模板。 */
  create(input: CreatePublishedPageInput): Promise<PublishedPage>
  /**
   * 更新发布页元数据(title / description / coverImageId / layout;slug 不可改,要改请重建)。
   * 返回更新后的发布页;更新同步刷新页面 HTML 缓存。
   */
  update(id: string, patch: UpdatePublishedPageInput): Promise<PublishedPage>
  /** 删除(下线)发布页,同步清除页面 HTML 缓存。仅页面所有者可调用。 */
  delete(id: string): Promise<void>
  /**
   * 导出公众号兼容 HTML(内联样式,不依赖外部 CSS,可直接粘贴到公众号编辑器)。
   * 图片走 media.picora.me CDN(公众号会自动转存)。返回 { html } JSON 对象。
   */
  exportWechat(id: string): Promise<WechatExportResult>
  /**
   * 读取公开渲染页(**GET /p/{slug}**,公开端点无需认证)。
   * 响应为 text/html 完整页面字符串(服务端 KV 缓存 24h,
   * Cache-Control: public, max-age=3600);viewCount 后台异步累加。
   */
  publicPage(slug: string): Promise<string>
}

export function createPublishedPagesNamespace(http: HttpCore): PublishedPagesNamespace {
  return {
    list: () => http.request<PublishedPage[]>({ method: 'GET', path: '/v1/published-pages' }),
    create: (input) =>
      http.request<PublishedPage>({
        method: 'POST',
        path: '/v1/published-pages',
        body: {
          docId: input.docId,
          slug: input.slug,
          title: input.title,
          layout: input.layout,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.coverImageId !== undefined ? { coverImageId: input.coverImageId } : {}),
        },
      }),
    update: (id, patch) =>
      http.request<PublishedPage>({
        method: 'PATCH',
        path: `/v1/published-pages/${encodeURIComponent(id)}`,
        body: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.coverImageId !== undefined ? { coverImageId: patch.coverImageId } : {}),
          ...(patch.layout !== undefined ? { layout: patch.layout } : {}),
        },
      }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/published-pages/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    exportWechat: (id) =>
      http.request<WechatExportResult>({
        method: 'GET',
        path: `/v1/published-pages/${encodeURIComponent(id)}/export/wechat`,
      }),
    // /p/{slug} 返回 text/html 整页字符串(非 JSON 包络),用 'text' 模式
    publicPage: (slug) =>
      http.request<string>({
        method: 'GET',
        path: `/p/${encodeURIComponent(slug)}`,
        response: 'text',
      }),
  }
}

export const PUBLISHED_PAGES_COVERAGE = [
  { method: 'GET', path: '/v1/published-pages', client: 'publishedPages.list' },
  { method: 'POST', path: '/v1/published-pages', client: 'publishedPages.create' },
  { method: 'PATCH', path: '/v1/published-pages/{id}', client: 'publishedPages.update' },
  { method: 'DELETE', path: '/v1/published-pages/{id}', client: 'publishedPages.delete' },
  {
    method: 'GET',
    path: '/v1/published-pages/{id}/export/wechat',
    client: 'publishedPages.exportWechat',
  },
  { method: 'GET', path: '/p/{slug}', client: 'publishedPages.publicPage' },
] as const satisfies readonly CoveredOperation[]
