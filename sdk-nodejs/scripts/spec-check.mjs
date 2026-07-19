/**
 * spec:check — vendored 契约快照新鲜度检查。
 *
 * 比对 spec/openapi-public.json 与 ../picora-assets/docs/api/openapi.json:
 *   - 本地多仓工作区(源可达)且不一致 → exit 1,提示先跑 pnpm spec:sync(硬检)
 *   - 源不可达(GitHub CI 等隔离环境)   → 打印 warning 后 exit 0(软通过)
 *   - --require                          → 源必须可达,不可达即失败(本地发版前用)
 *
 * 说明:picora-sdk 与 picora-service/picora-assets 的 CI 互不可达,vendored 快照
 * 即 CI 中的事实源;跨仓新鲜度靠本脚本(本地流程)+ CLAUDE.md 三段式同步链规范约束。
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendoredPath = resolve(repoRoot, 'spec/openapi-public.json')
// sdk-nodejs 是 picora-sdk 仓库的语言子目录,契约归档在上两级的 picora-assets
const upstreamPath = resolve(repoRoot, '../../picora-assets/docs/api/openapi.json')
const requireUpstream = process.argv.includes('--require')

if (!existsSync(vendoredPath)) {
  console.error('✗ spec/openapi-public.json 不存在 — 请运行 pnpm spec:sync')
  process.exit(1)
}

if (!existsSync(upstreamPath)) {
  if (requireUpstream) {
    console.error(`✗ --require 模式下找不到上游契约归档:${upstreamPath}`)
    process.exit(1)
  }
  console.warn('⚠ 上游契约归档不可达(非本地多仓工作区,例如 GitHub CI),跳过新鲜度比对。')
  console.warn('  CI 中以 vendored 快照为事实源;本地提交前请执行 pnpm spec:check 硬检。')
  process.exit(0)
}

// 语义级比对(JSON 结构 deep-equal),对格式差异(缩进/键序保持一致的前提下即字节等价)不敏感
const vendored = JSON.parse(readFileSync(vendoredPath, 'utf-8'))
const upstream = JSON.parse(readFileSync(upstreamPath, 'utf-8'))

if (JSON.stringify(vendored) === JSON.stringify(upstream)) {
  console.log('✓ spec/openapi-public.json 与 picora-assets 契约归档一致')
  process.exit(0)
}

console.error('✗ spec/openapi-public.json 与 picora-assets/docs/api/openapi.json 不一致(快照过期)')
console.error('  请执行:pnpm spec:sync,随后运行 pnpm test 让 openapi-coverage 门禁驱动 SDK 同步。')
process.exit(1)
