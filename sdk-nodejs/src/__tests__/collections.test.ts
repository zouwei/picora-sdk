/**
 * v0.61.4 PR4-A：@picora/sdk v0.2.0 — collections / collectionTypes / episodes 命名空间测试。
 *
 * 覆盖（18 case）：
 *   集合 CRUD（5）：
 *     C1 list 默认无 type/kbType 参数
 *     C2 list 含 type=tv_series 走 query string
 *     C3 get 拼接路径正确
 *     C4 create POST + JSON body
 *     C5 delete 不带 cascade
 *     C6 delete 带 cascade=true
 *   类型字典（3）：
 *     T1 list 拆封 { items: [...] } 数组（取消 envelope）
 *     T2 list 服务端返回纯数组也兼容
 *     T3 create POST /v1/collection-types
 *   剧集 + sync（10）：
 *     E1 list 含 status=ready
 *     E2 get 拼路径
 *     E3 create POST
 *     E4 update PATCH
 *     E5 delete
 *     E6 sync POST 含 idempotencyKey
 *     E7 sync 响应解析 applied[] + 三态计数
 *     E8 sync POST URL 含 collection + episode 两段
 *     E9 sync 错误（404 EPISODE_NOT_FOUND）转换为 PicoraApiError
 *     E10 sync skipped/failed 状态正确返回到 caller
 */
import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client.js'
import { PicoraApiError } from '../errors.js'
import type {
  Collection,
  CollectionType_Item,
  Episode,
  EpisodeSyncResult,
  PaginatedResponse,
} from '../types/index.js'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function emptyResponse(status: number): Response {
  return new Response(null, { status })
}

describe('@picora/sdk v0.2.0 — collections namespace', () => {
  it('C1: list with no params hits /v1/collections without query string', async () => {
    const payload: PaginatedResponse<Collection> = { items: [], nextCursor: null, hasMore: false }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: payload }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.collections.list()
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/collections')
    expect(url).not.toContain('type=')
    expect(url).not.toContain('kbType=')
  })

  it('C2: list with type=tv_series adds query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { items: [], nextCursor: null, hasMore: false } }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.collections.list({ type: 'tv_series', limit: 30 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('type=tv_series')
    expect(url).toContain('limit=30')
  })

  it('C3: get encodes id in path', async () => {
    const col: Collection = makeCollection('col_aaaaaaaaaaaaaaaaa')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: col }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const result = await client.collections.get('col_aaaaaaaaaaaaaaaaa')
    expect(result).toEqual(col)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/collections/col_aaaaaaaaaaaaaaaaa')
  })

  it('C4: create POSTs JSON body + Content-Type', async () => {
    const col: Collection = makeCollection('col_new_xxxxxxxxxxxxxxxx')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: col }, 201))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.collections.create({
      name: 'My TV',
      collectionType: 'tv_series',
      allowedResourceTypes: ['video', 'audio', 'doc'],
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body as string) as { collectionType: string }
    expect(body.collectionType).toBe('tv_series')
  })

  it('C5: delete without cascade hits DELETE without cascade query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'col_x' } }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.collections.delete('col_aaaaaaaaaaaaaaaaa')
    const url = String(fetchMock.mock.calls[0]?.[0])
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('DELETE')
    expect(url).not.toContain('cascade')
  })

  it('C6: delete with cascade=true adds query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'col_x' } }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.collections.delete('col_aaaaaaaaaaaaaaaaa', { cascade: true })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('cascade=true')
  })
})

describe('@picora/sdk v0.2.0 — collectionTypes namespace', () => {
  it('T1: list unwraps { items: [...] } envelope', async () => {
    const items: CollectionType_Item[] = [
      {
        id: 'sct_kb',
        ownerId: null,
        name: '知识库',
        slug: 'knowledge_base',
        allowedResourceTypes: ['doc', 'image'],
        icon: 'book-open',
        description: null,
        sortOrder: 10,
        isBuiltin: true,
        createdAt: '2026-05-30T00:00:00.000Z',
      },
    ]
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { items } }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const result = await client.collectionTypes.list()
    expect(result).toEqual(items)
  })

  it('T2: list tolerates raw array fallback', async () => {
    const items: CollectionType_Item[] = []
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: items }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const result = await client.collectionTypes.list()
    expect(result).toEqual([])
  })

  it('T3: create POSTs /v1/collection-types', async () => {
    const created: CollectionType_Item = {
      id: 'sct_user_001',
      ownerId: 'user_xxx',
      name: 'My',
      slug: 'my_custom',
      allowedResourceTypes: ['doc'],
      icon: null,
      description: null,
      sortOrder: 1000,
      isBuiltin: false,
      createdAt: '2026-05-30T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: created }, 201))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const result = await client.collectionTypes.create({
      name: 'My',
      slug: 'my_custom',
      allowedResourceTypes: ['doc'],
    })
    expect(result.isBuiltin).toBe(false)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/collection-types')
  })
})

describe('@picora/sdk v0.2.0 — episodes namespace', () => {
  const collectionId = 'col_aaaaaaaaaaaaaaaaa'
  const episodeId = 'ep_bbbbbbbbbbbbbbbbbb'

  it('E1: list with status=ready adds query', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: { items: [], nextCursor: null, hasMore: false } }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.episodes.list(collectionId, { status: 'ready', limit: 20 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/v1/collections/${collectionId}/episodes`)
    expect(url).toContain('status=ready')
  })

  it('E2: get builds nested path', async () => {
    const ep = makeEpisode(episodeId, collectionId)
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: ep }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const result = await client.episodes.get(collectionId, episodeId)
    expect(result).toEqual(ep)
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/v1/collections/${collectionId}/episodes/${episodeId}`)
  })

  it('E3: create POSTs episode under collection', async () => {
    const ep = makeEpisode(episodeId, collectionId)
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: ep }, 201))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.episodes.create(collectionId, { sequenceNo: 1, title: 'EP01' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as { sequenceNo: number; title: string }
    expect(body.sequenceNo).toBe(1)
    expect(body.title).toBe('EP01')
  })

  it('E4: update PATCH passes partial', async () => {
    const ep = makeEpisode(episodeId, collectionId, { status: 'ready' })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: ep }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.episodes.update(collectionId, episodeId, { status: 'ready' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
  })

  it('E5: delete returns void (204 path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(204))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await expect(client.episodes.delete(collectionId, episodeId)).resolves.toBeUndefined()
  })

  it('E6: sync POSTs body with idempotencyKey', async () => {
    const result: EpisodeSyncResult = {
      episodeId,
      collectionId,
      applied: [],
      appliedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      totalCount: 0,
      syncedAt: '2026-05-30T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: result }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.episodes.sync(collectionId, episodeId, {
      idempotencyKey: 'ai-batch-001',
      assets: [{ resourceType: 'video', resourceId: 'vid_xxx_yyyy_zzz' }],
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(init.body as string) as { idempotencyKey: string }
    expect(body.idempotencyKey).toBe('ai-batch-001')
  })

  it('E7: sync response is fully unwrapped to caller', async () => {
    const result: EpisodeSyncResult = {
      episodeId,
      collectionId,
      applied: [
        { resourceType: 'video', resourceId: 'vid_xxx_yyy_zzz', status: 'applied' },
        {
          resourceType: 'doc',
          resourceId: 'doc_dup_xxxxxxx',
          status: 'skipped_duplicate',
          reason: 'source_hash_matched',
        },
      ],
      appliedCount: 1,
      skippedCount: 1,
      failedCount: 0,
      totalCount: 2,
      syncedAt: '2026-05-30T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: result }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const out = await client.episodes.sync(collectionId, episodeId, {
      assets: [{ resourceType: 'video', resourceId: 'vid_xxx_yyy_zzz' }],
    })
    expect(out.appliedCount).toBe(1)
    expect(out.skippedCount).toBe(1)
    expect(out.applied[0]?.status).toBe('applied')
    expect(out.applied[1]?.reason).toBe('source_hash_matched')
  })

  it('E8: sync URL contains both collection and episode segments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          episodeId,
          collectionId,
          applied: [],
          appliedCount: 0,
          skippedCount: 0,
          failedCount: 0,
          totalCount: 0,
          syncedAt: 't',
        },
      }),
    )
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    await client.episodes.sync(collectionId, episodeId, {
      assets: [{ resourceType: 'audio', resourceId: 'aud_xxxxxxxxxxx' }],
    })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain(`/v1/collections/${collectionId}/episodes/${episodeId}/sync`)
  })

  it('E9: 404 EPISODE_NOT_FOUND becomes PicoraApiError(404, EPISODE_NOT_FOUND)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { success: false, error: 'Episode not found', code: 'EPISODE_NOT_FOUND' },
        404,
      ),
    )
    const client = createPicoraClient({
      apiKey: 'sk_live_x',
      fetch: fetchMock,
      retryOnRateLimit: false,
      retryOnServerError: false,
    })
    await expect(
      client.episodes.sync(collectionId, episodeId, {
        assets: [{ resourceType: 'video', resourceId: 'vid_xxxxxxxxxxx' }],
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: 'EPISODE_NOT_FOUND',
    })
  })

  it('E10: caller observes skipped + failed asset entries with reasons', async () => {
    const result: EpisodeSyncResult = {
      episodeId,
      collectionId,
      applied: [
        { resourceType: 'video', resourceId: 'vid_fail', status: 'failed', reason: 'forbidden' },
        {
          resourceType: 'doc',
          resourceId: 'doc_dup',
          status: 'skipped_duplicate',
          reason: 'natural_key_matched',
        },
      ],
      appliedCount: 0,
      skippedCount: 1,
      failedCount: 1,
      totalCount: 2,
      syncedAt: '2026-05-30T00:00:00.000Z',
    }
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: result }))
    const client = createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock })
    const out = await client.episodes.sync(collectionId, episodeId, {
      assets: [
        { resourceType: 'video', resourceId: 'vid_fail' },
        { resourceType: 'doc', resourceId: 'doc_dup' },
      ],
    })
    expect(out.failedCount).toBe(1)
    expect(out.skippedCount).toBe(1)
    expect(out.applied[0]?.reason).toBe('forbidden')
    expect(out.applied[1]?.status).toBe('skipped_duplicate')
  })
})

// ──────────────────────────────────────────────────────────────

function makeCollection(id: string): Collection {
  return {
    id,
    name: 'X',
    slug: 'x',
    collectionType: 'tv_series',
    allowedResourceTypes: ['video', 'audio', 'doc'],
    customTypeId: null,
    kbType: 'creator',
    description: null,
    docCount: 0,
    sizeBytes: 0,
    isDefault: false,
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
    deletedAt: null,
  }
}

function makeEpisode(
  id: string,
  collectionId: string,
  overrides: Partial<Episode> = {},
): Episode {
  return {
    id,
    collectionId,
    sequenceNo: 1,
    title: 'EP01',
    description: null,
    status: 'draft',
    coverImageId: null,
    assetCount: 0,
    sizeBytes: 0,
    createdAt: '2026-05-30T00:00:00.000Z',
    updatedAt: '2026-05-30T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

// Confirm PicoraApiError is importable in this test context
void PicoraApiError
