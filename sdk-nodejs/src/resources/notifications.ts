/**
 * notifications 命名空间(v0.3.0 平台域批次,v0.66.0 站内信)—— 列表 / 未读计数 /
 * 批量已读 / 全部已读。
 *
 * 分页注意:列表数组键名为 `notifications`(非 items),SDK 经 normalizePage
 * 归一为统一的 PaginatedResponse.items。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { normalizePage } from '../core/pagination.js'
import type {
  MarkNotificationsReadInput,
  MarkReadResult,
  NotificationItem,
  NotificationListParams,
  PaginatedResponse,
  UnreadCountResult,
} from '../types/index.js'

export interface NotificationsNamespace {
  /**
   * 游标分页列出当前用户的站内信(按 created_at DESC + id DESC,每页 20 条)。
   * 促销活动中奖通知是首个消息来源,系统公告复用同一接口。
   */
  list(params?: NotificationListParams): Promise<PaginatedResponse<NotificationItem>>
  /** 获取未读站内信数量(顶部铃铛红点用,建议轮询间隔 60s)。 */
  unreadCount(): Promise<UnreadCountResult>
  /** 批量标记站内信为已读(1~100 条/次;他人消息 ID 被静默忽略)。 */
  markRead(input: MarkNotificationsReadInput): Promise<MarkReadResult>
  /** 将当前用户的全部未读站内信标记为已读,返回实际被标记的条数。 */
  markAllRead(): Promise<MarkReadResult>
}

export function createNotificationsNamespace(http: HttpCore): NotificationsNamespace {
  return {
    list: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/notifications', query })
      // 服务端数组键名是 notifications(非 items),归一为统一分页形态
      return normalizePage<NotificationItem>(raw, 'notifications')
    },
    unreadCount: () =>
      http.request<UnreadCountResult>({ method: 'GET', path: '/v1/notifications/unread-count' }),
    markRead: (input) =>
      http.request<MarkReadResult>({
        method: 'POST',
        path: '/v1/notifications/read',
        body: { ids: input.ids },
      }),
    markAllRead: () =>
      http.request<MarkReadResult>({ method: 'POST', path: '/v1/notifications/read-all' }),
  }
}

export const NOTIFICATIONS_COVERAGE = [
  { method: 'GET', path: '/v1/notifications', client: 'notifications.list' },
  { method: 'GET', path: '/v1/notifications/unread-count', client: 'notifications.unreadCount' },
  { method: 'POST', path: '/v1/notifications/read', client: 'notifications.markRead' },
  { method: 'POST', path: '/v1/notifications/read-all', client: 'notifications.markAllRead' },
] as const satisfies readonly CoveredOperation[]
