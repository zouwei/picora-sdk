/**
 * oauth 命名空间(client 实例上)—— 需要用户会话的 OAuth 管理端点(v0.14/v0.57)。
 *
 * 与模块级 oauth helper(src/oauth/)的分工:
 *   - 模块级:授权码流 / token 交换 / 发现文档 —— 公开端点,无需 client
 *   - 本命名空间:动态注册 / 同意页提交 / 设备码确认 / 客户端管理 —— BearerAuth 会话端点
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  ConsentInput,
  ConsentResult,
  DeviceVerifyInput,
  DeviceVerifyResult,
  OAuthClientInfo,
  OidcUserinfo,
  RegisterClientInput,
  RegisteredClient,
  RevokeAllResult,
} from '../types/index.js'

export interface OAuthMgmtNamespace {
  /**
   * 动态注册 OAuth 客户端(RFC 7591)。
   * status='pending' 表示等待管理员审核;'approved' 立即可用。响应为 RFC 裸 JSON(线上字段名)。
   */
  registerClient(input: RegisterClientInput): Promise<RegisteredClient>
  /**
   * 提交授权同意决定(自建同意页时使用)。
   * 返回 redirect_to:approve 含 ?code=xxx&state=yyy;deny 含 ?error=access_denied。
   */
  consent(input: ConsentInput): Promise<ConsentResult>
  /** 用户对设备码授权做出决定(RFC 8628;CLI 展示 user_code 后由已登录用户确认)。 */
  deviceVerify(input: DeviceVerifyInput): Promise<DeviceVerifyResult>
  /** OIDC UserInfo(以当前会话 token 调用;模块级 fetchUserinfo 是免 client 的等价入口)。 */
  userinfo(): Promise<OidcUserinfo>
  readonly clients: {
    /** 列出我注册的 OAuth 客户端。 */
    list(): Promise<OAuthClientInfo[]>
    /** 删除 OAuth 客户端(其名下全部授权与 token 一并吊销)。 */
    delete(id: string): Promise<void>
  }
  /** 吊销当前用户全部 OAuth 授权(改密码 / 安全事件时的一键操作)。 */
  revokeAll(): Promise<RevokeAllResult>
}

export function createOAuthMgmtNamespace(http: HttpCore): OAuthMgmtNamespace {
  return {
    registerClient: (input) =>
      http.request<RegisteredClient>({
        method: 'POST',
        path: '/oauth/register',
        body: {
          client_name: input.clientName,
          redirect_uris: input.redirectUris,
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
        },
        response: 'bare',
      }),
    consent: (input) =>
      http.request<ConsentResult>({
        method: 'POST',
        path: '/oauth/consent',
        body: {
          client_id: input.clientId,
          redirect_uri: input.redirectUri,
          scope: input.scope,
          action: input.action,
          ...(input.grantedScopes !== undefined ? { granted_scopes: input.grantedScopes } : {}),
        },
        response: 'bare',
      }),
    deviceVerify: (input) =>
      http.request<DeviceVerifyResult>({
        method: 'POST',
        path: '/v1/oauth/device/verify',
        body: {
          user_code: input.userCode,
          action: input.action,
          ...(input.scope !== undefined ? { scope: input.scope } : {}),
        },
      }),
    userinfo: () =>
      http.request<OidcUserinfo>({ method: 'GET', path: '/oauth/userinfo', response: 'bare' }),
    clients: {
      list: () => http.request<OAuthClientInfo[]>({ method: 'GET', path: '/v1/oauth/clients' }),
      delete: async (id) => {
        await http.request<void>({
          method: 'DELETE',
          path: `/v1/oauth/clients/${encodeURIComponent(id)}`,
        })
      },
    },
    revokeAll: () =>
      http.request<RevokeAllResult>({ method: 'POST', path: '/v1/oauth/revoke-all' }),
  }
}

/** GET /oauth/userinfo 的规范覆盖登记在模块级 fetchUserinfo(discovery.ts),此处不重复。 */
export const OAUTH_MGMT_COVERAGE = [
  { method: 'POST', path: '/oauth/register', client: 'oauth.registerClient' },
  { method: 'POST', path: '/oauth/consent', client: 'oauth.consent' },
  { method: 'POST', path: '/v1/oauth/device/verify', client: 'oauth.deviceVerify' },
  { method: 'GET', path: '/v1/oauth/clients', client: 'oauth.clients.list' },
  { method: 'DELETE', path: '/v1/oauth/clients/{id}', client: 'oauth.clients.delete' },
  { method: 'POST', path: '/v1/oauth/revoke-all', client: 'oauth.revokeAll' },
] as const satisfies readonly CoveredOperation[]
