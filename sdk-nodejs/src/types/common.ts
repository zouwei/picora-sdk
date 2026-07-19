/**
 * 通用基础类型(套餐 / scope / 分页 / 限流)。
 *
 * 设计:SDK 不直接 import @picora/shared(保持独立分发,免内部包污染消费者),
 * 手写与服务端字段名对齐的门面类型;字段一致性由 spec/openapi-public.json +
 * openapi-coverage 门禁间接保障。
 */

/** 用户套餐档位(与服务端 PLAN_LIMITS 键一致) */
export type Plan = 'none' | 'trial' | 'pro' | 'pro_plus'

/** API Key v2 细粒度 scope(dot-notation,与 OAuth scope 同形) */
export type KeyScopeV2 =
  | 'media.read'
  | 'media.write'
  | 'media.delete'
  | 'kb.read'
  | 'kb.write'
  | 'account.read'
  | 'usage.read'
  // v0.61.0
  | 'collection.read'
  | 'collection.write'
  | 'collection.delete'
  | 'episode.write'

/**
 * 统一分页返回形态。
 *
 * 服务端各资源的数组键名不一(items / images / notifications / tickets 等),
 * SDK 经 core/pagination.ts 的 normalizePage 归一为本形态;
 * hasMore 服务端缺失时以 nextCursor !== null 推导。
 */
export interface PaginatedResponse<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

/** RateLimit-* 头解析结果 */
export interface RateLimitInfo {
  /** 当前窗口的总配额 */
  limit: number
  /** 剩余配额 */
  remaining: number
  /** 重置时间(Unix 秒);若服务端给的是相对秒数,已加上 Date.now() */
  resetAt: number
}
