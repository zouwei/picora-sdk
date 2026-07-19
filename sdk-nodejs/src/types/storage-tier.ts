/**
 * 存储分层 + 两步批量删除类型(storage-tier)。
 */

/** 单个存储层的分布统计 */
export interface StorageTierStat {
  /** 该层文件数量 */
  count: number
  /** 该层总占用空间(bytes) */
  sizeBytes: number
  /** 占总空间的比例(0-1) */
  percentage: number
}

/** GET /v1/me/storage-tier-stats 结果 */
export interface StorageTierStats {
  hot: StorageTierStat
  cool: StorageTierStat
  archive: StorageTierStat
  /** 冷热分层带来的月费用节省估算(USD) */
  savingsEstimateMonthly: number
}

/** storage-tier / bulk-delete 通用资源类型 */
export type TierResourceType = 'image' | 'video' | 'media' | 'document'

/** POST /v1/me/storage-tier/promote 入参 */
export interface PromoteStorageTierInput {
  resourceType: TierResourceType
  /** 要提升的资源 ID 列表(nanoid),单次最多 100 个 */
  resourceIds: string[]
}

/** POST /v1/me/storage-tier/promote 结果 */
export interface PromoteStorageTierResult {
  /** 成功提交的资源数量 */
  promoted: number
  /** 失败的资源数量(资源不存在或无权访问) */
  failed: number
}

/** POST /v1/bulk-delete 第一步(dryRun)过滤条件(全部可选,组合 AND) */
export interface BulkDeleteFilters {
  /** 仅删除此时间之前创建的资源(ISO 8601) */
  createdBefore?: string
  /** 仅删除大于此大小的资源(bytes) */
  minSizeBytes?: number
  /** 仅删除含这些标签的资源(AND 关系) */
  tags?: string[]
  /** 仅删除公开(true)或私有(false)资源 */
  isPublic?: boolean
}

/** POST /v1/bulk-delete 第一步(dryRun=true)入参:按条件扫描,不实际删除 */
export interface BulkDeletePreviewInput {
  resourceType: TierResourceType
  filters?: BulkDeleteFilters
}

/** POST /v1/bulk-delete 第一步结果 */
export interface BulkDeletePreviewResult {
  /** 匹配的资源数量 */
  count: number
  /** 用于第二步确认的快照令牌(5 分钟有效) */
  snapshotToken: string
}

/** POST /v1/bulk-delete 第二步(dryRun=false)入参:确认执行删除 */
export interface BulkDeleteExecuteInput {
  /** dryRun 步骤返回的快照令牌(5 分钟有效) */
  snapshotToken: string
  /** 用户确认的删除数量(必须与 dryRun 返回的 count 一致,防止并发误操作) */
  confirmCount: number
}

/** POST /v1/bulk-delete 第二步结果 */
export interface BulkDeleteExecuteResult {
  /** 实际删除数量 */
  deleted: number
  /** 删除失败数量 */
  failed: number
}
