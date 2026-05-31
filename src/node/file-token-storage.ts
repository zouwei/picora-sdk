/**
 * v0.65 PR-J：Node.js 专用 `FileTokenStorage` —— Device Flow token 持久化到本地文件。
 *
 * 该模块通过 `@picora/sdk/node` 子路径导出（package.json `exports`），
 * 主入口 `@picora/sdk` 不会引入 `node:fs/promises`，
 * 保持 SDK 在 Browser / CF Workers / Bun 等环境下的 zero-fs 假设。
 *
 * 行为对齐 `picora_sdk.FileTokenStorage`（Python v0.2.1）：
 *   - 默认路径 `~/.picora/token.json`
 *   - 原子写：tmp → rename
 *   - POSIX 写入后 chmod 0600；Windows / 不支持 chmod 时静默
 *   - 读失败（缺文件 / JSON 损坏 / 字段缺失）一律返回 null
 *
 * @example
 *   import { startDeviceFlow } from '@picora/sdk'
 *   import { FileTokenStorage } from '@picora/sdk/node'
 *
 *   const storage = new FileTokenStorage()           // ~/.picora/token.json
 *   let token = await storage.get()
 *   if (!token || token.expiresAt < Date.now() / 1000 + 60) {
 *     const flow = await startDeviceFlow({ clientId: 'cli_x', scopes: ['collection.read'] })
 *     console.log(`Visit ${flow.verificationUri} and enter ${flow.userCode}`)
 *     token = await flow.poll()
 *     await storage.put(token)
 *   }
 */

import { mkdir, chmod, rename, readFile, writeFile, unlink } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

import type { DeviceFlowToken, TokenStorage } from '../device-flow'

export const DEFAULT_TOKEN_PATH = '~/.picora/token.json'

function expandTilde(p: string): string {
  if (p === '~' || p.startsWith('~/')) {
    return join(homedir(), p.slice(2))
  }
  return p
}

function isFsErr(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === code
  )
}

export class FileTokenStorage implements TokenStorage {
  readonly path: string

  constructor(path: string = DEFAULT_TOKEN_PATH) {
    this.path = resolve(expandTilde(path))
  }

  async get(): Promise<DeviceFlowToken | null> {
    let raw: string
    try {
      raw = await readFile(this.path, 'utf-8')
    } catch (err) {
      // 缺文件 / 无权限 / 其他 IO 错误 → 一律视为"无 token"
      if (isFsErr(err, 'ENOENT')) return null
      return null
    }
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
    await mkdir(dirname(this.path), { recursive: true })

    const payload = JSON.stringify(token, null, 2)
    const tmpName = `.token-${randomBytes(6).toString('hex')}.tmp`
    const tmpPath = join(dirname(this.path), tmpName)

    try {
      await writeFile(tmpPath, payload, { encoding: 'utf-8', mode: 0o600 })
      try {
        // 二次 chmod —— writeFile 的 mode 在某些 umask 下可能被覆盖
        await chmod(tmpPath, 0o600)
      } catch {
        // 非 POSIX / 不支持 chmod，静默
      }
      await rename(tmpPath, this.path)
    } catch (err) {
      // 清理残留 tmp（不阻塞错误冒泡）
      unlink(tmpPath).catch(() => {})
      throw err
    }
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.path)
    } catch (err) {
      if (isFsErr(err, 'ENOENT')) return
      throw err
    }
  }
}

// 便于消费者获得一个独立的 tmpdir 路径用于测试 / 隔离
export function tempTokenPath(prefix = 'picora-test'): string {
  return join(tmpdir(), `${prefix}-${randomBytes(4).toString('hex')}.json`)
}
