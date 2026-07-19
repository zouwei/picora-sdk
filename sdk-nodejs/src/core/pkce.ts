/**
 * PKCE(RFC 7636)与 state 生成 helper(v0.3.0)。
 *
 * Picora OAuth 对公开客户端强制 PKCE S256(/oauth/authorize 的 code_challenge_method
 * 仅支持 S256)。本模块只依赖 Web Crypto(globalThis.crypto),Node 18+ 原生可用,
 * 不 import node:crypto —— 保持 core 层运行时无 Node 绑定。
 */

/** 字节数组 → base64url(无填充,RFC 4648 §5) */
function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

/**
 * 生成 PKCE code verifier:32 字节高熵随机 → base64url(43 字符,满足 RFC 7636
 * §4.1 的 43~128 字符要求)。verifier 须由发起方持有,授权回调换 token 时提交。
 */
export function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return base64url(bytes)
}

/**
 * 计算 S256 code challenge:BASE64URL(SHA-256(ASCII(verifier)))(RFC 7636 §4.2)。
 */
export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

/**
 * 生成 CSRF state(16 字节随机 → base64url)。含 openid scope 时也可用作 nonce。
 */
export function generateState(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return base64url(bytes)
}
