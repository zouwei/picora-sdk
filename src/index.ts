/**
 * `@picora/sdk` 主入口。
 *
 * 设计文档：link-anchor/iterations/v0.31.0-public-openapi-developer-portal.md §4.7。
 *
 * v0.1.0 范围：fluent client + 错误类层级 + 高频类型导出。
 * v0.2.0 计划：OpenAPI codegen 自动产生完整 paths/components 类型。
 *
 * @example
 *   import { createPicoraClient } from '@picora/sdk'
 *
 *   const picora = createPicoraClient({ apiKey: process.env.PICORA_API_KEY })
 *   const me = await picora.auth.me()
 *   const images = await picora.images.list({ pageSize: 20 })
 */

export { createPicoraClient } from './client'
export type { PicoraClient, PicoraClientOptions } from './client'

export { PicoraApiError, PicoraNetworkError, PicoraRateLimitError, isRetryable } from './errors'

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
} from './types'
