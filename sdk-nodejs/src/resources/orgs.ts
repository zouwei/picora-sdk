/**
 * orgs 命名空间(v0.3.0 平台域批次,v0.50~v0.52 Teams)—— Org CRUD + 审计日志 +
 * members / invites / subscription 三个子命名空间。
 *
 * 权限门槛:成员管理(remove / updateRole)与订阅操作(checkout / seats)须 owner;
 * 邀请成员与审计日志须 editor+;list / get 任意成员可读。
 * 订阅 checkout 与 seats 变更涉及扣款,关闭 429/5xx 自动重试(防重复下单/重复扣费)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  AcceptOrgInviteInput,
  AcceptOrgInviteResult,
  ChangeOrgSeatsInput,
  ChangeOrgSeatsResult,
  CreateOrgInput,
  InviteOrgMemberInput,
  InviteOrgMemberResult,
  Org,
  OrgAuditLogItem,
  OrgAuditLogParams,
  OrgCheckoutInput,
  OrgCheckoutResult,
  OrgDetail,
  OrgMember,
  OrgWithRole,
  UpdateOrgMemberRoleInput,
} from '../types/index.js'

export interface OrgsNamespace {
  /** 列出当前用户加入的所有 Org(owner / editor / viewer 均含,附 myRole 字段)。 */
  list(): Promise<OrgWithRole[]>
  /**
   * 创建 Org(自动加当前用户为 owner 成员)。
   * 创建后须走 subscription.checkout 选择 plan 才能邀请成员。
   */
  create(input: CreateOrgInput): Promise<Org>
  /** 获取 Org 元数据 + 当前订阅信息(plan / seats / 活跃成员数);仅成员可见。 */
  get(orgId: string): Promise<OrgDetail>
  /**
   * 列出 Org 审计日志(成员邀请/移除/角色变更/订阅变更/资源访问;按 created_at DESC)。
   * 须 editor+ 权限。**此端点非游标分页**,直接返回条目**数组**:用 `limit`(默认 50)
   * 控制条数、`action` 精确过滤操作类型;不支持游标翻页。
   */
  auditLogs(orgId: string, params?: OrgAuditLogParams): Promise<OrgAuditLogItem[]>
  /** 成员管理子命名空间(remove / updateRole 须 owner)。 */
  readonly members: {
    /** 列出 Org 成员(role + invitedAt + joinedAt)。 */
    list(orgId: string): Promise<OrgMember[]>
    /**
     * 移除成员(仅 owner)。owner 不可移除自己(须先转让 ownership);
     * 被移除用户的 owned 资源仍归 org,不随用户走。
     */
    remove(orgId: string, userId: string): Promise<void>
    /**
     * 变更成员角色(仅 owner;晋升为 owner 即转让所有权)。
     * owner 不能自降为 editor/viewer,除非另存在 owner。
     */
    updateRole(orgId: string, userId: string, input: UpdateOrgMemberRoleInput): Promise<OrgMember>
  }
  /** 邀请管理子命名空间。 */
  readonly invites: {
    /** 按邮箱邀请成员(须 editor+;owner 角色不可邀请)。邀请 token 经邮件发送,7 天有效。 */
    create(orgId: string, input: InviteOrgMemberInput): Promise<InviteOrgMemberResult>
    /** 被邀请用户登录后凭 token 接受邀请(email 与登录账号不一致时 403)。 */
    accept(input: AcceptOrgInviteInput): Promise<AcceptOrgInviteResult>
  }
  /** 订阅管理子命名空间(仅 owner)。 */
  readonly subscription: {
    /**
     * 创建 Org 订阅 checkout(仅 owner),返回 Creem 付款页 URL + 总价;
     * 付款后经 webhook 异步到账。海外档位:teams_starter(5 seats 起)/
     * teams_pro(20 seats 起)。非幂等支付发起,SDK 关闭 429/5xx 自动重试。
     */
    checkout(orgId: string, input: OrgCheckoutInput): Promise<OrgCheckoutResult>
    /**
     * 变更坐席总数(仅 owner;seats 为目标总数非增量)。加坐席 Stripe-style prorate
     * 按剩余周期立即补差价收费;减坐席下周期生效(不可低于当前 active member 数)。
     * 涉及立即扣款,SDK 关闭 429/5xx 自动重试(防重复扣费)。
     */
    seats(orgId: string, input: ChangeOrgSeatsInput): Promise<ChangeOrgSeatsResult>
  }
}

export function createOrgsNamespace(http: HttpCore): OrgsNamespace {
  return {
    list: () => http.request<OrgWithRole[]>({ method: 'GET', path: '/v1/orgs' }),
    create: (input) =>
      http.request<Org>({
        method: 'POST',
        path: '/v1/orgs',
        body: {
          name: input.name,
          slug: input.slug,
          ...(input.billingEmail !== undefined ? { billingEmail: input.billingEmail } : {}),
        },
      }),
    get: (orgId) =>
      http.request<OrgDetail>({ method: 'GET', path: `/v1/orgs/${encodeURIComponent(orgId)}` }),
    auditLogs: (orgId, params) => {
      // 端点返回裸数组({success,data:[...]},data 由 http core 拆封),非游标分页
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.action !== undefined) query['action'] = params.action
      if (params?.limit !== undefined) query['limit'] = params.limit
      return http.request<OrgAuditLogItem[]>({
        method: 'GET',
        path: `/v1/orgs/${encodeURIComponent(orgId)}/audit-logs`,
        query,
      })
    },
    members: {
      list: (orgId) =>
        http.request<OrgMember[]>({
          method: 'GET',
          path: `/v1/orgs/${encodeURIComponent(orgId)}/members`,
        }),
      remove: async (orgId, userId) => {
        await http.request<void>({
          method: 'DELETE',
          path: `/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}`,
          response: 'none',
        })
      },
      updateRole: (orgId, userId, input) =>
        http.request<OrgMember>({
          method: 'PATCH',
          path: `/v1/orgs/${encodeURIComponent(orgId)}/members/${encodeURIComponent(userId)}/role`,
          body: { role: input.role },
        }),
    },
    invites: {
      create: (orgId, input) =>
        http.request<InviteOrgMemberResult>({
          method: 'POST',
          path: `/v1/orgs/${encodeURIComponent(orgId)}/invites`,
          body: { email: input.email, role: input.role },
        }),
      accept: (input) =>
        http.request<AcceptOrgInviteResult>({
          method: 'POST',
          path: '/v1/orgs/invites/accept',
          body: { token: input.token },
        }),
    },
    subscription: {
      checkout: (orgId, input) =>
        http.request<OrgCheckoutResult>({
          method: 'POST',
          path: `/v1/orgs/${encodeURIComponent(orgId)}/subscription/checkout`,
          body: {
            productKey: input.productKey,
            seats: input.seats,
            ...(input.successUrl !== undefined ? { successUrl: input.successUrl } : {}),
            ...(input.cancelUrl !== undefined ? { cancelUrl: input.cancelUrl } : {}),
          },
          retry: false,
        }),
      seats: (orgId, input) =>
        http.request<ChangeOrgSeatsResult>({
          method: 'POST',
          path: `/v1/orgs/${encodeURIComponent(orgId)}/subscription/seats`,
          body: { seats: input.seats },
          retry: false,
        }),
    },
  }
}

export const ORGS_COVERAGE = [
  { method: 'GET', path: '/v1/orgs', client: 'orgs.list' },
  { method: 'POST', path: '/v1/orgs', client: 'orgs.create' },
  { method: 'GET', path: '/v1/orgs/{id}', client: 'orgs.get' },
  { method: 'GET', path: '/v1/orgs/{id}/audit-logs', client: 'orgs.auditLogs' },
  { method: 'GET', path: '/v1/orgs/{id}/members', client: 'orgs.members.list' },
  { method: 'DELETE', path: '/v1/orgs/{id}/members/{userId}', client: 'orgs.members.remove' },
  { method: 'PATCH', path: '/v1/orgs/{id}/members/{userId}/role', client: 'orgs.members.updateRole' },
  { method: 'POST', path: '/v1/orgs/{id}/invites', client: 'orgs.invites.create' },
  { method: 'POST', path: '/v1/orgs/invites/accept', client: 'orgs.invites.accept' },
  { method: 'POST', path: '/v1/orgs/{id}/subscription/checkout', client: 'orgs.subscription.checkout' },
  { method: 'POST', path: '/v1/orgs/{id}/subscription/seats', client: 'orgs.subscription.seats' },
] as const satisfies readonly CoveredOperation[]
