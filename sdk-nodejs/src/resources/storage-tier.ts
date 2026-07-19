/**
 * storageTier 命名空间 —— 存储冷热分层统计 / 回热 + 两步批量删除。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  BulkDeleteExecuteInput,
  BulkDeleteExecuteResult,
  BulkDeletePreviewInput,
  BulkDeletePreviewResult,
  PromoteStorageTierInput,
  PromoteStorageTierResult,
  StorageTierStats,
} from '../types/index.js'

export interface StorageTierNamespace {
  /** 获取当前用户各存储层(hot / cool / archive)的文件数量、容量占比及月费用节省估算。 */
  stats(): Promise<StorageTierStats>
  /**
   * 将资源从 archive 层回热(restore)到 hot 层以恢复可访问。
   * CF R2 IA 立即生效;阿里云 OSS 异步触发可能有延迟。单次最多 100 个资源 ID。
   */
  promote(input: PromoteStorageTierInput): Promise<PromoteStorageTierResult>
  /**
   * 两步批量删除 —— 第一步(dryRun 预览):按过滤条件扫描匹配资源,
   * 返回 count + snapshotToken(5 分钟有效),不实际删除。
   */
  bulkDelete(input: BulkDeletePreviewInput): Promise<BulkDeletePreviewResult>
  /**
   * 两步批量删除 —— 第二步(确认执行):提交 snapshotToken + confirmCount
   * (须与预览返回的 count 一致,防并发误删)后执行实际删除。
   * 非幂等请求,SDK 关闭 429/5xx 自动重试。
   */
  bulkDelete(input: BulkDeleteExecuteInput): Promise<BulkDeleteExecuteResult>
}

/** 判定 bulk-delete 入参是否为第二步(确认执行)形态 */
function isExecuteInput(
  input: BulkDeletePreviewInput | BulkDeleteExecuteInput,
): input is BulkDeleteExecuteInput {
  return 'snapshotToken' in input
}

export function createStorageTierNamespace(http: HttpCore): StorageTierNamespace {
  function bulkDelete(input: BulkDeletePreviewInput): Promise<BulkDeletePreviewResult>
  function bulkDelete(input: BulkDeleteExecuteInput): Promise<BulkDeleteExecuteResult>
  function bulkDelete(
    input: BulkDeletePreviewInput | BulkDeleteExecuteInput,
  ): Promise<BulkDeletePreviewResult | BulkDeleteExecuteResult> {
    if (isExecuteInput(input)) {
      return http.request<BulkDeleteExecuteResult>({
        method: 'POST',
        path: '/v1/bulk-delete',
        query: { dryRun: false },
        body: input,
        retry: false,
      })
    }
    return http.request<BulkDeletePreviewResult>({
      method: 'POST',
      path: '/v1/bulk-delete',
      query: { dryRun: true },
      body: input,
    })
  }

  return {
    stats: () =>
      http.request<StorageTierStats>({ method: 'GET', path: '/v1/me/storage-tier-stats' }),
    promote: (input) =>
      http.request<PromoteStorageTierResult>({
        method: 'POST',
        path: '/v1/me/storage-tier/promote',
        body: input,
      }),
    bulkDelete,
  }
}

export const STORAGE_TIER_COVERAGE = [
  { method: 'GET', path: '/v1/me/storage-tier-stats', client: 'storageTier.stats' },
  { method: 'POST', path: '/v1/me/storage-tier/promote', client: 'storageTier.promote' },
  { method: 'POST', path: '/v1/bulk-delete', client: 'storageTier.bulkDelete' },
] as const satisfies readonly CoveredOperation[]
