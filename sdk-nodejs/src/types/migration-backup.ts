/**
 * migration(迁入)+ backup(备份导出)域类型(v0.3.0 平台域批次)。
 *
 * migration(v0.49/v0.58):从 Imgur/SM.MS/Bunpic/自定义 URL 或 Apple Photos
 * 导出 zip 一键迁入 Picora。任务均为 202 异步,客户端轮询进度。
 *
 * backup(v0.55):周期订阅($0.99/月)或一次性($9.99)全量打包导出到
 * email / WebDAV / Google Drive / 阿里云盘 / S3 五类目标。付费经 Creem checkout。
 */

// ────────────────────────── migration ──────────────────────────

/** 迁入来源平台 */
export type MigrationSource = 'imgur' | 'smms' | 'bunpic' | 'custom_urls' | 'apple_photos_export'

/** 迁入套餐包(light=200 URLs/500MB · bulk=2000/5GB · mega=20000/50GB,按来源类型定义) */
export type MigrationPackageType = 'light' | 'bulk' | 'mega'

/** 迁入任务状态 */
export type MigrationJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

/** 迁入任务(v0.49 / v0.58) */
export interface MigrationJob {
  /** 任务 ID(nanoid 21 字符) */
  id: string
  /** 所属用户 ID */
  userId?: string
  /** 迁入来源 */
  source: MigrationSource
  /** 总条目数 */
  total: number
  /** 已处理数 */
  processed?: number
  /** 成功数 */
  succeeded?: number
  /** 失败数 */
  failed?: number
  /** 因内容重复跳过数 */
  duplicateSkipped?: number
  /** 任务状态 */
  status: MigrationJobStatus
  /** 是否启用原 URL → 新 URL 的 30 天 302 重定向 */
  redirectEnabled?: boolean
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 完成时间(ISO 8601);null 表示未完成 */
  completedAt?: string | null
  /** 重定向映射过期时间(ISO 8601);null 表示不适用 */
  expiresAt?: string | null
}

/** POST /v1/migration/jobs 入参 */
export interface CreateMigrationJobInput {
  /** 迁移来源平台(Apple Photos 走独立的 applePhotos.start 流程) */
  source: 'imgur' | 'smms' | 'bunpic' | 'custom_urls'
  /** 套餐包:light=200 URLs · bulk=2000 · mega=20000 */
  packageType: MigrationPackageType
  /** URL 列表(custom_urls 模式必填;其他模式由 source 平台账号导出) */
  urls?: string[]
  /** Imgur/SM.MS access token(用于拉取私人账号资源) */
  credentials?: Record<string, unknown>
  /** 原 URL → 新 URL 30 天 302 重定向,默认 true */
  redirectEnabled?: boolean
}

/** POST /v1/migration/jobs/apple-photos-export 入参 */
export interface CreateApplePhotosJobInput {
  /** zip 字节数(1 ~ 50 GB),用于配额预检 + 选包 */
  zipSizeBytes: number
  /** 套餐包:light=500MB/$9.99 · bulk=5GB/$29.99 · mega=50GB/$99.99 */
  packageType: MigrationPackageType
  /** zip 文件名(1~200 字符) */
  filename: string
  /** 是否启用 30 天 URL 重定向,默认 true */
  redirectEnabled?: boolean
}

/** POST /v1/migration/jobs/apple-photos-export 结果(201:job + TUS session 已创建) */
export interface ApplePhotosJobCreated {
  /** 迁入任务 ID */
  jobId: string
  /** zip 上传记录 ID */
  zipUploadId?: string
  /** TUS 1.0 断点续传地址(经 client.uploads 走 TUS 协议分片上传 zip) */
  tusUploadUrl: string
  /** TUS session 过期时间(24h,ISO 8601) */
  expiresAt: string
}

/** Apple Photos zip 上传状态流转 */
export type ApplePhotosZipStatus =
  | 'awaiting_upload'
  | 'uploading'
  | 'uploaded'
  | 'parsing'
  | 'completed'
  | 'failed'

/** 单卷 zip 上传状态(v0.60.4:zip > 4 GB 时为多卷) */
export interface ApplePhotosZipUpload {
  /** zip 上传记录 ID */
  id: string
  /** 卷序号(多卷场景 1-N,单卷为 1) */
  volumeIndex: number
  /** 上传状态 */
  status: ApplePhotosZipStatus
  /** 该卷字节数 */
  sizeBytes: number
  /** 已接收字节数 */
  bytesReceived: number
  /** 该卷 TUS 上传地址;null 表示已完成或不可用 */
  tusUploadUrl?: string | null
  /** TUS session 过期时间(ISO 8601) */
  expiresAt: string
}

/** GET /v1/migration/jobs/apple-photos-export/{jobId} 结果(job + zipUpload 聚合视图) */
export interface ApplePhotosJobStatus {
  /** 迁入任务本体 */
  job: MigrationJob
  /** 各卷 zip 上传状态(单卷场景数组长度为 1) */
  zipUploads: ApplePhotosZipUpload[]
  /** 解析进度(解析阶段以后才有 totalAssets) */
  progress?: {
    /** 资产总数;null 表示尚未解析 */
    totalAssets?: number | null
    /** 已入库资产数 */
    ingestedAssets?: number
    /** 失败资产数 */
    failedAssets?: number
  }
}

/** POST /v1/migration/jobs/apple-photos-export/{jobId}/finalize 结果(202:进入解析) */
export interface ApplePhotosFinalizeResult {
  /** 迁入任务 ID */
  jobId: string
  /** 任务状态(固定 'parsing') */
  status: 'parsing'
}

// ────────────────────────── backup ──────────────────────────

/** 备份目标类型 */
export type BackupTarget = 'email' | 'webdav' | 'gdrive' | 'aliyundrive' | 's3'

/** 周期备份频率 */
export type BackupSchedule = 'weekly' | 'monthly'

/** 备份周期订阅(v0.55) */
export interface BackupSubscription {
  /** 订阅 ID(nanoid 21 字符) */
  id: string
  /** 所属用户 ID */
  ownerId: string
  /** 备份目标类型 */
  targetType: BackupTarget
  /** 备份频率 */
  schedule: BackupSchedule
  /** 订阅状态 */
  status: 'active' | 'paused' | 'failed'
  /** 最近一次执行时间(ISO 8601);null 表示从未执行 */
  lastRunAt?: string | null
  /** 下次执行时间(ISO 8601);null 表示未排期 */
  nextRunAt?: string | null
  /** 付款状态(Creem 订阅) */
  paymentStatus?: 'active' | 'past_due'
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/** POST /v1/backup/subscriptions 入参($0.99/月,创建后进入 Creem checkout 流程) */
export interface CreateBackupSubscriptionInput {
  /** 备份目标类型 */
  target: BackupTarget
  /** 备份频率 */
  frequency: BackupSchedule
  /**
   * 目标特定配置:email 收件地址 / WebDAV URL+credentials / GDrive OAuth token /
   * aliyundrive refresh_token / s3 endpoint+access_key+secret+bucket。
   */
  credentials: Record<string, unknown>
  /** 是否含已归档资源,默认 false */
  includeArchive?: boolean
}

/** POST /v1/backup/subscriptions 结果(subscription 状态 pending 直至支付完成) */
export interface CreatedBackupSubscription extends BackupSubscription {
  /** Creem checkout URL(用户跳转付款,经 webhook 异步激活订阅) */
  checkoutUrl?: string
}

/** 备份任务状态 */
export type BackupJobStatus = 'pending' | 'packing' | 'uploading' | 'completed' | 'failed'

/** 备份任务实例(v0.55;onetime 与 subscription 触发共用) */
export interface BackupJob {
  /** 任务 ID(nanoid 21 字符) */
  id: string
  /** 所属用户 ID */
  ownerId: string
  /** 触发来源订阅 ID;null 表示一次性任务 */
  subscriptionId?: string | null
  /** 备份目标类型 */
  targetType: string
  /** 打包总字节数 */
  totalBytes?: number
  /** 分卷数(v0.60.4 多卷支持) */
  partsCount?: number
  /** 任务状态 */
  status: BackupJobStatus
  /** 产物 zip 下载地址列表(多卷时为多个) */
  zipUrls?: string[]
  /** 投递状态;null 表示未投递 */
  deliveryStatus?: string | null
  /** 失败原因;null 表示未失败 */
  failureReason?: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 完成时间(ISO 8601);null 表示未完成 */
  completedAt?: string | null
}

/** POST /v1/backup/jobs/onetime 入参($9.99 一次性全量打包导出) */
export interface CreateOnetimeBackupInput {
  /** 备份目标类型 */
  target: BackupTarget
  /** 目标特定配置(同订阅 credentials) */
  credentials: Record<string, unknown>
  /** 是否在 manifest 中包含 URL 重定向映射,默认 true */
  rewriteUrls?: boolean
  /**
   * 可选:仅导出该知识库的文档(zip 内保留 relativePath,含 .claude/.moraya 点目录);
   * 缺省导出全部资产。nanoid 21 字符。
   */
  kbId?: string
}

/** POST /v1/backup/jobs/onetime 结果(202 异步;轮询 jobs.get 直到 completed) */
export interface OnetimeBackupAccepted extends BackupJob {
  /** Creem checkout URL(用户跳转付款后任务才开始打包) */
  checkoutUrl?: string
}

/** GET /v1/backup/jobs 查询选项(按 created_at DESC 游标分页) */
export interface BackupJobListParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 每页数量(1~100,默认 20) */
  limit?: number
}
