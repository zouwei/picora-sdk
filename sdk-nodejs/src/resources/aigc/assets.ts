/**
 * aigc.assets / aigc.batchJobs / aigc.templates 子命名空间 + 顶层生成入口
 * (generate / generateBatch)。
 *
 * 计费模型:generate / generateBatch 均为 Credit 预扣 + 失败(按张)自动 refund;
 * 两者都是非幂等扣费请求,SDK 关闭 429/5xx 自动重试(避免重复扣费)。
 */

import type { HttpCore } from '../../core/http.js'
import type { CoveredOperation } from '../../coverage/types.js'
import type {
  AigcAsset,
  AigcAssetListParams,
  AigcAssetStatusInfo,
  AigcBatchJob,
  AigcTemplate,
  AigcTemplateListParams,
  GenerateAigcAssetInput,
  GenerateAigcAssetResult,
  GenerateAigcBatchAccepted,
  GenerateAigcBatchInput,
} from '../../types/index.js'

export interface AigcAssetsNamespace {
  /** 按 prompt 块 hash 查询该版本组下的全部资产版本(含历史版本;不分页,直接返回数组)。 */
  list(params: AigcAssetListParams): Promise<AigcAsset[]>
  /** 软删除资产(status → deleted),可用 restore 恢复。需 read_write_delete scope。 */
  delete(id: string): Promise<void>
  /**
   * 将资产设为所在版本组(同 promptBlockHash)的当前采用版本,
   * 原子地取消组内其它资产的 isCurrent。资产必须为 ready 状态,否则 422。
   */
  promote(id: string): Promise<AigcAsset>
  /** 恢复已软删除的资产(status deleted → ready)。 */
  restore(id: string): Promise<void>
  /**
   * 轮询资产生成状态(异步模型 generate 后使用,直到 status=ready / failed 终态)。
   */
  status(id: string): Promise<AigcAssetStatusInfo>
}

export interface AigcBatchJobsNamespace {
  /** 查询批量任务进度(轮询用,直到 status 到达 completed / partial / cancelled / failed 终态)。 */
  get(id: string): Promise<AigcBatchJob>
  /** 取消批量任务:pending 全额 refund;running 仅 refund 未派发部分。 */
  cancel(id: string): Promise<void>
}

export interface AigcTemplatesNamespace {
  /** 列出可用起手模板(可按 category 过滤,featuredOnly=true 只返 featured 内置模板)。 */
  list(params?: AigcTemplateListParams): Promise<AigcTemplate[]>
  /** 获取模板详情(含完整 spec:creatorKb / outputKb / starterDocs / episodes 骨架)。 */
  get(id: string): Promise<AigcTemplate>
}

/** 顶层生成入口(装配进 AigcNamespace 顶层,见 aigc/index.ts) */
export interface AigcGenerationMethods {
  /**
   * 单次生成资产(HTTP 固定 202,Credit 预扣 + 失败自动 refund)。
   *
   * 同步/异步双形态由返回值 status 区分(模型按 provider 决定):
   *   - flux-schnell / dall-e-3 / sdxl-lightning 同步 → status='ready',imageUrl 立即可用
   *   - flux-1.1-pro / sd3 异步 → status='pending'/'generating',
   *     轮询 aigc.assets.status(assetId) 直到终态
   *   - status='failed' → 同步形态生成失败,Credit 已自动 refund,failureReason 说明原因
   *
   * Credit 不足 402 INSUFFICIENT_CREDIT。非幂等扣费请求,SDK 关闭自动重试(避免重复扣费)。
   */
  generate(input: GenerateAigcAssetInput): Promise<GenerateAigcAssetResult>
  /**
   * 批量生成(202 受理,最多 50 张/批;Credit 一次性预扣 + 失败按张退款)。
   * 轮询 aigc.batchJobs.get(id) 看进度。同一用户同时仅允许 1 个 pending/running
   * batch(409 AIGC_BATCH_IN_PROGRESS);trial 套餐单批上限 4 张(403)。
   * Credit 不足 402 INSUFFICIENT_CREDIT。非幂等扣费请求,SDK 关闭自动重试(避免重复扣费)。
   */
  generateBatch(input: GenerateAigcBatchInput): Promise<GenerateAigcBatchAccepted>
}

export function createAigcAssetsNamespace(http: HttpCore): AigcAssetsNamespace {
  return {
    list: async (params) => {
      const raw = await http.request<{ items?: AigcAsset[] }>({
        method: 'GET',
        path: '/v1/aigc/assets',
        query: { promptBlockHash: params.promptBlockHash },
      })
      return raw.items ?? []
    },
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/aigc/assets/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    promote: (id) =>
      http.request<AigcAsset>({
        method: 'POST',
        path: `/v1/aigc/assets/${encodeURIComponent(id)}/promote`,
      }),
    restore: async (id) => {
      await http.request<void>({
        method: 'POST',
        path: `/v1/aigc/assets/${encodeURIComponent(id)}/restore`,
        response: 'none',
      })
    },
    status: (id) =>
      http.request<AigcAssetStatusInfo>({
        method: 'GET',
        path: `/v1/aigc/assets/${encodeURIComponent(id)}/status`,
      }),
  }
}

export function createAigcBatchJobsNamespace(http: HttpCore): AigcBatchJobsNamespace {
  return {
    get: (id) =>
      http.request<AigcBatchJob>({
        method: 'GET',
        path: `/v1/aigc/batch-jobs/${encodeURIComponent(id)}`,
      }),
    cancel: async (id) => {
      await http.request<void>({
        method: 'POST',
        path: `/v1/aigc/batch-jobs/${encodeURIComponent(id)}/cancel`,
        response: 'none',
      })
    },
  }
}

export function createAigcTemplatesNamespace(http: HttpCore): AigcTemplatesNamespace {
  return {
    list: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.category !== undefined) query['category'] = params.category
      if (params?.featuredOnly !== undefined) query['featuredOnly'] = params.featuredOnly
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/aigc/templates', query })
      // spec 未定型响应 schema:兼容 data 直接为数组 与 data.items 两种包装
      if (Array.isArray(raw)) return raw as AigcTemplate[]
      const items = (raw as { items?: AigcTemplate[] } | null)?.items
      return items ?? []
    },
    get: (id) =>
      http.request<AigcTemplate>({
        method: 'GET',
        path: `/v1/aigc/templates/${encodeURIComponent(id)}`,
      }),
  }
}

export function createAigcGenerationMethods(http: HttpCore): AigcGenerationMethods {
  return {
    generate: (input) =>
      http.request<GenerateAigcAssetResult>({
        method: 'POST',
        path: '/v1/aigc/generate',
        body: {
          promptYaml: input.promptYaml,
          ...(input.contentId !== undefined ? { contentId: input.contentId } : {}),
        },
        retry: false,
      }),
    generateBatch: (input) =>
      http.request<GenerateAigcBatchAccepted>({
        method: 'POST',
        path: '/v1/aigc/generate-batch',
        body: {
          jobs: input.jobs.map((job) => ({
            promptYaml: job.promptYaml,
            count: job.count,
            ...(job.referenceImageUrl !== undefined
              ? { referenceImageUrl: job.referenceImageUrl }
              : {}),
          })),
          ...(input.projectId !== undefined ? { projectId: input.projectId } : {}),
          ...(input.contentId !== undefined ? { contentId: input.contentId } : {}),
        },
        retry: false,
      }),
  }
}

export const AIGC_ASSETS_COVERAGE = [
  { method: 'GET', path: '/v1/aigc/assets', client: 'aigc.assets.list' },
  { method: 'DELETE', path: '/v1/aigc/assets/{id}', client: 'aigc.assets.delete' },
  { method: 'POST', path: '/v1/aigc/assets/{id}/promote', client: 'aigc.assets.promote' },
  { method: 'POST', path: '/v1/aigc/assets/{id}/restore', client: 'aigc.assets.restore' },
  { method: 'GET', path: '/v1/aigc/assets/{id}/status', client: 'aigc.assets.status' },
  { method: 'GET', path: '/v1/aigc/batch-jobs/{id}', client: 'aigc.batchJobs.get' },
  { method: 'POST', path: '/v1/aigc/batch-jobs/{id}/cancel', client: 'aigc.batchJobs.cancel' },
  { method: 'GET', path: '/v1/aigc/templates', client: 'aigc.templates.list' },
  { method: 'GET', path: '/v1/aigc/templates/{id}', client: 'aigc.templates.get' },
  { method: 'POST', path: '/v1/aigc/generate', client: 'aigc.generate' },
  { method: 'POST', path: '/v1/aigc/generate-batch', client: 'aigc.generateBatch' },
] as const satisfies readonly CoveredOperation[]
