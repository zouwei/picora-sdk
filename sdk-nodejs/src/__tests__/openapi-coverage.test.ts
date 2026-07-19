import { readFileSync } from 'node:fs'
import { describe, it, expect, beforeAll } from 'vitest'
import { COVERAGE_MANIFEST } from '../coverage/manifest.js'
import { KNOWN_GAP } from '../coverage/known-gap.js'
import { EXCLUDED_OPERATIONS } from '../coverage/excluded.js'

/**
 * OpenAPI 覆盖率双向硬门禁(v0.3.0,v0.82.0 迭代核心)。
 *
 * 比对 spec/openapi-public.json(vendored 契约快照,由 pnpm spec:sync 维护)与
 * SDK 方法注册表(coverage/manifest.ts 聚合的 *_COVERAGE 声明):
 *
 *   ① spec 有而 SDK 无(减 KNOWN_GAP / EXCLUDED 后)→ 红:新增公开 API 缺 SDK 覆盖
 *   ② SDK 有而 spec 无 → 红(零容忍,无台账):端点已删除(清理 SDK 方法)
 *      或 vendored 快照过期(先跑 pnpm spec:sync)
 *   ③ KNOWN_GAP 只减不增:已覆盖 / 已从 spec 消失的条目必须移除
 *   ④ EXCLUDED 防腐化:条目必须仍在 spec 且未被覆盖
 *   ⑤ manifest 无重复条目
 *
 * 路径归一化规则与 picora-service 的 openapi-drift.test.ts 逐字相同
 * ({xxx} → {}),保证两套门禁心智模型一致。
 */

/** 与 picora-service openapi-drift.test.ts 相同的结构归一化 */
function structural(path: string): string {
  return path.replace(/:[A-Za-z0-9_]+/g, '{}').replace(/\{[^}]+\}/g, '{}')
}

/** 'METHOD /path' → 归一化 key */
function structuralOp(op: string): string {
  const spaceIdx = op.indexOf(' ')
  return `${op.slice(0, spaceIdx)} ${structural(op.slice(spaceIdx + 1))}`
}

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options'])

let documented: Set<string>
let documentedRaw: string[]
let covered: Set<string>
let gap: Set<string>
let excluded: Set<string>

beforeAll(() => {
  const specUrl = new URL('../../spec/openapi-public.json', import.meta.url)
  const spec = JSON.parse(readFileSync(specUrl, 'utf-8')) as {
    paths: Record<string, Record<string, unknown>>
  }
  documentedRaw = []
  for (const [path, item] of Object.entries(spec.paths)) {
    for (const method of Object.keys(item)) {
      if (!HTTP_METHODS.has(method)) continue
      documentedRaw.push(`${method.toUpperCase()} ${path}`)
    }
  }
  documented = new Set(documentedRaw.map(structuralOp))
  covered = new Set(COVERAGE_MANIFEST.map((c) => structuralOp(`${c.method} ${c.path}`)))
  gap = new Set(KNOWN_GAP.map(structuralOp))
  excluded = new Set(EXCLUDED_OPERATIONS.map((e) => structuralOp(e.op)))
})

describe('@picora/sdk OpenAPI coverage guard', () => {
  it('① spec 中每个 operation 都有 SDK 覆盖(KNOWN_GAP / EXCLUDED 之外零新增)', () => {
    const missing = documentedRaw.filter((op) => {
      const key = structuralOp(op)
      return !covered.has(key) && !gap.has(key) && !excluded.has(key)
    })
    expect(
      missing,
      `以下公开 API 缺少 SDK 覆盖(新增端点不允许进 KNOWN_GAP,请直接实现并登记 *_COVERAGE):\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('② SDK 注册表没有 spec 之外的死方法(零容忍,无台账)', () => {
    const dead = COVERAGE_MANIFEST
      .filter((c) => !documented.has(structuralOp(`${c.method} ${c.path}`)))
      .map((c) => `${c.method} ${c.path} (${c.client})`)
    expect(
      dead,
      `以下 SDK 方法在 openapi-public.json 中不存在:可能是端点已删除(清理 SDK 方法与 COVERAGE 条目),或 vendored 快照过期(先跑 pnpm spec:sync):\n  ${dead.join('\n  ')}`,
    ).toEqual([])
  })

  it('③ KNOWN_GAP 台账保持最小(已覆盖 / 已消失的条目必须移除;只减不增)', () => {
    const stale = KNOWN_GAP.filter((op) => {
      const key = structuralOp(op)
      return covered.has(key) || !documented.has(key)
    })
    expect(
      stale,
      `以下 KNOWN_GAP 条目已过期(已被 SDK 覆盖或已从 spec 消失),请从 known-gap.ts 移除:\n  ${stale.join('\n  ')}`,
    ).toEqual([])
  })

  it('④ EXCLUDED 清单不腐化(条目须仍在 spec 且未被覆盖)', () => {
    const rotten = EXCLUDED_OPERATIONS.filter((e) => {
      const key = structuralOp(e.op)
      return !documented.has(key) || covered.has(key)
    }).map((e) => e.op)
    expect(
      rotten,
      `以下 EXCLUDED 条目已腐化(已从 spec 消失,或后来实现了 SDK 覆盖),请从 excluded.ts 移除:\n  ${rotten.join('\n  ')}`,
    ).toEqual([])
  })

  it('⑤ manifest 无重复条目(同一 operation 只登记一个规范入口)', () => {
    const seen = new Map<string, string>()
    const dupes: string[] = []
    for (const c of COVERAGE_MANIFEST) {
      const key = structuralOp(`${c.method} ${c.path}`)
      const prev = seen.get(key)
      if (prev !== undefined) {
        dupes.push(`${c.method} ${c.path}: ${prev} 与 ${c.client}`)
      } else {
        seen.set(key, c.client)
      }
    }
    expect(dupes, `manifest 重复登记:\n  ${dupes.join('\n  ')}`).toEqual([])
  })

  it('KNOWN_GAP / EXCLUDED 之间无交集', () => {
    const overlap = KNOWN_GAP.filter((op) => excluded.has(structuralOp(op)))
    expect(overlap).toEqual([])
  })
})
