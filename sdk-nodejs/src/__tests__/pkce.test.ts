import { describe, it, expect } from 'vitest'
import { computeCodeChallenge, generateCodeVerifier, generateState } from '../core/pkce.js'

/**
 * PKCE helper 测试。
 * S256 用 RFC 7636 附录 B 的官方测试向量钉住,防止 base64url / 编码实现漂移。
 */

describe('pkce', () => {
  it('computeCodeChallenge matches RFC 7636 Appendix B test vector', async () => {
    const challenge = await computeCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('generateCodeVerifier produces 43-char base64url (32 bytes, RFC 7636 §4.1 compliant)', () => {
    const verifier = generateCodeVerifier()
    expect(verifier).toHaveLength(43)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('generateCodeVerifier is high-entropy (no repeats across calls)', () => {
    const seen = new Set(Array.from({ length: 32 }, () => generateCodeVerifier()))
    expect(seen.size).toBe(32)
  })

  it('generateState produces url-safe token', () => {
    const state = generateState()
    expect(state.length).toBeGreaterThanOrEqual(16)
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})
