/**
 * `@picora/sdk` 主入口。
 *
 * 设计文档：
 *   - v0.1.0：picora-assets/iterations/v0.31.0-public-openapi-developer-portal.md §4.7
 *   - v0.2.0：picora-assets/iterations/v0.61.0-service-collections.md PR4-A
 *
 * v0.1.0 范围：fluent client + 错误类层级 + 高频类型（auth / images / apps）。
 * v0.2.0 新增：collections / collectionTypes / episodes 命名空间（含 episode.sync 第三方接入主入口）。
 *
 * @example
 *   import { createPicoraClient } from '@picora/sdk'
 *
 *   const picora = createPicoraClient({ apiKey: process.env.PICORA_API_KEY })
 *   const me = await picora.auth.me()
 *
 *   // v0.2.0：合集 + 剧集 + 资产同步主流程
 *   const collection = await picora.collections.create({
 *     name: '我的剧集',
 *     collectionType: 'tv_series',
 *     allowedResourceTypes: ['video', 'audio', 'doc'],
 *   })
 *   const ep = await picora.episodes.create(collection.id, { sequenceNo: 1, title: 'EP01' })
 *   const result = await picora.episodes.sync(collection.id, ep.id, {
 *     idempotencyKey: 'ai-batch-001',
 *     assets: [
 *       { resourceType: 'video', resourceId: 'vid_xxx' },
 *       { resourceType: 'doc', resourceId: 'doc_yyy' },
 *     ],
 *   })
 *   console.log(`Applied ${result.appliedCount}/${result.totalCount} assets`)
 */

export { createPicoraClient } from './client'
export type { PicoraClient, PicoraClientOptions } from './client'

export { PicoraApiError, PicoraNetworkError, PicoraRateLimitError, isRetryable } from './errors'

// v0.61.10 PR4-B-α：Device Flow helper（CLI / 桌面 / 嵌入式接入用）
// v0.65 PR-J：Node 端文件持久化通过子路径 `@picora/sdk/node` 导出 `FileTokenStorage`
//             —— 主入口保持 zero-fs，浏览器 / CF Workers 等环境无需打包 node:fs。
export { startDeviceFlow, MemoryTokenStorage } from './device-flow'
export type {
  DeviceFlowStartOptions,
  DeviceFlowSession,
  DeviceFlowToken,
  TokenStorage,
} from './device-flow'

export type {
  Plan,
  KeyScopeV2,
  User,
  Subscription,
  AuthorizedApp,
  Image,
  ImageListParams,
  PaginatedResponse,
  RateLimitInfo,
  // v0.61.0 Collections
  Collection,
  CollectionType,
  CollectionResourceType,
  CollectionListParams,
  CreateCollectionInput,
  UpdateCollectionInput,
  CollectionType_Item,
  CreateCollectionTypeInput,
  // v0.61.1 Episodes
  Episode,
  EpisodeStatus,
  EpisodeListParams,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  // v0.61.2 episode.sync
  EpisodeSyncAssetRef,
  EpisodeSyncInput,
  EpisodeSyncApplied,
  EpisodeSyncResult,
} from './types'
