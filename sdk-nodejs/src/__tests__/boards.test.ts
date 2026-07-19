/**
 * boards 命名空间测试(v0.80.0 教学画板 .boardraw)。
 *
 * 覆盖(8 case):
 *   B1 create POST /v1/boards + JSON body(filename/content)
 *   B2 list 默认无 query,拆封 { items, nextCursor }
 *   B3 list 含 sort/isPublic/q 走 query string(isPublic 布尔 → 'true'/'false')
 *   B4 get 拼接路径正确
 *   B5 getRaw 走 /raw 且以 text 模式直返场景 JSON 字符串(不拆 envelope)
 *   B6 update PATCH + JSON body
 *   B7 delete 单删走 DELETE /v1/boards/{id}
 *   B8 batchDelete 走 DELETE /v1/boards + { ids },解析 deleted/failed
 */
import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client.js'
import type { Board } from '../types/index.js'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'application/json' } })
}

const BOARD_ID = 'V1StGXR8_Z5jdHi6B-myT'

function makeBoard(): Board {
  return {
    id: BOARD_ID,
    title: 'Lesson 3 board',
    filename: 'lesson-3.boardraw',
    sizeBytes: 2048,
    elementCount: 12,
    isPublic: false,
    tags: ['math'],
    hasInlineContent: true,
    createdAt: '2026-07-12T08:00:00.000Z',
    updatedAt: '2026-07-12T08:00:00.000Z',
  }
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock as unknown as typeof fetch })
}

describe('@picora/sdk — boards namespace', () => {
  it('B1: create 走 POST /v1/boards + {filename,content} body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: makeBoard() }, 201))
    const client = makeClient(fetchMock)
    const board = await client.boards.create({
      filename: 'lesson-3.boardraw',
      content: '{"type":"excalidraw","version":2,"elements":[]}',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/boards')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      filename: 'lesson-3.boardraw',
      content: '{"type":"excalidraw","version":2,"elements":[]}',
    })
    expect(board.id).toBe(BOARD_ID)
  })

  it('B2: list 默认无 query,拆封 { items, nextCursor }', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { items: [makeBoard()], nextCursor: null } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.boards.list()
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/boards')
    expect(url).not.toContain('sort=')
    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBeNull()
  })

  it('B3: list 含 sort/isPublic/q 走 query string(isPublic 布尔→字符串)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { items: [], nextCursor: null } }),
    )
    const client = makeClient(fetchMock)
    await client.boards.list({ sort: 'updated_desc', isPublic: true, q: 'physics' })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('sort=updated_desc')
    expect(url).toContain('isPublic=true')
    expect(url).toContain('q=physics')
  })

  it('B4: get 拼接路径正确', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: makeBoard() }))
    const client = makeClient(fetchMock)
    const board = await client.boards.get(BOARD_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/boards/${BOARD_ID}`)
    expect(init.method).toBe('GET')
    expect(board.filename).toBe('lesson-3.boardraw')
  })

  it('B5: getRaw 走 /raw 且直返场景 JSON 字符串(text 模式,不拆 envelope)', async () => {
    const scene = '{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}'
    const fetchMock = vi.fn().mockResolvedValue(textResponse(scene))
    const client = makeClient(fetchMock)
    const raw = await client.boards.getRaw(BOARD_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/boards/${BOARD_ID}/raw`)
    expect(init.method).toBe('GET')
    expect(raw).toBe(scene)
  })

  it('B6: update 走 PATCH /v1/boards/{id} + JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { ...makeBoard(), title: 'Updated title', isPublic: true } }),
    )
    const client = makeClient(fetchMock)
    const board = await client.boards.update(BOARD_ID, { title: 'Updated title', isPublic: true })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/boards/${BOARD_ID}`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Updated title', isPublic: true })
    expect(board.isPublic).toBe(true)
  })

  it('B7: delete 单删走 DELETE /v1/boards/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    await client.boards.delete(BOARD_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/boards/${BOARD_ID}`)
    expect(init.method).toBe('DELETE')
  })

  it('B8: batchDelete 走 DELETE /v1/boards + { ids },解析 deleted/failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, data: { deleted: [BOARD_ID], failed: [] } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.boards.batchDelete([BOARD_ID])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/boards')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ ids: [BOARD_ID] })
    expect(result.deleted).toEqual([BOARD_ID])
    expect(result.failed).toHaveLength(0)
  })
})
