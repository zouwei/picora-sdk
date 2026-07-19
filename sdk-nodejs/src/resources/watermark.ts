/**
 * watermarkTemplates 命名空间 —— 水印模板 CRUD(创建 / 更新需 pro_plus 套餐)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type { WatermarkTemplate, WatermarkTemplateInput } from '../types/index.js'

export interface WatermarkTemplatesNamespace {
  /** 列出当前用户的全部水印模板(仅自己的,不含他人)。 */
  list(): Promise<WatermarkTemplate[]>
  /** 获取单个水印模板完整配置(仅限模板所有者)。 */
  get(id: string): Promise<WatermarkTemplate>
  /**
   * 创建水印模板(需 pro_plus)。支持文字 / 图片水印,可设透明度、位置、字号等。
   * 非幂等请求,SDK 关闭 429/5xx 自动重试。
   */
  create(input: WatermarkTemplateInput): Promise<WatermarkTemplate>
  /**
   * 更新水印模板(需 pro_plus)。传 ifUnmodifiedSince 启用乐观锁:
   * 模板在该时间之后被修改时服务端返回 412 Precondition Failed。
   */
  update(
    id: string,
    input: WatermarkTemplateInput,
    opts?: { ifUnmodifiedSince?: string },
  ): Promise<WatermarkTemplate>
  /** 永久删除水印模板(不可恢复);已在图片上应用的水印不受影响。 */
  delete(id: string): Promise<void>
}

export function createWatermarkTemplatesNamespace(http: HttpCore): WatermarkTemplatesNamespace {
  return {
    list: () =>
      http.request<WatermarkTemplate[]>({ method: 'GET', path: '/v1/watermark-templates' }),
    get: (id) =>
      http.request<WatermarkTemplate>({
        method: 'GET',
        path: `/v1/watermark-templates/${encodeURIComponent(id)}`,
      }),
    create: (input) =>
      http.request<WatermarkTemplate>({
        method: 'POST',
        path: '/v1/watermark-templates',
        body: input,
        retry: false,
      }),
    update: (id, input, opts) =>
      http.request<WatermarkTemplate>({
        method: 'PATCH',
        path: `/v1/watermark-templates/${encodeURIComponent(id)}`,
        body: input,
        ...(opts?.ifUnmodifiedSince !== undefined
          ? { headers: { 'If-Unmodified-Since': opts.ifUnmodifiedSince } }
          : {}),
      }),
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/watermark-templates/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
  }
}

export const WATERMARK_COVERAGE = [
  { method: 'GET', path: '/v1/watermark-templates', client: 'watermarkTemplates.list' },
  { method: 'POST', path: '/v1/watermark-templates', client: 'watermarkTemplates.create' },
  { method: 'GET', path: '/v1/watermark-templates/{id}', client: 'watermarkTemplates.get' },
  { method: 'PATCH', path: '/v1/watermark-templates/{id}', client: 'watermarkTemplates.update' },
  { method: 'DELETE', path: '/v1/watermark-templates/{id}', client: 'watermarkTemplates.delete' },
] as const satisfies readonly CoveredOperation[]
