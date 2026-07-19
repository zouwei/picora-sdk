/**
 * OAuth 2.1 授权码流 helper(模块级,无需 PicoraClient 实例)(v0.3.0)。
 *
 * 覆盖授权码 + PKCE + refresh 旋转的完整客户端侧链路:
 *   1. createAuthorizationRequest() → { url, state, codeVerifier } —— 引导用户跳转 url
 *      (浏览器跳转 / 系统浏览器打开由消费者自己处理,SDK 不做 UI)
 *   2. 回调拿到 code → exchangeAuthorizationCode() → OAuthTokenSet
 *   3. 存入 TokenStorage 后交给 createOAuthTokenProvider 自动续期
 *
 * 安全要点(参照 folia 服务端实现的经验):
 *   - code verifier 由发起方持有,不下发给不可信端
 *   - Picora 的 refresh 强制旋转:旧 refresh token 用过即废,重放会吊销整条 token 链
 */

import type { AuthProvider } from '../core/auth-provider.js'
import { createHttpCore, type HttpCore } from '../core/http.js'
import { computeCodeChallenge, generateCodeVerifier, generateState } from '../core/pkce.js'
import { SDK_VERSION } from '../version.js'
import type { CoveredOperation } from '../coverage/types.js'
import type { OAuthTokenSet } from '../types/index.js'

const DEFAULT_BASE_URL = 'https://api.picora.me'
const DEFAULT_TIMEOUT_MS = 30_000

/** 模块级函数的通用连接配置 */
export interface OAuthHttpOptions {
  /** API 基地址。默认 https://api.picora.me */
  baseUrl?: string
  /** 自定义 fetch(测试 mock / 特殊网络栈)。默认 globalThis.fetch */
  fetch?: typeof fetch
}

/** 匿名(或指定 token)HttpCore —— 复用统一的重试矩阵与 OAuth 裸错误映射 */
export function createOAuthHttpCore(opts: OAuthHttpOptions | undefined, auth?: AuthProvider): HttpCore {
  const fetchImpl = opts?.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('picora oauth: fetch is not available; pass options.fetch on Node < 18')
  }
  const anonymous: AuthProvider = { getAuthorization: async () => null }
  return createHttpCore(
    {
      baseUrl: (opts?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
      timeout: DEFAULT_TIMEOUT_MS,
      fetch: fetchImpl,
      retryOnRateLimit: true,
      retryOnServerError: true,
      userAgent: `@picora/sdk/${SDK_VERSION}`,
      debug: false,
    },
    auth ?? anonymous,
  )
}

// ─── 授权 URL ─────────────────────────────────────────────────

export interface BuildAuthorizationUrlParams {
  clientId: string
  /** 必须与客户端注册值完全匹配 */
  redirectUri: string
  /** 申请的 scope 列表(如 ['openid', 'kb.read']) */
  scopes: readonly string[]
  /** CSRF state(回调时原样带回,发起方须校验) */
  state?: string
  /** OIDC nonce(scopes 含 openid 时服务端强制要求) */
  nonce?: string
  /** PKCE S256 challenge(公开客户端必须携带;经 computeCodeChallenge 计算) */
  codeChallenge?: string
  baseUrl?: string
}

/**
 * 构造 GET /oauth/authorize 授权页 URL(纯字符串拼接,不发请求)。
 * 一般用 createAuthorizationRequest() 一步生成全套参数;本函数是低层入口。
 */
export function buildAuthorizationUrl(params: BuildAuthorizationUrlParams): string {
  const base = (params.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
  const url = new URL(`${base}/oauth/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('scope', params.scopes.join(' '))
  if (params.state !== undefined) url.searchParams.set('state', params.state)
  if (params.nonce !== undefined) url.searchParams.set('nonce', params.nonce)
  if (params.codeChallenge !== undefined) {
    url.searchParams.set('code_challenge', params.codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
  }
  return url.toString()
}

export interface CreateAuthorizationRequestOptions {
  clientId: string
  redirectUri: string
  scopes: readonly string[]
  /** 缺省自动生成(16 字节随机 base64url) */
  state?: string
  /** scopes 含 openid 时缺省自动生成 */
  nonce?: string
  baseUrl?: string
}

export interface AuthorizationRequest {
  /** 引导用户访问的授权页完整 URL(已含 PKCE challenge) */
  url: string
  /** 回调时须校验的 CSRF state */
  state: string
  /** OIDC nonce(仅 scopes 含 openid 时存在) */
  nonce?: string
  /** PKCE code verifier —— 妥善保存,exchangeAuthorizationCode 时提交 */
  codeVerifier: string
}

/**
 * 一步生成授权请求全套参数(state + nonce + PKCE verifier/challenge + URL)。
 *
 * 发起方须持久化 { state → codeVerifier(+nonce) } 映射(如 KV / session,建议
 * 短 TTL 一次性),回调时按 state 取回 verifier 再换 token。
 */
export async function createAuthorizationRequest(
  opts: CreateAuthorizationRequestOptions,
): Promise<AuthorizationRequest> {
  const state = opts.state ?? generateState()
  const includesOpenid = opts.scopes.includes('openid')
  const nonce = includesOpenid ? (opts.nonce ?? generateState()) : opts.nonce
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await computeCodeChallenge(codeVerifier)
  const url = buildAuthorizationUrl({
    clientId: opts.clientId,
    redirectUri: opts.redirectUri,
    scopes: opts.scopes,
    state,
    ...(nonce !== undefined ? { nonce } : {}),
    codeChallenge,
    ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
  })
  return { url, state, ...(nonce !== undefined ? { nonce } : {}), codeVerifier }
}

// ─── Token 端点 ───────────────────────────────────────────────

/** /oauth/token 线上响应(RFC 6749 字段名) */
interface WireTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  id_token?: string
}

/** 线上 token 响应 → SDK 归一形态(expires_in → 绝对 unix 秒) */
function normalizeTokenResponse(wire: WireTokenResponse): OAuthTokenSet {
  return {
    accessToken: wire.access_token,
    ...(wire.refresh_token !== undefined ? { refreshToken: wire.refresh_token } : {}),
    tokenType: 'Bearer',
    expiresAt: Math.floor(Date.now() / 1000) + (wire.expires_in ?? 900),
    scopes: (wire.scope ?? '').split(' ').filter(Boolean),
    ...(wire.id_token !== undefined ? { idToken: wire.id_token } : {}),
  }
}

export interface ExchangeCodeOptions extends OAuthHttpOptions {
  clientId: string
  /** 授权回调 query 中的 code */
  code: string
  /** 必须与 /oauth/authorize、/oauth/consent 时一致 */
  redirectUri: string
  /** PKCE verifier(公开客户端必填,与发起时的 challenge 对应) */
  codeVerifier: string
}

/**
 * 授权码换 token(POST /oauth/token,grant_type=authorization_code)。
 *
 * @throws {PicoraApiError} code='invalid_grant' —— 授权码过期 / 已使用 / verifier 不匹配
 */
export async function exchangeAuthorizationCode(opts: ExchangeCodeOptions): Promise<OAuthTokenSet> {
  const http = createOAuthHttpCore(opts)
  const wire = await http.request<WireTokenResponse>({
    method: 'POST',
    path: '/oauth/token',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: opts.code,
      redirect_uri: opts.redirectUri,
      client_id: opts.clientId,
      code_verifier: opts.codeVerifier,
    }),
    response: 'bare',
  })
  return normalizeTokenResponse(wire)
}

export interface RefreshTokenOptions extends OAuthHttpOptions {
  clientId: string
  refreshToken: string
  /** 可选:申请缩小 scope(RFC 6749 §6,不能超过原 granted scopes) */
  scope?: string
}

/**
 * 刷新 token(POST /oauth/token,grant_type=refresh_token)。
 *
 * **旋转语义**:返回的新 refresh token 生效的同时旧值立即作废;调用方必须先
 * 持久化新 token 对再丢弃旧值(顺序颠倒 + 崩溃 = 永久丢会话;重放旧值会触发
 * 服务端吊销整条 token 链)。createOAuthTokenProvider 已内置该不变式。
 *
 * @throws {PicoraApiError} code='invalid_grant' —— refresh token 已失效 / 被吊销
 */
export async function refreshAccessToken(opts: RefreshTokenOptions): Promise<OAuthTokenSet> {
  const http = createOAuthHttpCore(opts)
  const wire = await http.request<WireTokenResponse>({
    method: 'POST',
    path: '/oauth/token',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      ...(opts.scope !== undefined ? { scope: opts.scope } : {}),
    }),
    response: 'bare',
  })
  return normalizeTokenResponse(wire)
}

export interface RevokeTokenOptions extends OAuthHttpOptions {
  /** 要吊销的 token(access_token 或 refresh_token) */
  token: string
  /** token 类型提示(可选,加速服务端查找) */
  tokenTypeHint?: 'access_token' | 'refresh_token'
  /** 可选,若提供则校验 token 属于该 client */
  clientId?: string
}

/**
 * 吊销 token(POST /oauth/revoke,RFC 7009)。
 * 按 RFC 语义,对未知 token 服务端亦返回 200(幂等)。
 */
export async function revokeToken(opts: RevokeTokenOptions): Promise<void> {
  const http = createOAuthHttpCore(opts)
  await http.request<void>({
    method: 'POST',
    path: '/oauth/revoke',
    body: new URLSearchParams({
      token: opts.token,
      ...(opts.tokenTypeHint !== undefined ? { token_type_hint: opts.tokenTypeHint } : {}),
      ...(opts.clientId !== undefined ? { client_id: opts.clientId } : {}),
    }),
    response: 'none',
  })
}

/**
 * 本模块覆盖的 spec operation。
 * GET /oauth/authorize 是浏览器跳转端点,SDK 以 URL 构造器形态覆盖(不发请求)。
 * POST /oauth/token 同时服务授权码交换 / refresh / 设备码轮询,规范登记在 exchange 入口。
 */
export const OAUTH_AUTHORIZATION_COVERAGE = [
  { method: 'GET', path: '/oauth/authorize', client: 'oauth.buildAuthorizationUrl' },
  { method: 'POST', path: '/oauth/token', client: 'oauth.exchangeAuthorizationCode' },
  { method: 'POST', path: '/oauth/revoke', client: 'oauth.revokeToken' },
] as const satisfies readonly CoveredOperation[]
