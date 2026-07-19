/**
 * backup 命名空间(v0.3.0 平台域批次,v0.55 备份导出)—— subscriptions(周期订阅)
 * 与 jobs(备份任务)两个子命名空间。
 *
 * 付费经 Creem checkout(返回 checkoutUrl 跳转付款,webhook 异步激活/开始打包)。
 * 订阅创建与一次性任务创建关闭 429/5xx 自动重试(防重复下单/重复建任务)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { normalizePage } from '../core/pagination.js'
import type {
  BackupJob,
  BackupJobListParams,
  BackupSubscription,
  CreateBackupSubscriptionInput,
  CreateOnetimeBackupInput,
  CreatedBackupSubscription,
  OnetimeBackupAccepted,
  PaginatedResponse,
} from '../types/index.js'

export interface BackupNamespace {
  /** 备份周期订阅子命名空间($0.99/月,weekly / monthly 到 5 类目标之一)。 */
  readonly subscriptions: {
    /** 列出当前用户的所有备份订阅(active / paused / failed 均返回)。 */
    list(): Promise<BackupSubscription[]>
    /**
     * 创建周期备份订阅(201):返回订阅 + Creem checkoutUrl,用户跳转付款后
     * 经 webhook 异步激活(付款前订阅状态为 pending)。
     * 非幂等支付发起,SDK 关闭 429/5xx 自动重试(防重复下单)。
     */
    create(input: CreateBackupSubscriptionInput): Promise<CreatedBackupSubscription>
    /**
     * 取消订阅(204):立即停止后续周期备份;已生成的备份文件保留在用户目标存储上;
     * Creem subscription 同步取消(无退款)。
     */
    delete(subscriptionId: string): Promise<void>
  }
  /** 备份任务子命名空间(onetime 一次性 + subscription 周期触发的历史)。 */
  readonly jobs: {
    /**
     * 创建一次性全量打包导出任务(202 异步;$9.99):返回 job + Creem checkoutUrl,
     * 付款后开始打包;轮询 get() 直到 status='completed'(产物在 zipUrls)。
     * 非幂等支付发起 + 任务创建,SDK 关闭 429/5xx 自动重试。
     */
    createOnetime(input: CreateOnetimeBackupInput): Promise<OnetimeBackupAccepted>
    /** 查询备份任务状态(进度 + 多卷分片信息 + 产物下载地址)。 */
    get(jobId: string): Promise<BackupJob>
    /** 游标分页列出历史备份任务(onetime + subscription 触发,按 created_at DESC)。 */
    list(params?: BackupJobListParams): Promise<PaginatedResponse<BackupJob>>
  }
}

export function createBackupNamespace(http: HttpCore): BackupNamespace {
  return {
    subscriptions: {
      list: () =>
        http.request<BackupSubscription[]>({ method: 'GET', path: '/v1/backup/subscriptions' }),
      create: (input) =>
        http.request<CreatedBackupSubscription>({
          method: 'POST',
          path: '/v1/backup/subscriptions',
          body: {
            target: input.target,
            frequency: input.frequency,
            credentials: input.credentials,
            ...(input.includeArchive !== undefined
              ? { includeArchive: input.includeArchive }
              : {}),
          },
          retry: false,
        }),
      delete: async (subscriptionId) => {
        await http.request<void>({
          method: 'DELETE',
          path: `/v1/backup/subscriptions/${encodeURIComponent(subscriptionId)}`,
          response: 'none',
        })
      },
    },
    jobs: {
      createOnetime: (input) =>
        http.request<OnetimeBackupAccepted>({
          method: 'POST',
          path: '/v1/backup/jobs/onetime',
          body: {
            target: input.target,
            credentials: input.credentials,
            ...(input.rewriteUrls !== undefined ? { rewriteUrls: input.rewriteUrls } : {}),
            ...(input.kbId !== undefined ? { kbId: input.kbId } : {}),
          },
          retry: false,
        }),
      get: (jobId) =>
        http.request<BackupJob>({
          method: 'GET',
          path: `/v1/backup/jobs/${encodeURIComponent(jobId)}`,
        }),
      list: async (params) => {
        const query: Record<string, string | number | boolean | undefined> = {}
        if (params?.cursor !== undefined) query['cursor'] = params.cursor
        if (params?.limit !== undefined) query['limit'] = params.limit
        const raw = await http.request<unknown>({ method: 'GET', path: '/v1/backup/jobs', query })
        return normalizePage<BackupJob>(raw, 'items')
      },
    },
  }
}

export const BACKUP_COVERAGE = [
  { method: 'GET', path: '/v1/backup/subscriptions', client: 'backup.subscriptions.list' },
  { method: 'POST', path: '/v1/backup/subscriptions', client: 'backup.subscriptions.create' },
  { method: 'DELETE', path: '/v1/backup/subscriptions/{id}', client: 'backup.subscriptions.delete' },
  { method: 'POST', path: '/v1/backup/jobs/onetime', client: 'backup.jobs.createOnetime' },
  { method: 'GET', path: '/v1/backup/jobs/{id}', client: 'backup.jobs.get' },
  { method: 'GET', path: '/v1/backup/jobs', client: 'backup.jobs.list' },
] as const satisfies readonly CoveredOperation[]
