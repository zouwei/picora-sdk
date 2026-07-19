/**
 * Tests for `@picora/sdk/node` KeychainTokenStorage (v0.66 PR-K).
 *
 * Backend 通过依赖注入 mock，避免在 CI 中触碰真实 OS keychain。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  DEFAULT_KEYCHAIN_ACCOUNT,
  DEFAULT_KEYCHAIN_SERVICE,
  KeychainTokenStorage,
  __resetKeychainBackendCacheForTests,
  type KeychainBackend,
} from '../node/keychain-token-storage.js'
import type { DeviceFlowToken } from '../device-flow.js'

const makeToken = (overrides: Partial<DeviceFlowToken> = {}): DeviceFlowToken => ({
  accessToken: 'tok_abc',
  tokenType: 'Bearer' as const,
  expiresAt: 1_900_000_000,
  scopes: ['collection.read', 'episode.write'],
  refreshToken: 'rf_zzz',
  ...overrides,
})

function makeMockBackend(initial: Map<string, string> = new Map()): KeychainBackend & {
  store: Map<string, string>
  getCalls: Array<[string, string]>
  setCalls: Array<[string, string, string]>
  delCalls: Array<[string, string]>
} {
  const store = new Map(initial)
  const getCalls: Array<[string, string]> = []
  const setCalls: Array<[string, string, string]> = []
  const delCalls: Array<[string, string]> = []
  return {
    store,
    getCalls,
    setCalls,
    delCalls,
    async getPassword(service, account) {
      getCalls.push([service, account])
      return store.get(`${service}:${account}`) ?? null
    },
    async setPassword(service, account, password) {
      setCalls.push([service, account, password])
      store.set(`${service}:${account}`, password)
    },
    async deletePassword(service, account) {
      delCalls.push([service, account])
      return store.delete(`${service}:${account}`)
    },
  }
}

describe('KeychainTokenStorage', () => {
  beforeEach(() => {
    __resetKeychainBackendCacheForTests()
  })

  it('defaults to service=picora-sdk, account=default', () => {
    const s = new KeychainTokenStorage({ backend: makeMockBackend() })
    expect(s.service).toBe(DEFAULT_KEYCHAIN_SERVICE)
    expect(s.account).toBe(DEFAULT_KEYCHAIN_ACCOUNT)
    expect(DEFAULT_KEYCHAIN_SERVICE).toBe('picora-sdk')
    expect(DEFAULT_KEYCHAIN_ACCOUNT).toBe('default')
  })

  it('honors custom service + account', () => {
    const s = new KeychainTokenStorage({
      service: 'picora-staging',
      account: 'cli_acme',
      backend: makeMockBackend(),
    })
    expect(s.service).toBe('picora-staging')
    expect(s.account).toBe('cli_acme')
  })

  it('get() returns null when keychain entry is missing', async () => {
    const backend = makeMockBackend()
    const s = new KeychainTokenStorage({ backend })
    expect(await s.get()).toBeNull()
    expect(backend.getCalls).toEqual([[DEFAULT_KEYCHAIN_SERVICE, DEFAULT_KEYCHAIN_ACCOUNT]])
  })

  it('put() then get() roundtrips the full token shape', async () => {
    const backend = makeMockBackend()
    const s = new KeychainTokenStorage({ backend })
    await s.put(makeToken())
    const restored = await s.get()
    expect(restored).not.toBeNull()
    expect(restored!.accessToken).toBe('tok_abc')
    expect(restored!.refreshToken).toBe('rf_zzz')
    expect(restored!.scopes).toEqual(['collection.read', 'episode.write'])
    expect(restored!.expiresAt).toBe(1_900_000_000)
    expect(restored!.tokenType).toBe('Bearer')
  })

  it('put() serializes JSON into the keychain entry', async () => {
    const backend = makeMockBackend()
    await new KeychainTokenStorage({ backend }).put(makeToken())
    expect(backend.setCalls).toHaveLength(1)
    const [svc, acct, payload] = backend.setCalls[0]!
    expect(svc).toBe(DEFAULT_KEYCHAIN_SERVICE)
    expect(acct).toBe(DEFAULT_KEYCHAIN_ACCOUNT)
    const parsed = JSON.parse(payload)
    expect(parsed.accessToken).toBe('tok_abc')
    expect(parsed.refreshToken).toBe('rf_zzz')
  })

  it('get() returns null when entry contains invalid JSON', async () => {
    const backend = makeMockBackend(
      new Map([[`${DEFAULT_KEYCHAIN_SERVICE}:${DEFAULT_KEYCHAIN_ACCOUNT}`, '{ broken json']]),
    )
    expect(await new KeychainTokenStorage({ backend }).get()).toBeNull()
  })

  it('get() returns null when required accessToken field is missing', async () => {
    const backend = makeMockBackend(
      new Map([
        [
          `${DEFAULT_KEYCHAIN_SERVICE}:${DEFAULT_KEYCHAIN_ACCOUNT}`,
          JSON.stringify({ tokenType: 'Bearer', scopes: [] }),
        ],
      ]),
    )
    expect(await new KeychainTokenStorage({ backend }).get()).toBeNull()
  })

  it('clear() calls deletePassword and is idempotent', async () => {
    const backend = makeMockBackend()
    const s = new KeychainTokenStorage({ backend })
    await s.put(makeToken())
    await s.clear()
    expect(await s.get()).toBeNull()
    // second clear: backend returns false from delete, must not throw
    await s.clear()
    expect(backend.delCalls).toHaveLength(2)
  })

  it('handles token without refreshToken (optional field)', async () => {
    const backend = makeMockBackend()
    const s = new KeychainTokenStorage({ backend })
    await s.put({
      accessToken: 'a',
      tokenType: 'Bearer',
      expiresAt: 0,
      scopes: [],
    })
    const r = await s.get()
    expect(r).not.toBeNull()
    expect(r!.refreshToken).toBeUndefined()
  })

  it('multiple instances with different accounts do not collide', async () => {
    const backend = makeMockBackend()
    const a = new KeychainTokenStorage({ backend, account: 'alice' })
    const b = new KeychainTokenStorage({ backend, account: 'bob' })
    await a.put(makeToken({ accessToken: 'tok_alice' }))
    await b.put(makeToken({ accessToken: 'tok_bob' }))
    expect((await a.get())!.accessToken).toBe('tok_alice')
    expect((await b.get())!.accessToken).toBe('tok_bob')
  })

  it('surfaces backend errors with a "keytar not installed" hint when default loader fails', async () => {
    // Inject a backend that simulates the dynamic-import-failure path
    // (in real consumer envs without `keytar`, loadDefaultBackend() throws this exact shape)
    const brokenBackend: KeychainBackend = {
      async getPassword() {
        throw new Error(
          'KeychainTokenStorage: `keytar` is not installed. Run `npm install keytar`',
        )
      },
      async setPassword() {
        throw new Error('not installed')
      },
      async deletePassword() {
        return false
      },
    }
    const s = new KeychainTokenStorage({ backend: brokenBackend })
    await expect(s.get()).rejects.toThrow(/keytar.*not installed/i)
  })

  it('rejects backend that misses required methods', async () => {
    const broken = { getPassword: vi.fn() } as unknown as KeychainBackend
    const s = new KeychainTokenStorage({ backend: broken })
    // get() works because only getPassword is required on the read path,
    // but put() should fail because setPassword is missing.
    await expect(s.put(makeToken())).rejects.toThrow()
  })
})
