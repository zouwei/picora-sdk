/**
 * publish 命名空间(v0.3.0 平台域批次,v0.54 多平台一键发布)—— platforms(平台绑定)
 * 与 jobs(发布任务)两个子命名空间。
 *
 * 发布为 202 异步任务:并发向 1-5 个已绑定平台发布,每平台独立子任务,
 * 部分失败 status='partial',全失败 'failed'。任务创建关闭 429/5xx 自动重试。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  ConnectPlatformInput,
  CreatePublishJobInput,
  PublishJob,
  PublishPlatformBinding,
  PublishPlatformKey,
} from '../types/index.js'

export interface PublishNamespace {
  /** 发布平台绑定子命名空间(wechat/medium=OAuth · xiaohongshu/juejin/substack=AccessKey)。 */
  readonly platforms: {
    /** 列出当前用户已绑定的所有发布平台及授权状态。 */
    list(): Promise<PublishPlatformBinding[]>
    /** 绑定平台(201):OAuth/AccessKey 授权完成后回调,持久化平台凭据。 */
    connect(input: ConnectPlatformInput): Promise<PublishPlatformBinding>
    /** 解绑平台:撤销授权 + 删除本地 token。已发布的内容不删除,但后续无法操作。 */
    disconnect(platform: PublishPlatformKey): Promise<void>
  }
  /** 发布任务子命名空间。 */
  readonly jobs: {
    /**
     * 创建多平台发布任务(202 异步):并发向 1-5 个已绑定平台发布,
     * 每平台独立子任务互不影响;轮询 get() 直到 status 为 completed/partial/failed。
     * 非幂等任务创建,SDK 关闭 429/5xx 自动重试(防重复发布)。
     */
    create(input: CreatePublishJobInput): Promise<PublishJob>
    /** 查询发布任务状态(总状态 + 每平台子任务详情:成功 URL 或失败原因)。 */
    get(jobId: string): Promise<PublishJob>
  }
}

export function createPublishNamespace(http: HttpCore): PublishNamespace {
  return {
    platforms: {
      list: () =>
        http.request<PublishPlatformBinding[]>({ method: 'GET', path: '/v1/publish/platforms' }),
      connect: (input) =>
        http.request<PublishPlatformBinding>({
          method: 'POST',
          path: '/v1/publish/platforms',
          body: { platform: input.platform, credentials: input.credentials },
        }),
      disconnect: async (platform) => {
        await http.request<void>({
          method: 'DELETE',
          path: `/v1/publish/platforms/${encodeURIComponent(platform)}`,
          response: 'none',
        })
      },
    },
    jobs: {
      create: (input) =>
        http.request<PublishJob>({
          method: 'POST',
          path: '/v1/publish/jobs',
          body: {
            pageId: input.pageId,
            platforms: input.platforms,
            ...(input.overrides !== undefined ? { overrides: input.overrides } : {}),
          },
          retry: false,
        }),
      get: (jobId) =>
        http.request<PublishJob>({
          method: 'GET',
          path: `/v1/publish/jobs/${encodeURIComponent(jobId)}`,
        }),
    },
  }
}

export const PUBLISH_COVERAGE = [
  { method: 'GET', path: '/v1/publish/platforms', client: 'publish.platforms.list' },
  { method: 'POST', path: '/v1/publish/platforms', client: 'publish.platforms.connect' },
  {
    method: 'DELETE',
    path: '/v1/publish/platforms/{platform}',
    client: 'publish.platforms.disconnect',
  },
  { method: 'POST', path: '/v1/publish/jobs', client: 'publish.jobs.create' },
  { method: 'GET', path: '/v1/publish/jobs/{id}', client: 'publish.jobs.get' },
] as const satisfies readonly CoveredOperation[]
