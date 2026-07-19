/**
 * 游标分页归一化 + 自动翻页迭代器(v0.3.0)。
 *
 * Picora API 的游标分页字段统一为 nextCursor(base64 编码的 {createdAt,id}),
 * 但**数组键名因资源而异**(历史演进导致):items(多数)/ images / notifications /
 * tickets 等;hasMore 亦仅部分端点返回。SDK 对消费者统一暴露
 * PaginatedResponse{ items, nextCursor, hasMore },归一化在本模块一处完成。
 */

import type { PaginatedResponse } from '../types/index.js'

/**
 * 将服务端分页响应(data 已拆封)归一为统一形态。
 *
 * @param raw       服务端 data 对象(如 { images: [...], nextCursor } 或 { items, nextCursor, hasMore })
 * @param arrayKey  该资源实际使用的数组键名(各 resource 按契约实测填写,如 'images')
 * @returns         统一的 { items, nextCursor, hasMore };hasMore 缺失时以 nextCursor !== null 推导
 */
export function normalizePage<TItem>(raw: unknown, arrayKey: string): PaginatedResponse<TItem> {
  const obj = (raw ?? {}) as Record<string, unknown>
  const arr = obj[arrayKey]
  const items = Array.isArray(arr) ? (arr as TItem[]) : []
  const nextCursor = typeof obj['nextCursor'] === 'string' ? obj['nextCursor'] : null
  const hasMore = typeof obj['hasMore'] === 'boolean' ? obj['hasMore'] : nextCursor !== null
  return { items, nextCursor, hasMore }
}

/**
 * 自动翻页迭代器:包装任意 list 方法,逐条产出全部分页结果。
 *
 * 说明:
 *   - params 以单一 options 对象透传(含未来扩展字段,如 KB 的按后缀过滤),不丢失调用方参数
 *   - 终止条件:nextCursor 为 null 或本页为空
 *   - 消费者可随时 break,不会多发请求(惰性拉取)
 *
 * @example
 *   for await (const img of paginateAll((p) => picora.images.list(p), { pageSize: 100 })) {
 *     console.log(img.id)
 *   }
 */
export async function* paginateAll<TItem, TParams extends { cursor?: string }>(
  list: (params: TParams) => Promise<PaginatedResponse<TItem>>,
  params: TParams,
): AsyncGenerator<TItem, void, undefined> {
  let cursor: string | undefined = params.cursor
  for (;;) {
    const page = await list({ ...params, ...(cursor !== undefined ? { cursor } : {}) })
    for (const item of page.items) yield item
    if (page.nextCursor === null || page.items.length === 0) return
    cursor = page.nextCursor
  }
}
