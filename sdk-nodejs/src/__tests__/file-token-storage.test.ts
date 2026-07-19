/**
 * Tests for `@picora/sdk/node` FileTokenStorage (v0.65 PR-J).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, stat, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FileTokenStorage } from '../node/file-token-storage.js'
import type { DeviceFlowToken } from '../device-flow.js'

const makeToken = (overrides: Partial<DeviceFlowToken> = {}): DeviceFlowToken => ({
  accessToken: 'tok_abc',
  tokenType: 'Bearer' as const,
  expiresAt: 1_900_000_000,
  scopes: ['collection.read', 'episode.write'],
  refreshToken: 'rf_zzz',
  ...overrides,
})

describe('FileTokenStorage', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'picora-fts-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null when file is missing', async () => {
    const s = new FileTokenStorage(join(dir, 'missing.json'))
    expect(await s.get()).toBeNull()
  })

  it('roundtrips put → get', async () => {
    const s = new FileTokenStorage(join(dir, 'token.json'))
    await s.put(makeToken())
    const r = await s.get()
    expect(r).not.toBeNull()
    expect(r!.accessToken).toBe('tok_abc')
    expect(r!.refreshToken).toBe('rf_zzz')
    expect(r!.scopes).toEqual(['collection.read', 'episode.write'])
    expect(r!.expiresAt).toBe(1_900_000_000)
  })

  it('creates parent directories on put', async () => {
    const target = join(dir, 'a', 'b', 'c', 'token.json')
    await new FileTokenStorage(target).put(makeToken())
    const stats = await stat(target)
    expect(stats.isFile()).toBe(true)
  })

  it.runIf(process.platform !== 'win32')('writes file with 0600 permissions', async () => {
    const target = join(dir, 'token.json')
    await new FileTokenStorage(target).put(makeToken())
    const mode = (await stat(target)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('returns null on corrupted JSON', async () => {
    const target = join(dir, 'token.json')
    await writeFile(target, '{ not json', 'utf-8')
    expect(await new FileTokenStorage(target).get()).toBeNull()
  })

  it('returns null when required accessToken field missing', async () => {
    const target = join(dir, 'token.json')
    await writeFile(target, JSON.stringify({ tokenType: 'Bearer' }), 'utf-8')
    expect(await new FileTokenStorage(target).get()).toBeNull()
  })

  it('clear removes file and is idempotent', async () => {
    const target = join(dir, 'token.json')
    const s = new FileTokenStorage(target)
    await s.put(makeToken())
    await s.clear()
    expect(await s.get()).toBeNull()
    await s.clear()  // second time should not throw
  })

  it('handles token without refreshToken', async () => {
    const target = join(dir, 'token.json')
    const s = new FileTokenStorage(target)
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

  it('persisted JSON uses camelCase keys', async () => {
    const target = join(dir, 'token.json')
    await new FileTokenStorage(target).put(makeToken())
    const raw = await readFile(target, 'utf-8')
    const parsed = JSON.parse(raw)
    expect(parsed.accessToken).toBe('tok_abc')
    expect(parsed.refreshToken).toBe('rf_zzz')
    expect(parsed.expiresAt).toBe(1_900_000_000)
  })

  it('expands ~ in default path', () => {
    const s = new FileTokenStorage()
    expect(s.path).not.toContain('~')
    expect(s.path.endsWith('token.json')).toBe(true)
  })
})
