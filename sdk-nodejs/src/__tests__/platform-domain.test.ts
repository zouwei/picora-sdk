/**
 * v0.3.0 平台域批次(第 5 批,台账清零)—— billing / campaigns / notifications /
 * tickets / orgs / insights / migration / backup / publish / publishedPages / mcp 测试。
 *
 * 专项:
 *   - notifications / tickets 列表的非常规数组键名(notifications / tickets)归一为 items
 *   - POST /v1/activate 与 POST /v1/coupons/validate 的非常规路径(不在各自资源前缀下)
 *   - publishedPages.publicPage 的 text/html 纯文本模式
 *   - billing.checkout 的 retry:false(5xx 不自动重试,防重复下单)
 */
import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client.js'
import { PicoraApiError } from '../errors.js'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock as unknown as typeof fetch })
}

const ORG_ID = 'Og1StGXR8_Z5jdHi6B-my'
const USER_ID = 'V1StGXR8_Z5jdHi6B-myT'
const TICKET_ID = 'Tk1StGXR8_Z5jdHi6B-my'
const JOB_ID = 'Jb1StGXR8_Z5jdHi6B-my'
const PAGE_ID = 'Pg1StGXR8_Z5jdHi6B-my'
const CAMPAIGN_ID = 'Cp1StGXR8_Z5jdHi6B-my'

// ────────────────────────── billing ──────────────────────────

describe('@picora/sdk 平台域 — billing namespace', () => {
  it('B1: plans 走 GET /v1/billing/plans(公开端点)并拆 data 包装', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          pro: { monthly: 9, yearly: 90, currency: 'USD' },
          pro_plus: { monthly: 45, yearly: 432, currency: 'USD' },
        },
      }),
    )
    const client = makeClient(fetchMock)
    const plans = await client.billing.plans()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/billing/plans')
    expect(init.method).toBe('GET')
    expect(plans.pro.monthly).toBe(9)
    expect(plans.pro_plus.currency).toBe('USD')
  })

  it('B2: checkout 走 POST + {plan,couponCode} body,retry:false 专项 —— 500 不自动重试(恰发 1 次请求)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Internal server error' }, 500),
    )
    const client = makeClient(fetchMock)
    await expect(
      client.billing.checkout({ plan: 'pro', couponCode: 'PROMO-A2B3-C4D5' }),
    ).rejects.toBeInstanceOf(PicoraApiError)
    // 支付发起为非幂等,SDK 关闭 5xx 自动重试:fetch 只调用一次(防重复下单)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/billing/checkout')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ plan: 'pro', couponCode: 'PROMO-A2B3-C4D5' })
  })

  it('B3: activateInviteCode 走非常规路径 POST /v1/activate(非 /v1/billing 前缀)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { plan: 'trial', trialActivated: true } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.billing.activateInviteCode({ code: 'PICORA2026' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const pathname = new URL(String(url)).pathname
    expect(pathname).toBe('/v1/activate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ code: 'PICORA2026' })
    expect(result.trialActivated).toBe(true)
  })

  it('B4: activateCheckout 条件上送 provider 并返回跳转 URL(付款后经 webhook 异步到账)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { checkoutUrl: 'https://checkout.polar.sh/xyz', provider: 'polar' },
      }),
    )
    const client = makeClient(fetchMock)
    const session = await client.billing.activateCheckout({ provider: 'polar' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/billing/activate-checkout')
    expect(JSON.parse(init.body as string)).toEqual({ provider: 'polar' })
    expect(session.checkoutUrl).toBe('https://checkout.polar.sh/xyz')
  })

  it('B5: subscription / orders / history 均为 GET 且 orders 直返数组', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            plan: 'pro',
            status: 'active',
            currentPeriodEnd: '2026-08-19T00:00:00.000Z',
            provider: 'polar',
            cancelAtPeriodEnd: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [
            {
              id: 'ord_1',
              provider: 'polar',
              amountCents: 900,
              currency: 'USD',
              plan: 'pro',
              period: 'monthly',
              status: 'paid',
              createdAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        }),
      )
    const client = makeClient(fetchMock)
    const sub = await client.billing.subscription()
    const orders = await client.billing.orders()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/billing/subscription')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/v1/billing/orders')
    expect(sub.plan).toBe('pro')
    expect(orders).toHaveLength(1)
    expect(orders[0]?.status).toBe('paid')
  })
})

// ────────────────────────── campaigns ──────────────────────────

describe('@picora/sdk 平台域 — campaigns namespace', () => {
  it('C1: active 走 GET /v1/campaigns/active,无活动时 campaign 为 null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { campaign: null } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.campaigns.active()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/campaigns/active')
    expect(init.method).toBe('GET')
    expect(result.campaign).toBeNull()
  })

  it('C2: claim 拼接活动 ID 路径并 POST,返回私有券码', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { code: 'PROMO-A2B3-C4D5', expiresAt: '2026-08-01T00:00:00.000Z' },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.campaigns.claim(CAMPAIGN_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/campaigns/${CAMPAIGN_ID}/claim`)
    expect(init.method).toBe('POST')
    expect(result.code).toBe('PROMO-A2B3-C4D5')
  })

  it('C3: validateCoupon 走非常规路径 POST /v1/coupons/validate(coupons 前缀)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { valid: true, campaignName: '暑期促销', discountType: 'bonus_months', bonusMonths: 2 },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.campaigns.validateCoupon({ code: 'PROMO-A2B3-C4D5' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const pathname = new URL(String(url)).pathname
    expect(pathname).toBe('/v1/coupons/validate')
    expect(JSON.parse(init.body as string)).toEqual({ code: 'PROMO-A2B3-C4D5' })
    expect(result.valid).toBe(true)
    expect(result.bonusMonths).toBe(2)
  })
})

// ────────────────────────── notifications ──────────────────────────

describe('@picora/sdk 平台域 — notifications namespace', () => {
  it('N1: list 分页键名专项 —— 服务端数组键 notifications 归一为 items,cursor 进 query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          notifications: [
            {
              id: 'ntf_1',
              type: 'campaign',
              title: '恭喜中奖',
              body: '你获得了邀请码',
              link: '/activate',
              readAt: null,
              createdAt: '2026-07-03T08:00:00.000Z',
            },
          ],
          nextCursor: 'cur_next',
        },
      }),
    )
    const client = makeClient(fetchMock)
    const page = await client.notifications.list({ cursor: 'cur_prev' })
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/notifications')
    expect(url.searchParams.get('cursor')).toBe('cur_prev')
    // 归一断言:消费者看到的是 items,而非服务端原始键名 notifications
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.type).toBe('campaign')
    expect(page.nextCursor).toBe('cur_next')
    expect(page.hasMore).toBe(true)
  })

  it('N2: markRead 走 POST /v1/notifications/read + {ids} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { updated: 2 } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.notifications.markRead({ ids: ['ntf_1', 'ntf_2'] })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/notifications/read')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['ntf_1', 'ntf_2'] })
    expect(result.updated).toBe(2)
  })

  it('N3: unreadCount 与 markAllRead 走各自端点', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { count: 3 } }))
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { updated: 3 } }))
    const client = makeClient(fetchMock)
    const unread = await client.notifications.unreadCount()
    const marked = await client.notifications.markAllRead()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/notifications/unread-count')
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/v1/notifications/read-all')
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('POST')
    expect(unread.count).toBe(3)
    expect(marked.updated).toBe(3)
  })
})

// ────────────────────────── tickets ──────────────────────────

describe('@picora/sdk 平台域 — tickets namespace', () => {
  it('T1: create 走 POST /v1/tickets + {title,category,content} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: TICKET_ID,
          title: '图片上传后无法访问',
          category: 'bug',
          status: 'open',
          priority: 'normal',
          createdAt: '2026-07-19T00:00:00.000Z',
          updatedAt: '2026-07-19T00:00:00.000Z',
        },
        201,
      ),
    )
    const client = makeClient(fetchMock)
    const ticket = await client.tickets.create({
      title: '图片上传后无法访问',
      category: 'bug',
      content: '打开是 404…',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/tickets')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      title: '图片上传后无法访问',
      category: 'bug',
      content: '打开是 404…',
    })
    expect(ticket.status).toBe('open')
  })

  it('T2: list 分页键名专项 —— 服务端数组键 tickets 归一为 items,status 过滤进 query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          tickets: [
            {
              id: TICKET_ID,
              title: 'billing 问题',
              category: 'billing',
              status: 'open',
              priority: 'normal',
              unreadCount: 1,
              createdAt: '2026-07-19T00:00:00.000Z',
              updatedAt: '2026-07-19T00:00:00.000Z',
            },
          ],
          nextCursor: null,
        },
      }),
    )
    const client = makeClient(fetchMock)
    const page = await client.tickets.list({ status: 'open' })
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/tickets')
    expect(url.searchParams.get('status')).toBe('open')
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.unreadCount).toBe(1)
    expect(page.nextCursor).toBeNull()
    expect(page.hasMore).toBe(false)
  })

  it('T3: reply 拼接工单 ID 路径 POST messages + {content} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          id: 'msg_1',
          ticketId: TICKET_ID,
          role: 'user',
          content: '还是不行',
          createdAt: '2026-07-19T01:00:00.000Z',
        },
        201,
      ),
    )
    const client = makeClient(fetchMock)
    const msg = await client.tickets.reply(TICKET_ID, { content: '还是不行' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/tickets/${TICKET_ID}/messages`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ content: '还是不行' })
    expect(msg.role).toBe('user')
  })

  it('T4: get 与 unreadCount 走各自端点(unread-count 非 {ticketId} 路径)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          ticket: {
            id: TICKET_ID,
            title: 'x',
            category: 'bug',
            status: 'open',
            priority: 'normal',
            createdAt: '2026-07-19T00:00:00.000Z',
            updatedAt: '2026-07-19T00:00:00.000Z',
          },
          messages: [],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { count: 2 } }))
    const client = makeClient(fetchMock)
    const detail = await client.tickets.get(TICKET_ID)
    const unread = await client.tickets.unreadCount()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/tickets/${TICKET_ID}`)
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('/v1/tickets/unread-count')
    expect(detail.ticket.id).toBe(TICKET_ID)
    expect(detail.messages).toEqual([])
    expect(unread.count).toBe(2)
  })
})

// ────────────────────────── orgs ──────────────────────────

describe('@picora/sdk 平台域 — orgs namespace', () => {
  it('O1: list GET /v1/orgs 直返数组(含 myRole)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            id: ORG_ID,
            name: 'Acme Studio',
            slug: 'acme-studio',
            plan: 'org_starter',
            seatCount: 3,
            seatLimit: 5,
            createdAt: '2026-05-29T08:00:00.000Z',
            myRole: 'owner',
          },
        ],
      }),
    )
    const client = makeClient(fetchMock)
    const orgs = await client.orgs.list()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/orgs')
    expect(orgs).toHaveLength(1)
    expect(orgs[0]?.myRole).toBe('owner')
  })

  it('O2: members.updateRole 走 PATCH /v1/orgs/{id}/members/{userId}/role + {role} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          id: 'mem_1',
          orgId: ORG_ID,
          userId: USER_ID,
          role: 'editor',
          invitedAt: '2026-05-29T08:00:00.000Z',
        },
      }),
    )
    const client = makeClient(fetchMock)
    const member = await client.orgs.members.updateRole(ORG_ID, USER_ID, { role: 'editor' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/orgs/${ORG_ID}/members/${USER_ID}/role`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ role: 'editor' })
    expect(member.role).toBe('editor')
  })

  it('O3: members.remove 走 DELETE 两段路径参数并 resolve undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    const result = await client.orgs.members.remove(ORG_ID, USER_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/orgs/${ORG_ID}/members/${USER_ID}`)
    expect(init.method).toBe('DELETE')
    expect(result).toBeUndefined()
  })

  it('O4: invites.accept 走无 {id} 的 POST /v1/orgs/invites/accept + {token} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { orgId: ORG_ID, role: 'editor' } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.orgs.invites.accept({ token: 'inv_tok_xyz' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new URL(String(url)).pathname).toBe('/v1/orgs/invites/accept')
    expect(JSON.parse(init.body as string)).toEqual({ token: 'inv_tok_xyz' })
    expect(result.orgId).toBe(ORG_ID)
  })

  it('O5: subscription.checkout retry:false 专项 —— 500 不自动重试(防重复下单)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Internal server error' }, 500),
    )
    const client = makeClient(fetchMock)
    await expect(
      client.orgs.subscription.checkout(ORG_ID, { productKey: 'teams_starter_yearly', seats: 10 }),
    ).rejects.toBeInstanceOf(PicoraApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/orgs/${ORG_ID}/subscription/checkout`)
    expect(JSON.parse(init.body as string)).toEqual({ productKey: 'teams_starter_yearly', seats: 10 })
  })

  it('O6: auditLogs 返回裸数组(非游标分页),透传 action/limit query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: [
          {
            id: 'log_1',
            userId: USER_ID,
            action: 'member.invited',
            resourceType: 'member',
            resourceId: USER_ID,
            metadata: {},
            createdAt: '2026-05-29T08:00:00.000Z',
          },
        ],
      }),
    )
    const client = makeClient(fetchMock)
    const logs = await client.orgs.auditLogs(ORG_ID, { action: 'member.invited', limit: 20 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/v1/orgs/${ORG_ID}/audit-logs`)
    expect(url).toContain('action=member.invited')
    expect(url).toContain('limit=20')
    expect(logs[0]?.action).toBe('member.invited')
    expect(Array.isArray(logs)).toBe(true)
  })
})

// ────────────────────────── insights ──────────────────────────

describe('@picora/sdk 平台域 — insights namespace', () => {
  it('I1: daily 以 query 上送 from/to/scope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { items: [{ date: '2026-07-01', views: 120, blocked: 3 }] },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.insights.daily({ from: '2026-07-01', to: '2026-07-07', scope: 'images' })
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/insights/daily')
    expect(url.searchParams.get('from')).toBe('2026-07-01')
    expect(url.searchParams.get('to')).toBe('2026-07-07')
    expect(url.searchParams.get('scope')).toBe('images')
    expect(result.items[0]?.views).toBe(120)
  })

  it('I2: rollupDay 走 POST /v1/insights/rollup/day + {date,force} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { date: '2026-07-18', rowsProcessed: 4200, durationMs: 850 },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.insights.rollupDay({ date: '2026-07-18', force: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/insights/rollup/day')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ date: '2026-07-18', force: true })
    expect(result.rowsProcessed).toBe(4200)
  })
})

// ────────────────────────── migration ──────────────────────────

describe('@picora/sdk 平台域 — migration namespace', () => {
  it('M1: createJob 走 POST(202 异步)+ 条件展开 body,retry:false 防重复建任务', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            id: JOB_ID,
            source: 'imgur',
            total: 200,
            status: 'pending',
            createdAt: '2026-07-19T00:00:00.000Z',
          },
        },
        202,
      ),
    )
    const client = makeClient(fetchMock)
    const job = await client.migration.createJob({ source: 'imgur', packageType: 'light' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/migration/jobs')
    expect(init.method).toBe('POST')
    // 未提供的可选字段(urls/credentials/redirectEnabled)不上送
    expect(JSON.parse(init.body as string)).toEqual({ source: 'imgur', packageType: 'light' })
    expect(job.status).toBe('pending')
  })

  it('M2: getJob / cancelJob 拼接任务 ID 路径', async () => {
    const jobBody = {
      success: true,
      data: {
        id: JOB_ID,
        source: 'imgur',
        total: 200,
        status: 'cancelled',
        createdAt: '2026-07-19T00:00:00.000Z',
      },
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(jobBody))
      .mockResolvedValueOnce(jsonResponse(jobBody))
    const client = makeClient(fetchMock)
    await client.migration.getJob(JOB_ID)
    const cancelled = await client.migration.cancelJob(JOB_ID)
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(`/v1/migration/jobs/${JOB_ID}`)
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(
      `/v1/migration/jobs/${JOB_ID}/cancel`,
    )
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('POST')
    expect(cancelled.status).toBe('cancelled')
  })

  it('M3: applePhotos.start / finalize 走 apple-photos-export 子路径', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            data: {
              jobId: JOB_ID,
              tusUploadUrl: 'https://api.picora.me/v1/uploads/sess_xxx',
              expiresAt: '2026-07-20T00:00:00.000Z',
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({ success: true, data: { jobId: JOB_ID, status: 'parsing' } }, 202),
      )
    const client = makeClient(fetchMock)
    const created = await client.migration.applePhotos.start({
      zipSizeBytes: 5368709120,
      packageType: 'bulk',
      filename: 'iPhone照片.zip',
    })
    const finalized = await client.migration.applePhotos.finalize(JOB_ID)
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      '/v1/migration/jobs/apple-photos-export',
    )
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      zipSizeBytes: 5368709120,
      packageType: 'bulk',
      filename: 'iPhone照片.zip',
    })
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(
      `/v1/migration/jobs/apple-photos-export/${JOB_ID}/finalize`,
    )
    expect(created.tusUploadUrl).toContain('/v1/uploads/')
    expect(finalized.status).toBe('parsing')
  })
})

// ────────────────────────── backup ──────────────────────────

describe('@picora/sdk 平台域 — backup namespace', () => {
  it('BK1: subscriptions.create POST body + 返回 checkoutUrl;delete 走 204', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            data: {
              id: 'sub_1',
              ownerId: USER_ID,
              targetType: 's3',
              schedule: 'weekly',
              status: 'active',
              createdAt: '2026-07-19T00:00:00.000Z',
              checkoutUrl: 'https://checkout.creem.io/xyz',
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = makeClient(fetchMock)
    const created = await client.backup.subscriptions.create({
      target: 's3',
      frequency: 'weekly',
      credentials: { endpoint: 'https://s3.example.com', bucket: 'b' },
    })
    await client.backup.subscriptions.delete('sub_1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/backup/subscriptions')
    expect(JSON.parse(init.body as string)).toEqual({
      target: 's3',
      frequency: 'weekly',
      credentials: { endpoint: 'https://s3.example.com', bucket: 'b' },
    })
    expect(created.checkoutUrl).toContain('creem')
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(
      '/v1/backup/subscriptions/sub_1',
    )
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE')
  })

  it('BK2: jobs.createOnetime retry:false 专项(202 异步任务 + 支付,防重复下单)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Internal server error' }, 500),
    )
    const client = makeClient(fetchMock)
    await expect(
      client.backup.jobs.createOnetime({ target: 'email', credentials: { to: 'me@example.com' } }),
    ).rejects.toBeInstanceOf(PicoraApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/v1/backup/jobs/onetime')
  })

  it('BK3: jobs.list 归一 items 分页并透传 cursor/limit', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              id: JOB_ID,
              ownerId: USER_ID,
              targetType: 's3',
              status: 'completed',
              createdAt: '2026-07-19T00:00:00.000Z',
            },
          ],
          nextCursor: null,
        },
      }),
    )
    const client = makeClient(fetchMock)
    const page = await client.backup.jobs.list({ cursor: 'cur_1', limit: 50 })
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/backup/jobs')
    expect(url.searchParams.get('cursor')).toBe('cur_1')
    expect(url.searchParams.get('limit')).toBe('50')
    expect(page.items[0]?.status).toBe('completed')
  })
})

// ────────────────────────── publish ──────────────────────────

describe('@picora/sdk 平台域 — publish namespace', () => {
  it('P1: platforms.connect POST body;disconnect 拼接平台名路径', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            data: {
              id: 'bind_1',
              ownerId: USER_ID,
              platform: 'wechat',
              status: 'active',
              createdAt: '2026-07-19T00:00:00.000Z',
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    const bound = await client.publish.platforms.connect({
      platform: 'wechat',
      credentials: { code: 'oauth_code_x' },
    })
    await client.publish.platforms.disconnect('wechat')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/publish/platforms')
    expect(JSON.parse(init.body as string)).toEqual({
      platform: 'wechat',
      credentials: { code: 'oauth_code_x' },
    })
    expect(bound.status).toBe('active')
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(
      '/v1/publish/platforms/wechat',
    )
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE')
  })

  it('P2: jobs.create POST body(202 异步)+ jobs.get 轮询路径', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            success: true,
            data: {
              id: JOB_ID,
              ownerId: USER_ID,
              docId: 'doc_1',
              platforms: ['wechat', 'medium'],
              status: 'pending',
              createdAt: '2026-07-19T00:00:00.000Z',
            },
          },
          202,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            id: JOB_ID,
            ownerId: USER_ID,
            docId: 'doc_1',
            platforms: ['wechat', 'medium'],
            status: 'partial',
            createdAt: '2026-07-19T00:00:00.000Z',
          },
        }),
      )
    const client = makeClient(fetchMock)
    const job = await client.publish.jobs.create({
      pageId: PAGE_ID,
      platforms: ['wechat', 'medium'],
    })
    const polled = await client.publish.jobs.get(JOB_ID)
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/v1/publish/jobs')
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      pageId: PAGE_ID,
      platforms: ['wechat', 'medium'],
    })
    expect(new URL(String(fetchMock.mock.calls[1]?.[0])).pathname).toBe(`/v1/publish/jobs/${JOB_ID}`)
    expect(job.status).toBe('pending')
    expect(polled.status).toBe('partial')
  })
})

// ────────────────────────── publishedPages ──────────────────────────

describe('@picora/sdk 平台域 — publishedPages namespace', () => {
  it('PP1: create POST 条件展开 body(未提供 description/coverImageId 不上送)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            id: PAGE_ID,
            ownerId: USER_ID,
            docId: 'doc_1',
            slug: 'my-comic',
            title: '我的漫画',
            layout: 'comic',
            status: 'draft',
            createdAt: '2026-07-19T00:00:00.000Z',
          },
        },
        201,
      ),
    )
    const client = makeClient(fetchMock)
    const page = await client.publishedPages.create({
      docId: 'doc_1',
      slug: 'my-comic',
      title: '我的漫画',
      layout: 'comic',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/published-pages')
    expect(JSON.parse(init.body as string)).toEqual({
      docId: 'doc_1',
      slug: 'my-comic',
      title: '我的漫画',
      layout: 'comic',
    })
    expect(page.status).toBe('draft')
  })

  it('PP2: publicPage text/html 专项 —— GET /p/{slug} 公开端点,text 模式原样返回 HTML 字符串', async () => {
    const html = '<!doctype html><html><body><h1>我的漫画</h1></body></html>'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=3600' },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.publishedPages.publicPage('my-comic')
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/p/my-comic')
    expect(url.pathname).not.toContain('/v1/')
    // text 模式:整页 HTML 原样返回(不做 JSON 解析、不拆 data 包装)
    expect(result).toBe(html)
  })

  it('PP3: exportWechat 按 spec 为 JSON 包装,返回 { html } 对象', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: { html: '<p style="margin:0">公众号正文</p>' },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.publishedPages.exportWechat(PAGE_ID)
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe(
      `/v1/published-pages/${PAGE_ID}/export/wechat`,
    )
    expect(result.html).toContain('公众号正文')
  })

  it('PP4: update PATCH 条件展开且返回更新后的页;delete 同步下线', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: { id: PAGE_ID, title: '新标题' } }))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    const updated = await client.publishedPages.update(PAGE_ID, { title: '新标题' })
    await client.publishedPages.delete(PAGE_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/published-pages/${PAGE_ID}`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: '新标题' })
    expect(updated.title).toBe('新标题')
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE')
  })
})

// ────────────────────────── mcp ──────────────────────────

describe('@picora/sdk 平台域 — mcp namespace', () => {
  it('MC1: toolsCatalog 走 GET /mcp/tools.json(公开,非 /v1 前缀),bare 模式不拆 data 包装', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        version: 'v0.33.0',
        generatedAt: '2026-07-19T00:00:00.000Z',
        totals: { tools: 24, byDomain: { images: 6 } },
        tools: [{ name: 'upload_image', domain: 'images' }],
      }),
    )
    const client = makeClient(fetchMock)
    const catalog = await client.mcp.toolsCatalog()
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/mcp/tools.json')
    expect(url.pathname).not.toContain('/v1/')
    // bare 模式:裸 JSON 原样返回(顶层就是 catalog,而非 { success, data })
    expect(catalog.version).toBe('v0.33.0')
    expect(catalog.tools[0]?.name).toBe('upload_image')
  })

  it('MC2: usage 走 GET /v1/mcp/usage 并拆 data 包装', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          yearMonth: '2026-07',
          totalCalls: 320,
          totalCostCents: 45,
          freeQuotaUsed: 100,
          freeQuotaLimit: 500,
          byTool: [{ toolKey: 'upload_image', tier: 'write', calls: 120, costCents: 20 }],
        },
      }),
    )
    const client = makeClient(fetchMock)
    const usage = await client.mcp.usage()
    expect(new URL(String(fetchMock.mock.calls[0]?.[0])).pathname).toBe('/v1/mcp/usage')
    expect(usage.totalCalls).toBe(320)
    expect(usage.byTool[0]?.tier).toBe('write')
  })
})
