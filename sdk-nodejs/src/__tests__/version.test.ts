import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { SDK_VERSION } from '../version.js'

/**
 * 版本号单一来源对账:src/version.ts 的 SDK_VERSION 必须与 package.json 一致。
 * 历史教训:0.2.x 时 client.ts 内常量('0.2.0')与 package.json('0.2.2')漂移,
 * User-Agent 上报了错误版本。发版流程:改 package.json → 同步改 version.ts → tag。
 */

describe('SDK_VERSION', () => {
  it('matches package.json version', () => {
    const pkgUrl = new URL('../../package.json', import.meta.url)
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf-8')) as { version: string }
    expect(SDK_VERSION).toBe(pkg.version)
  })
})
