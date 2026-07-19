/**
 * migration 命名空间(v0.3.0 平台域批次,v0.49/v0.58 一键迁入)—— 通用迁入任务 +
 * Apple Photos zip 导出迁入子命名空间。
 *
 * 均为异步任务:创建返回 202/201 后由后台队列处理,客户端轮询进度。
 * 任务创建类 POST 关闭 429/5xx 自动重试(防重复建任务)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  ApplePhotosFinalizeResult,
  ApplePhotosJobCreated,
  ApplePhotosJobStatus,
  CreateApplePhotosJobInput,
  CreateMigrationJobInput,
  MigrationJob,
} from '../types/index.js'

export interface MigrationNamespace {
  /**
   * 创建迁入任务(202 异步):从 Imgur/SM.MS/Bunpic 或自定义 URL 列表一键迁入,
   * 后台 Workers 队列抓取,轮询 getJob() 直到 status='completed'。
   * 非幂等任务创建,SDK 关闭 429/5xx 自动重试(防重复建任务)。
   */
  createJob(input: CreateMigrationJobInput): Promise<MigrationJob>
  /** 查询迁入任务进度(status + 已抓取/总数/失败/重复跳过计数)。 */
  getJob(jobId: string): Promise<MigrationJob>
  /**
   * 取消迁入任务。已抓取的图片保留并计入配额;待抓取的 URL 标记 canceled。
   * 已 completed/failed 的任务无法取消。
   */
  cancelJob(jobId: string): Promise<MigrationJob>
  /** Apple Photos 导出 zip 迁入子命名空间(v0.58;TUS 分片上传 zip → finalize 解析)。 */
  readonly applePhotos: {
    /**
     * 创建 Apple Photos 迁入任务(201):返回 TUS session,客户端拿 tusUploadUrl
     * 走 TUS 1.0 协议分片上传 zip(可用 client.uploads),全部上传完成后调 finalize()
     * 触发解析。zip > 4 GB 时为多卷上传(见 status() 的 zipUploads)。
     * 非幂等任务创建,SDK 关闭 429/5xx 自动重试(防重复建任务)。
     */
    start(input: CreateApplePhotosJobInput): Promise<ApplePhotosJobCreated>
    /**
     * 查询 Apple Photos 迁入进度(job + 各卷 zip 上传状态聚合视图)。
     * zipUpload.status 流转:awaiting_upload → uploading → uploaded → parsing →
     * completed/failed。
     */
    status(jobId: string): Promise<ApplePhotosJobStatus>
    /**
     * 触发 zip 解析(202 异步):所有卷 TUS 上传完成后调用,服务端流式解析入库;
     * 之后轮询 status() 观察 progress 直到 job.status='completed'。
     * 多卷必须等全部 volumes 均 uploaded 才可 finalize。
     */
    finalize(jobId: string): Promise<ApplePhotosFinalizeResult>
  }
}

export function createMigrationNamespace(http: HttpCore): MigrationNamespace {
  return {
    createJob: (input) =>
      http.request<MigrationJob>({
        method: 'POST',
        path: '/v1/migration/jobs',
        body: {
          source: input.source,
          packageType: input.packageType,
          ...(input.urls !== undefined ? { urls: input.urls } : {}),
          ...(input.credentials !== undefined ? { credentials: input.credentials } : {}),
          ...(input.redirectEnabled !== undefined
            ? { redirectEnabled: input.redirectEnabled }
            : {}),
        },
        retry: false,
      }),
    getJob: (jobId) =>
      http.request<MigrationJob>({
        method: 'GET',
        path: `/v1/migration/jobs/${encodeURIComponent(jobId)}`,
      }),
    cancelJob: (jobId) =>
      http.request<MigrationJob>({
        method: 'POST',
        path: `/v1/migration/jobs/${encodeURIComponent(jobId)}/cancel`,
      }),
    applePhotos: {
      start: (input) =>
        http.request<ApplePhotosJobCreated>({
          method: 'POST',
          path: '/v1/migration/jobs/apple-photos-export',
          body: {
            zipSizeBytes: input.zipSizeBytes,
            packageType: input.packageType,
            filename: input.filename,
            ...(input.redirectEnabled !== undefined
              ? { redirectEnabled: input.redirectEnabled }
              : {}),
          },
          retry: false,
        }),
      status: (jobId) =>
        http.request<ApplePhotosJobStatus>({
          method: 'GET',
          path: `/v1/migration/jobs/apple-photos-export/${encodeURIComponent(jobId)}`,
        }),
      finalize: (jobId) =>
        http.request<ApplePhotosFinalizeResult>({
          method: 'POST',
          path: `/v1/migration/jobs/apple-photos-export/${encodeURIComponent(jobId)}/finalize`,
        }),
    },
  }
}

export const MIGRATION_COVERAGE = [
  { method: 'POST', path: '/v1/migration/jobs', client: 'migration.createJob' },
  { method: 'GET', path: '/v1/migration/jobs/{id}', client: 'migration.getJob' },
  { method: 'POST', path: '/v1/migration/jobs/{id}/cancel', client: 'migration.cancelJob' },
  {
    method: 'POST',
    path: '/v1/migration/jobs/apple-photos-export',
    client: 'migration.applePhotos.start',
  },
  {
    method: 'GET',
    path: '/v1/migration/jobs/apple-photos-export/{jobId}',
    client: 'migration.applePhotos.status',
  },
  {
    method: 'POST',
    path: '/v1/migration/jobs/apple-photos-export/{jobId}/finalize',
    client: 'migration.applePhotos.finalize',
  },
] as const satisfies readonly CoveredOperation[]
