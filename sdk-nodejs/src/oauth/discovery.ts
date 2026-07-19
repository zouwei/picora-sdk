/**
 * OAuth / OIDC 发现端点 helper(模块级,公开端点,无需鉴权)(v0.3.0)。
 */

import { StaticTokenProvider } from '../core/auth-provider.js'
import { createOAuthHttpCore, type OAuthHttpOptions } from './authorization.js'
import type { CoveredOperation } from '../coverage/types.js'
import type { OidcUserinfo } from '../types/index.js'

/**
 * OAuth 2.0 授权服务器元数据(RFC 8414)。仅列出 SDK 关心的字段,
 * 其余字段经索引签名透传。
 */
export interface AuthorizationServerMetadata {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  revocation_endpoint?: string
  device_authorization_endpoint?: string
  scopes_supported?: string[]
  code_challenge_methods_supported?: string[]
  [k: string]: unknown
}

/** OIDC Discovery 文档(在 RFC 8414 基础上多 userinfo/jwks 等字段) */
export interface OidcConfiguration extends AuthorizationServerMetadata {
  userinfo_endpoint?: string
  jwks_uri?: string
  id_token_signing_alg_values_supported?: string[]
}

/** JSON Web Key Set(RFC 7517) */
export interface Jwks {
  keys: Array<Record<string, unknown>>
}

/**
 * 拉取 OAuth 2.0 授权服务器元数据(GET /.well-known/oauth-authorization-server,RFC 8414;公开端点)。
 * 用于运行时发现 authorization / token / revocation / device 端点与支持的 scope,避免硬编码路径。
 */
export async function fetchAuthorizationServerMetadata(
  opts?: OAuthHttpOptions,
): Promise<AuthorizationServerMetadata> {
  const http = createOAuthHttpCore(opts)
  return http.request<AuthorizationServerMetadata>({
    method: 'GET',
    path: '/.well-known/oauth-authorization-server',
    response: 'bare',
  })
}

/**
 * 拉取 OIDC Discovery 文档(GET /.well-known/openid-configuration;公开端点)。
 * 在 RFC 8414 元数据基础上额外含 userinfo_endpoint / jwks_uri 等,供 OIDC 客户端发现端点。
 */
export async function fetchOidcConfiguration(opts?: OAuthHttpOptions): Promise<OidcConfiguration> {
  const http = createOAuthHttpCore(opts)
  return http.request<OidcConfiguration>({
    method: 'GET',
    path: '/.well-known/openid-configuration',
    response: 'bare',
  })
}

/**
 * 拉取 JWKS 公钥集(GET /.well-known/jwks.json;公开端点),用于本地验签 OIDC ID Token。
 */
export async function fetchJwks(opts?: OAuthHttpOptions): Promise<Jwks> {
  const http = createOAuthHttpCore(opts)
  return http.request<Jwks>({ method: 'GET', path: '/.well-known/jwks.json', response: 'bare' })
}

/**
 * GET /oauth/userinfo(OIDC UserInfo)。
 * 传入 OAuth access token(需含 openid scope;email/name 等字段按 account.read 授予情况返回)。
 */
export async function fetchUserinfo(
  accessToken: string,
  opts?: OAuthHttpOptions,
): Promise<OidcUserinfo> {
  const http = createOAuthHttpCore(opts, new StaticTokenProvider(accessToken))
  return http.request<OidcUserinfo>({ method: 'GET', path: '/oauth/userinfo', response: 'bare' })
}

export const OAUTH_DISCOVERY_COVERAGE = [
  { method: 'GET', path: '/.well-known/oauth-authorization-server', client: 'oauth.fetchAuthorizationServerMetadata' },
  { method: 'GET', path: '/.well-known/openid-configuration', client: 'oauth.fetchOidcConfiguration' },
  { method: 'GET', path: '/.well-known/jwks.json', client: 'oauth.fetchJwks' },
  { method: 'GET', path: '/oauth/userinfo', client: 'oauth.fetchUserinfo' },
] as const satisfies readonly CoveredOperation[]
