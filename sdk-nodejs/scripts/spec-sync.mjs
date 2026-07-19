/**
 * spec:sync — 三段式契约同步链第 [3] 段:从 picora-assets 契约归档拉取公开契约,
 * 更新本仓库 vendored 快照 spec/openapi-public.json,并写 spec/SOURCE.md 记录来源。
 *
 * 同步链全貌(见 picora-assets/CLAUDE.md §4.4):
 *   [1] picora-service  apps/api/openapi.json(单一事实源)→ pnpm openapi:split
 *   [2] picora-assets   docs/api/openapi.json(公开契约归档,= openapi-public 内容)
 *   [3] picora-sdk      spec/openapi-public.json(vendored 快照,本脚本维护)
 *
 * 仅限本地多仓工作区执行(源仓库不可达时报错退出,防止静默漏同步)。
 * 快照入库后由 openapi-coverage.test.ts 驱动 SDK 方法补齐/清理。
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// sdk-nodejs 位于 picora-sdk 仓库的语言子目录,故契约归档在上两级的 picora-assets
const sourcePath = resolve(repoRoot, '../../picora-assets/docs/api/openapi.json')
const specDir = resolve(repoRoot, 'spec')
const targetPath = resolve(specDir, 'openapi-public.json')
const sourceMdPath = resolve(specDir, 'SOURCE.md')

if (!existsSync(sourcePath)) {
  console.error(`✗ 找不到契约归档:${sourcePath}`)
  console.error('  本脚本依赖本地多仓工作区布局(picora-assets 与 picora-sdk 同级)。')
  console.error('  若归档缺失,请先在 picora-service/apps/api 执行 pnpm openapi:sync-assets。')
  process.exit(1)
}

/** 统计 spec 的 path / operation 数,用于同步前后对比提示 */
function countSpec(path) {
  if (!existsSync(path)) return { paths: 0, operations: 0 }
  const spec = JSON.parse(readFileSync(path, 'utf-8'))
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])
  let operations = 0
  for (const item of Object.values(spec.paths ?? {})) {
    for (const method of Object.keys(item)) {
      if (methods.has(method)) operations += 1
    }
  }
  return { paths: Object.keys(spec.paths ?? {}).length, operations }
}

const before = countSpec(targetPath)
mkdirSync(specDir, { recursive: true })
copyFileSync(sourcePath, targetPath)
const after = countSpec(targetPath)

// 记录来源(picora-assets 当前 commit + 同步时间),便于追溯快照对应的契约版本
let assetsSha = 'unknown'
try {
  assetsSha = execSync('git rev-parse --short HEAD', {
    cwd: resolve(repoRoot, '../../picora-assets'),
    encoding: 'utf-8',
  }).trim()
} catch {
  // picora-assets 非 git 仓库或 git 不可用时不阻断同步
}

writeFileSync(
  sourceMdPath,
  [
    '# spec/openapi-public.json 来源记录',
    '',
    '本文件由 `pnpm spec:sync` 自动生成,请勿手工编辑。',
    '',
    `- 同步来源:\`picora-assets/docs/api/openapi.json\`(commit \`${assetsSha}\`)`,
    `- 同步时间:${new Date().toISOString()}`,
    `- 契约规模:${after.paths} paths / ${after.operations} operations`,
    '',
    '同步链:picora-service(openapi:split + openapi:sync-assets)→ picora-assets → 本仓库 spec:sync。',
    '',
  ].join('\n'),
  'utf-8',
)

console.log(`✓ spec/openapi-public.json 已更新(${after.paths} paths / ${after.operations} operations)`)
if (before.operations !== after.operations) {
  console.log(`  operation 数变化:${before.operations} → ${after.operations}`)
  console.log('  请运行 pnpm test 检查 openapi-coverage 门禁,补齐/清理对应 SDK 方法。')
}
