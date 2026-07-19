/**
 * v0.3.0 docs/KB 域批次 —— docs / kbs(含 conflicts 子命名空间)/ collections.manifest 测试。
 *
 * 覆盖:
 *   docs(9):list query 映射 + items 归一、create JSON body、get URL、update kbId=null、
 *     delete hard query、batchDelete body + hard、raw 纯文本专项、raw:batch 路径冒号专项、
 *     batchMove body
 *   docs.revisions(3):list URL + totalBytes、get 两段路径、restore POST + duplicate
 *   kbs(10):list、create body、get URL、update body、delete cascade、
 *     manifest 200(query/协议头/ETag/tombstones 归一)专项、manifest 304→null 专项、
 *     sync ops 批量 body 专项、deleteTree prefix、raw 纯文本 + path 编码专项
 *   kbs.conflicts(4):list query、create body、accept URL、discard DELETE
 *   collections(1):manifest version=3 固定携带 + 分页参数
 */
import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client.js'
import type { DocItem, Kb, KbConflictBranch } from '../types/index.js'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock as unknown as typeof fetch })
}

function makeDoc(id: string): DocItem {
  return {
    id,
    title: 'Welcome',
    filename: 'welcome.md',
    sizeBytes: 1024,
    wordCount: 200,
    imageCount: 0,
    rewrittenCount: 0,
    isPublic: true,
    tags: [],
    coverUrl: null,
    hasInlineContent: true,
    kbId: null,
    relativePath: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

function makeKb(id: string): Kb {
  return {
    id,
    name: '研究笔记',
    slug: 'research-notes',
    description: null,
    docCount: 42,
    sizeBytes: 102400,
    isDefault: false,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

const DOC_ID = 'V1StGXR8_Z5jdHi6B-myT'
const KB_ID = 'KkVO6hcQTwBXgPTvb-_uE'
const REV_ID = 'Rk9MR2PQ7vB01234567ab'
const BRANCH_ID = 'Br9MR2PQ7vB01234567cd'

// ────────────────────────── docs ──────────────────────────

describe('@picora/sdk docs/KB 域 — docs namespace', () => {
  it('D1: list 携带 kbId/prefix/limit query 并归一 items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { items: [makeDoc(DOC_ID)], nextCursor: null } }),
    )
    const client = makeClient(fetchMock)
    const page = await client.docs.list({ kbId: KB_ID, prefix: 'notes/', limit: 30 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/docs')
    expect(url).toContain(`kbId=${KB_ID}`)
    expect(url).toContain('prefix=notes%2F')
    expect(url).toContain('limit=30')
    expect(page.items).toHaveLength(1)
    expect(page.nextCursor).toBeNull()
    expect(page.hasMore).toBe(false)
  })

  it('D2: create 走 POST /v1/docs JSON body(非 multipart)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeDoc(DOC_ID) }, 201))
    const client = makeClient(fetchMock)
    await client.docs.create({
      filename: 'welcome.md',
      content: '# Hello\n\nWorld',
      isPublic: false,
      kbId: KB_ID,
      relativePath: 'notes/welcome.md',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/docs')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({
      filename: 'welcome.md',
      content: '# Hello\n\nWorld',
      isPublic: false,
      kbId: KB_ID,
      relativePath: 'notes/welcome.md',
    })
  })

  it('D3: get 拼接文档 ID 路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeDoc(DOC_ID) }))
    const client = makeClient(fetchMock)
    const doc = await client.docs.get(DOC_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/docs/${DOC_ID}`)
    expect(doc.id).toBe(DOC_ID)
  })

  it('D4: update PATCH 支持 kbId=null(移出 KB),未提供字段不上送', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeDoc(DOC_ID) }))
    const client = makeClient(fetchMock)
    await client.docs.update(DOC_ID, { title: '新标题', kbId: null })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: '新标题', kbId: null })
  })

  it('D5: delete hard=true 走 query 参数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null }))
    const client = makeClient(fetchMock)
    await client.docs.delete(DOC_ID, { hard: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(String(url)).toContain(`/v1/docs/${DOC_ID}`)
    expect(String(url)).toContain('hard=true')
  })

  it('D6: batchDelete 走 DELETE /v1/docs + body ids + hard query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { deleted: 2, failed: 0 } }))
    const client = makeClient(fetchMock)
    const result = await client.docs.batchDelete({ ids: [DOC_ID, REV_ID], hard: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(String(url)).toContain('hard=true')
    expect(JSON.parse(init.body as string)).toEqual({ ids: [DOC_ID, REV_ID] })
    expect(result).toEqual({ deleted: 2, failed: 0 })
  })

  it('D7: raw 以 text 模式返回 Markdown 纯文本 string(非 JSON 解析)', async () => {
    const markdown = '# Hello World\n\n{"not":"parsed as json"}'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(markdown, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      }),
    )
    const client = makeClient(fetchMock)
    const content = await client.docs.raw(DOC_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/docs/${DOC_ID}/raw`)
    expect(typeof content).toBe('string')
    expect(content).toBe(markdown)
  })

  it('D8: rawBatch 路径中的冒号原样保留(/v1/docs/raw:batch 不做 encode)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          docs: [{ id: DOC_ID, content: '# A', updatedAt: '2026-07-19T00:00:00.000Z', sourceHash: 'a'.repeat(64) }],
          failed: [{ id: REV_ID, reason: 'NOT_FOUND' }],
        },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.docs.rawBatch({ ids: [DOC_ID, REV_ID] })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/docs/raw:batch')
    expect(String(url)).not.toContain('raw%3Abatch')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ids: [DOC_ID, REV_ID] })
    expect(result.docs[0]?.content).toBe('# A')
    expect(result.failed[0]?.reason).toBe('NOT_FOUND')
  })

  it('D9: batchMove 支持 kbId=null(批量移出合集)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { moved: [DOC_ID], failed: [] } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.docs.batchMove({ ids: [DOC_ID], kbId: null })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/docs/batch-move')
    expect(JSON.parse(init.body as string)).toEqual({ ids: [DOC_ID], kbId: null })
    expect(result.moved).toEqual([DOC_ID])
  })
})

describe('@picora/sdk docs/KB 域 — docs.revisions 子命名空间', () => {
  it('R1: revisions.list URL 正确并解析 revisions + totalBytes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          revisions: [
            { id: REV_ID, revNumber: 3, sizeBytes: 20480, origin: 'sync', sourceHash: 'e'.repeat(64), createdAt: '2026-07-10T08:00:00.000Z' },
          ],
          totalBytes: 61440,
        },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.docs.revisions.list(DOC_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/docs/${DOC_ID}/revisions`)
    expect(result.revisions[0]?.revNumber).toBe(3)
    expect(result.totalBytes).toBe(61440)
  })

  it('R2: revisions.get 拼接 docId + revId 两段路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { id: REV_ID, revNumber: 2, sizeBytes: 10, origin: 'upload', sourceHash: 'f'.repeat(64), createdAt: '2026-07-10T08:00:00.000Z', content: '# 旧版本' },
      }),
    )
    const client = makeClient(fetchMock)
    const rev = await client.docs.revisions.get(DOC_ID, REV_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/docs/${DOC_ID}/revisions/${REV_ID}`)
    expect(rev.content).toBe('# 旧版本')
  })

  it('R3: revisions.restore 走 POST 且解析 duplicate 标记', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { ...makeDoc(DOC_ID), sourceHash: 'a'.repeat(64), duplicate: true } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.docs.revisions.restore(DOC_ID, REV_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/docs/${DOC_ID}/revisions/${REV_ID}/restore`)
    expect(init.method).toBe('POST')
    expect(result.duplicate).toBe(true)
  })
})

// ────────────────────────── kbs ──────────────────────────

describe('@picora/sdk docs/KB 域 — kbs namespace', () => {
  it('K1: list 携带 sort query 并归一 items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { items: [makeKb(KB_ID)], nextCursor: 'c2' } }),
    )
    const client = makeClient(fetchMock)
    const page = await client.kbs.list({ sort: 'name', limit: 10 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/kbs')
    expect(url).toContain('sort=name')
    expect(page.items[0]?.slug).toBe('research-notes')
    expect(page.hasMore).toBe(true)
  })

  it('K2: create 走 POST /v1/kbs + JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeKb(KB_ID) }, 201))
    const client = makeClient(fetchMock)
    await client.kbs.create({ name: '研究笔记', slug: 'research-notes' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/kbs')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: '研究笔记', slug: 'research-notes' })
  })

  it('K3: get 拼接 KB ID 路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeKb(KB_ID) }))
    const client = makeClient(fetchMock)
    const kb = await client.kbs.get(KB_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/kbs/${KB_ID}`)
    expect(kb.id).toBe(KB_ID)
  })

  it('K4: update PATCH 仅上送提供的字段', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeKb(KB_ID) }))
    const client = makeClient(fetchMock)
    await client.kbs.update(KB_ID, { isDefault: true })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ isDefault: true })
  })

  it('K5: delete cascade=true 走 query 参数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    await client.kbs.delete(KB_ID, { cascade: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(String(url)).toContain('cascade=true')
  })

  it('K6: manifest 200 透传 query 与协议头,提取 ETag,tombstones 缺省归一为 []', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: {
            kbId: KB_ID,
            items: [
              { relativePath: 'notes/idea.md', sourceHash: 'a'.repeat(64), sizeBytes: 1024, updatedAt: '2026-07-19T00:00:00.000Z', deletedAt: null },
            ],
            nextCursor: null,
            serverTime: '2026-07-19T12:00:00.000Z',
            protocolVersion: 2,
            // tombstones 故意缺省:SDK 应归一为空数组
          },
        },
        200,
        { ETag: 'W/"3f9c1a2b"' },
      ),
    )
    const client = makeClient(fetchMock)
    const manifest = await client.kbs.manifest(KB_ID, {
      since: '2026-07-01T00:00:00.000Z',
      limit: 200,
      version: '2',
      ifNoneMatch: 'W/"stale"',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/kbs/${KB_ID}/manifest`)
    expect(String(url)).toContain('since=')
    expect(String(url)).toContain('limit=200')
    const headers = init.headers as Record<string, string>
    expect(headers['Picora-Sync-Version']).toBe('2')
    expect(headers['If-None-Match']).toBe('W/"stale"')
    expect(manifest).not.toBeNull()
    expect(manifest?.etag).toBe('W/"3f9c1a2b"')
    expect(manifest?.items).toHaveLength(1)
    expect(manifest?.tombstones).toEqual([])
    expect(manifest?.protocolVersion).toBe(2)
    expect(manifest?.serverTime).toBe('2026-07-19T12:00:00.000Z')
  })

  it('K7: manifest 304 Not Modified 返回 null(条件请求命中)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 304, headers: { ETag: 'W/"3f9c1a2b"' } }),
    )
    const client = makeClient(fetchMock)
    const manifest = await client.kbs.manifest(KB_ID, { ifNoneMatch: 'W/"3f9c1a2b"' })
    expect(manifest).toBeNull()
  })

  it('K8: sync 上送 { ops } 批量 body(upsert + delete + move 三态)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          applied: [{ op: 'upsert', relativePath: 'notes/a.md', id: DOC_ID, updatedAt: '2026-07-19T00:00:00.000Z', sourceHash: 'a'.repeat(64) }],
          conflicts: [{ op: 'delete', relativePath: 'notes/b.md', reason: 'BASE_MISSING', remote: null }],
          skipped: [],
          serverTime: '2026-07-19T12:00:00.000Z',
        },
      }),
    )
    const client = makeClient(fetchMock)
    const ops = [
      { op: 'upsert' as const, relativePath: 'notes/a.md', content: '# A', sourceHash: 'a'.repeat(64) },
      { op: 'delete' as const, relativePath: 'notes/b.md' },
      { op: 'move' as const, fromPath: 'notes/c.md', toPath: 'archive/c.md', baseUpdatedAt: '2026-07-18T00:00:00.000Z' },
    ]
    const result = await client.kbs.sync(KB_ID, { ops })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/kbs/${KB_ID}/sync`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ ops })
    expect(result.applied).toHaveLength(1)
    expect(result.conflicts[0]?.reason).toBe('BASE_MISSING')
    expect(result.serverTime).toBe('2026-07-19T12:00:00.000Z')
  })

  it('K9: deleteTree 上送 prefix query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { deleted: 200, hasMore: true } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.kbs.deleteTree(KB_ID, { prefix: '.claude/' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(String(url)).toContain(`/v1/kbs/${KB_ID}/tree`)
    expect(String(url)).toContain('prefix=.claude%2F')
    expect(result).toEqual({ deleted: 200, hasMore: true })
  })

  it('K10: raw 以 text 模式返回纯文本,path 走 query 并编码', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('# Hello\n\nContent here...', {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'X-Source-Hash': 'a'.repeat(64) },
      }),
    )
    const client = makeClient(fetchMock)
    const content = await client.kbs.raw(KB_ID, { path: 'notes/2026/04/idea.md' })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/v1/kbs/${KB_ID}/raw`)
    expect(url).toContain('path=notes%2F2026%2F04%2Fidea.md')
    expect(typeof content).toBe('string')
    expect(content).toBe('# Hello\n\nContent here...')
  })
})

// ────────────────────────── kbs.conflicts ──────────────────────────

describe('@picora/sdk docs/KB 域 — kbs.conflicts 子命名空间', () => {
  const branch: KbConflictBranch = {
    id: BRANCH_ID,
    docId: DOC_ID,
    baseSourceHash: 'a'.repeat(64),
    branchContent: '# Conflict version',
    status: 'pending',
    clientId: 'moraya-web-desktop',
    createdAt: '2026-07-19T00:00:00.000Z',
  }

  it('CF1: list 携带 status query 并拆封 items 数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { items: [branch] } }))
    const client = makeClient(fetchMock)
    const items = await client.kbs.conflicts.list(KB_ID, { status: 'pending' })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/v1/kbs/${KB_ID}/conflicts`)
    expect(url).toContain('status=pending')
    expect(items).toHaveLength(1)
    expect(items[0]?.status).toBe('pending')
  })

  it('CF2: create POST 上送 docId/baseSourceHash/branchContent/clientId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: branch }, 201))
    const client = makeClient(fetchMock)
    await client.kbs.conflicts.create(KB_ID, {
      docId: DOC_ID,
      baseSourceHash: 'a'.repeat(64),
      branchContent: '# Conflict version',
      clientId: 'moraya-web-desktop',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/kbs/${KB_ID}/conflicts`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      docId: DOC_ID,
      baseSourceHash: 'a'.repeat(64),
      branchContent: '# Conflict version',
      clientId: 'moraya-web-desktop',
    })
  })

  it('CF3: accept POST 拼接 /conflicts/{branchId}/accept 路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: DOC_ID, updatedAt: '2026-07-19T01:00:00.000Z', sourceHash: 'b'.repeat(64) } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.kbs.conflicts.accept(KB_ID, { branchId: BRANCH_ID })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/kbs/${KB_ID}/conflicts/${BRANCH_ID}/accept`)
    expect(init.method).toBe('POST')
    expect(result.updatedAt).toBe('2026-07-19T01:00:00.000Z')
  })

  it('CF4: discard 走 DELETE /conflicts/{branchId}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: BRANCH_ID, status: 'discarded' } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.kbs.conflicts.discard(KB_ID, { branchId: BRANCH_ID })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/kbs/${KB_ID}/conflicts/${BRANCH_ID}`)
    expect(init.method).toBe('DELETE')
    expect(result.status).toBe('discarded')
  })
})

// ────────────────────────── collections.manifest ──────────────────────────

describe('@picora/sdk docs/KB 域 — collections.manifest(v3 多资源清单)', () => {
  it('CM1: manifest 固定携带 version=3 并透传分页参数', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          protocolVersion: 3,
          collectionId: KB_ID,
          items: [
            { resourceType: 'doc', id: DOC_ID, name: 'notes/idea.md', sourceHash: 'a'.repeat(64), sizeBytes: 1024, updatedAt: '2026-07-19T00:00:00.000Z' },
            { resourceType: 'image', id: 'xK9mR2pQ7vB', name: 'cover.jpg', sourceHash: null, sizeBytes: 2048, updatedAt: '2026-07-19T00:00:00.000Z' },
          ],
          counts: { doc: 1, image: 1, video: 0, audio: 0, total: 2 },
          nextCursor: null,
          serverTime: '2026-07-19T12:00:00.000Z',
        },
      }),
    )
    const client = makeClient(fetchMock)
    const manifest = await client.collections.manifest(KB_ID, { cursor: 'c1', limit: 500 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/v1/collections/${KB_ID}/manifest`)
    expect(url).toContain('version=3')
    expect(url).toContain('cursor=c1')
    expect(url).toContain('limit=500')
    expect(manifest.protocolVersion).toBe(3)
    expect(manifest.counts.total).toBe(2)
    expect(manifest.items[1]?.resourceType).toBe('image')
  })
})
