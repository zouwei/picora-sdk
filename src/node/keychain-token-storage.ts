/**
 * v0.66 PR-K：OS Keychain backed token persistence。
 *
 * 适用场景：CLI / 桌面 / DevOps 脚本希望把 OAuth refresh_token 放进系统级 keychain
 *           （macOS Keychain / Windows Credential Manager / Linux libsecret）
 *           而非明文落盘 `~/.picora/token.json`。
 *
 * 设计要点：
 *   - 默认动态 `import('keytar')`；keytar 是 SDK 的 **optional peer dependency**，
 *     缺失时 `instantiate` 阶段不会抛，只在第一次实际 IO（get/put/clear）时报清晰错误。
 *   - 也支持 `backend` 注入，便于：
 *       · 用 `@napi-rs/keyring` 自包装适配 keytar API
 *       · 单元测试 / mock
 *       · 自建 Vault / 1Password CLI 桥接
 *   - Service 名默认 `picora-sdk`；account 名默认 `default`（多账号场景传 clientId）。
 *   - 存储载荷：`JSON.stringify(token)` —— 不做应用层加密，OS keychain 自身已加密。
 *   - 解析失败（JSON 坏 / 字段缺失）返回 null，让消费者降级到重新 Device Flow，
 *     行为与 FileTokenStorage 对齐。
 *
 * @example
 *   import { startDeviceFlow } from '@picora/sdk'
 *   import { KeychainTokenStorage } from '@picora/sdk/node'
 *
 *   const storage = new KeychainTokenStorage({ account: 'cli_acme' })
 *   let token = await storage.get()
 *   if (!token) {
 *     const flow = await startDeviceFlow({ clientId: 'cli_acme', scopes: ['collection.read'] })
 *     token = await flow.poll()
 *     await storage.put(token)
 *   }
 */

import type { DeviceFlowToken, TokenStorage } from '../device-flow'

/**
 * keytar 兼容 API 表面 —— 任何实现这三个方法的对象都可作为 backend。
 *
 * 参考：https://github.com/atom/node-keytar#api
 */
export interface KeychainBackend {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

export interface KeychainTokenStorageOptions {
  /** Keychain service name；默认 `picora-sdk`。改名后旧数据需手动迁移。 */
  service?: string
  /** Keychain account name；默认 `default`。多账号场景传 OAuth client_id。 */
  account?: string
  /**
   * 自定义 backend。默认 `import('keytar')`（懒加载）。
   * 提供此项可避免 keytar 安装、或对接 `@napi-rs/keyring` / Vault 等。
   */
  backend?: KeychainBackend
}

const KEYTAR_INSTALL_HINT =
  "KeychainTokenStorage: `keytar` is not installed. " +
  'Run `npm install keytar` (or `pnpm add keytar`) to enable OS keychain persistence, ' +
  'or pass a custom `backend` to `new KeychainTokenStorage({ backend })`.'

let _keytarPromise: Promise<KeychainBackend> | null = null
async function loadDefaultBackend(): Promise<KeychainBackend> {
  if (_keytarPromise) return _keytarPromise
  _keytarPromise = (async () => {
    try {
      // SAFETY: dynamic import via runtime-resolved specifier so tsc does not
      // require `keytar` types to be installed (it's an optional peer dep).
      const specifier = 'keytar'
      const mod: unknown = await import(/* @vite-ignore */ specifier)
      const candidate = (mod as { default?: unknown }).default ?? mod
      if (
        typeof (candidate as KeychainBackend).getPassword !== 'function' ||
        typeof (candidate as KeychainBackend).setPassword !== 'function' ||
        typeof (candidate as KeychainBackend).deletePassword !== 'function'
      ) {
        throw new Error('keytar module loaded but does not expose expected API')
      }
      return candidate as KeychainBackend
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`${KEYTAR_INSTALL_HINT} (load error: ${msg})`)
    }
  })()
  return _keytarPromise
}

/** Test-only: reset the cached keytar promise. Not part of the public API. */
export function __resetKeychainBackendCacheForTests(): void {
  _keytarPromise = null
}

export const DEFAULT_KEYCHAIN_SERVICE = 'picora-sdk'
export const DEFAULT_KEYCHAIN_ACCOUNT = 'default'

export class KeychainTokenStorage implements TokenStorage {
  readonly service: string
  readonly account: string
  private readonly _backend?: KeychainBackend

  constructor(options: KeychainTokenStorageOptions = {}) {
    this.service = options.service ?? DEFAULT_KEYCHAIN_SERVICE
    this.account = options.account ?? DEFAULT_KEYCHAIN_ACCOUNT
    if (options.backend) this._backend = options.backend
  }

  private async backend(): Promise<KeychainBackend> {
    return this._backend ?? (await loadDefaultBackend())
  }

  async get(): Promise<DeviceFlowToken | null> {
    const b = await this.backend()
    const raw = await b.getPassword(this.service, this.account)
    if (raw == null) return null

    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return null
    }
    if (typeof data !== 'object' || data === null) return null
    const d = data as Record<string, unknown>
    if (typeof d.accessToken !== 'string') return null

    const scopes = Array.isArray(d.scopes)
      ? d.scopes.filter((s): s is string => typeof s === 'string')
      : []

    return {
      accessToken: d.accessToken,
      tokenType: 'Bearer',
      expiresAt: typeof d.expiresAt === 'number' ? d.expiresAt : 0,
      scopes,
      ...(typeof d.refreshToken === 'string' ? { refreshToken: d.refreshToken } : {}),
    }
  }

  async put(token: DeviceFlowToken): Promise<void> {
    const b = await this.backend()
    await b.setPassword(this.service, this.account, JSON.stringify(token))
  }

  async clear(): Promise<void> {
    const b = await this.backend()
    // keytar returns false when nothing to delete; we treat that as no-op success
    await b.deletePassword(this.service, this.account)
  }
}
