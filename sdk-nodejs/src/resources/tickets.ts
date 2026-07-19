/**
 * tickets 命名空间(v0.3.0 平台域批次)—— 客服工单:创建 / 列表 / 详情 / 回复 /
 * 未读计数。
 *
 * 分页注意:列表数组键名为 `tickets`(非 items),SDK 经 normalizePage 归一。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { normalizePage } from '../core/pagination.js'
import type {
  CreateTicketInput,
  PaginatedResponse,
  ReplyTicketInput,
  Ticket,
  TicketDetail,
  TicketListParams,
  TicketMessage,
  UnreadCountResult,
} from '../types/index.js'

export interface TicketsNamespace {
  /** 创建工单并提交首条消息(默认状态 open,优先级 normal)。 */
  create(input: CreateTicketInput): Promise<Ticket>
  /** 游标分页列出当前用户的工单(按最近更新时间倒序;可选 status 过滤)。 */
  list(params?: TicketListParams): Promise<PaginatedResponse<Ticket>>
  /** 获取工单详情及全部消息列表(按时间升序);打开详情自动清除用户侧未读标记。 */
  get(ticketId: string): Promise<TicketDetail>
  /**
   * 向指定工单追加一条用户回复消息(Markdown)。
   * closed 状态的工单不可回复(403);仅限工单所有者调用。
   */
  reply(ticketId: string, input: ReplyTicketInput): Promise<TicketMessage>
  /** 获取有管理员新回复但用户未读的工单数量(侧边栏红点用,建议轮询间隔 60s)。 */
  unreadCount(): Promise<UnreadCountResult>
}

export function createTicketsNamespace(http: HttpCore): TicketsNamespace {
  return {
    create: (input) =>
      http.request<Ticket>({
        method: 'POST',
        path: '/v1/tickets',
        body: { title: input.title, category: input.category, content: input.content },
      }),
    list: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.status !== undefined) query['status'] = params.status
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/tickets', query })
      // 服务端数组键名是 tickets(非 items),归一为统一分页形态
      return normalizePage<Ticket>(raw, 'tickets')
    },
    get: (ticketId) =>
      http.request<TicketDetail>({
        method: 'GET',
        path: `/v1/tickets/${encodeURIComponent(ticketId)}`,
      }),
    reply: (ticketId, input) =>
      http.request<TicketMessage>({
        method: 'POST',
        path: `/v1/tickets/${encodeURIComponent(ticketId)}/messages`,
        body: { content: input.content },
      }),
    unreadCount: () =>
      http.request<UnreadCountResult>({ method: 'GET', path: '/v1/tickets/unread-count' }),
  }
}

export const TICKETS_COVERAGE = [
  { method: 'POST', path: '/v1/tickets', client: 'tickets.create' },
  { method: 'GET', path: '/v1/tickets', client: 'tickets.list' },
  { method: 'GET', path: '/v1/tickets/{ticketId}', client: 'tickets.get' },
  { method: 'POST', path: '/v1/tickets/{ticketId}/messages', client: 'tickets.reply' },
  { method: 'GET', path: '/v1/tickets/unread-count', client: 'tickets.unreadCount' },
] as const satisfies readonly CoveredOperation[]
