/**
 * v0.3.0 AIGC 域批次 —— aigc(projects / episodes / contents / assets / batchJobs /
 * templates / generate)+ aiTools + credit + agreements 测试。
 *
 * 覆盖:
 *   aigc.projects(7):list query 映射 + items 归一、create body、fromTemplate body、
 *     syncToOutput URL、createEpisode body、delete 204、tree URL
 *   aigc.episodes(4):get URL、update PATCH body、createContent body、listContents 拆封
 *   aigc.contents(2):update docId=null、listAssets URL + 拆封
 *   aigc.assets(4):list promptBlockHash query、promote URL、status 轮询 URL、
 *     delete/restore 方法与 URL
 *   aigc.batchJobs(2):get URL、cancel POST 专项
 *   aigc.generate 专项(3):同步形态(ready + imageUrl)、异步形态(pending 轮询提示)、
 *     retry:false(500 不自动重试)
 *   aigc.generateBatch(1):jobs body + 202 受理解析
 *   aigc.templates(2):items 包装与裸数组双形态、get URL
 *   aiTools(3):list 公开端点、invoke path 参数编码专项 + body、logs query
 *   credit(3):balance URL、ledger 游标分页归一 + reason query、topup body
 *   agreements(3):get URL、accept body、status URL
 */
import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client.js'
import type { AigcAsset, AigcEpisode, AiToolKey } from '../types/index.js'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock as unknown as typeof fetch })
}

const PROJECT_ID = 'V1StGXR8_Z5jdHi6B-myT'
const EPISODE_ID = 'Ep9MR2PQ7vB01234567ab'
const CONTENT_ID = 'Ct9MR2PQ7vB01234567cd'
const ASSET_ID = 'As9MR2PQ7vB01234567ef'
const BATCH_ID = 'Bj9MR2PQ7vB01234567gh'
const PROMPT_HASH = 'a'.repeat(64)

function makeEpisode(id: string): AigcEpisode {
  return {
    id,
    projectId: PROJECT_ID,
    sequenceNo: 1,
    title: 'EP01 — Pilot',
    status: 'draft',
    contentCount: 0,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
  }
}

function makeAsset(id: string): AigcAsset {
  return {
    id,
    contentId: CONTENT_ID,
    imageId: 'xK9mR2pQ7vB',
    promptBlockHash: PROMPT_HASH,
    promptYaml: 'model: flux-schnell\nprompt: girl in autumn forest',
    model: 'flux-schnell',
    costCents: 200,
    sequenceNo: 2,
    status: 'ready',
    failureReason: null,
    generatorProvider: 'replicate',
    generatorJobId: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    completedAt: '2026-07-19T00:00:05.000Z',
    isCurrent: false,
    promotedAt: null,
  }
}

// ────────────────────────── aigc.projects ──────────────────────────

describe('@picora/sdk AIGC 域 — aigc.projects 子命名空间', () => {
  it('P1: list 携带 type/status/cursor query 并归一 items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { items: [{ id: PROJECT_ID, userId: 'u1', name: '漫画计划', type: 'comic', status: 'active', createdAt: '2026-07-19T00:00:00.000Z' }], nextCursor: 'c2' } }),
    )
    const client = makeClient(fetchMock)
    const page = await client.aigc.projects.list({ type: 'comic', status: 'active', cursor: 'c1', limit: 50 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/aigc/projects')
    expect(url).toContain('type=comic')
    expect(url).toContain('status=active')
    expect(url).toContain('cursor=c1')
    expect(url).toContain('limit=50')
    expect(page.items[0]?.name).toBe('漫画计划')
    expect(page.hasMore).toBe(true)
  })

  it('P2: create 走 POST /v1/aigc/projects + JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: PROJECT_ID, userId: 'u1', name: '绘本', type: 'picturebook', status: 'active', createdAt: '2026-07-19T00:00:00.000Z' } }, 201),
    )
    const client = makeClient(fetchMock)
    await client.aigc.projects.create({ name: '绘本', type: 'picturebook', description: '睡前故事' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/aigc/projects')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: '绘本', type: 'picturebook', description: '睡前故事' })
  })

  it('P3: fromTemplate 走 POST /v1/aigc/projects/from-template + templateId/projectName body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: PROJECT_ID, userId: 'u1', name: '新项目', type: 'comic', status: 'active', createdAt: '2026-07-19T00:00:00.000Z' } }, 201),
    )
    const client = makeClient(fetchMock)
    await client.aigc.projects.fromTemplate({ templateId: 'tpl_comic_4koma', projectName: '新项目' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/aigc/projects/from-template')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ templateId: 'tpl_comic_4koma', projectName: '新项目' })
  })

  it('P4: syncToOutput 走 POST 并解析同步统计', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { docsUpdated: 8, assetsLinked: 24, warnings: [] } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.aigc.projects.syncToOutput(PROJECT_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/aigc/projects/${PROJECT_ID}/sync-to-output`)
    expect(init.method).toBe('POST')
    expect(result).toEqual({ docsUpdated: 8, assetsLinked: 24, warnings: [] })
  })

  it('P5: createEpisode 走 POST /projects/{id}/episodes + title/sequenceNo body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeEpisode(EPISODE_ID) }, 201))
    const client = makeClient(fetchMock)
    const ep = await client.aigc.projects.createEpisode(PROJECT_ID, { title: 'EP01 — Pilot', sequenceNo: 1 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/aigc/projects/${PROJECT_ID}/episodes`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'EP01 — Pilot', sequenceNo: 1 })
    expect(ep.id).toBe(EPISODE_ID)
  })

  it('P6: delete 走 DELETE 并容忍 204 空响应', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const client = makeClient(fetchMock)
    await expect(client.aigc.projects.delete(PROJECT_ID)).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('DELETE')
    expect(String(url)).toContain(`/v1/aigc/projects/${PROJECT_ID}`)
  })

  it('P7: tree 走 GET /projects/{id}/tree 并返回嵌套结构', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: PROJECT_ID, userId: 'u1', name: '漫画计划', type: 'comic', status: 'active', createdAt: '2026-07-19T00:00:00.000Z',
          episodes: [{ ...makeEpisode(EPISODE_ID), contents: [] }],
        },
      }),
    )
    const client = makeClient(fetchMock)
    const tree = await client.aigc.projects.tree(PROJECT_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/aigc/projects/${PROJECT_ID}/tree`)
    expect(tree.episodes?.[0]?.id).toBe(EPISODE_ID)
  })
})

// ────────────────────────── aigc.episodes / aigc.contents ──────────────────────────

describe('@picora/sdk AIGC 域 — aigc.episodes 子命名空间', () => {
  it('E1: get 拼接剧集 ID 路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeEpisode(EPISODE_ID) }))
    const client = makeClient(fetchMock)
    const ep = await client.aigc.episodes.get(EPISODE_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/aigc/episodes/${EPISODE_ID}`)
    expect(ep.projectId).toBe(PROJECT_ID)
  })

  it('E2: update PATCH 仅上送提供的字段', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { ...makeEpisode(EPISODE_ID), status: 'ready' } }))
    const client = makeClient(fetchMock)
    await client.aigc.episodes.update(EPISODE_ID, { status: 'ready' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ status: 'ready' })
  })

  it('E3: createContent 走 POST /episodes/{id}/contents + docId body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: CONTENT_ID, episodeId: EPISODE_ID, docId: 'D1StGXR8_Z5jdHi6B-myT', sequenceNo: 1, title: '第 1 格', promptCount: 0, assetCount: 0, status: 'draft', createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z' } }, 201),
    )
    const client = makeClient(fetchMock)
    await client.aigc.episodes.createContent(EPISODE_ID, { title: '第 1 格', docId: 'D1StGXR8_Z5jdHi6B-myT' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/aigc/episodes/${EPISODE_ID}/contents`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ title: '第 1 格', docId: 'D1StGXR8_Z5jdHi6B-myT' })
  })

  it('E4: listContents 拆封 items 数组(缺省归一为空数组)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: {} }))
    const client = makeClient(fetchMock)
    const items = await client.aigc.episodes.listContents(EPISODE_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/aigc/episodes/${EPISODE_ID}/contents`)
    expect(items).toEqual([])
  })
})

describe('@picora/sdk AIGC 域 — aigc.contents 子命名空间', () => {
  it('C1: update PATCH 支持 docId=null(解绑文档)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: CONTENT_ID, episodeId: EPISODE_ID, docId: null, sequenceNo: 1, title: '第 1 格', promptCount: 0, assetCount: 0, status: 'draft', createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z' } }),
    )
    const client = makeClient(fetchMock)
    await client.aigc.contents.update(CONTENT_ID, { docId: null, title: '第 1 格(改)' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/aigc/contents/${CONTENT_ID}`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ docId: null, title: '第 1 格(改)' })
  })

  it('C2: listAssets 走 GET /contents/{id}/assets 并拆封 items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { items: [makeAsset(ASSET_ID)] } }))
    const client = makeClient(fetchMock)
    const assets = await client.aigc.contents.listAssets(CONTENT_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/aigc/contents/${CONTENT_ID}/assets`)
    expect(assets[0]?.promptBlockHash).toBe(PROMPT_HASH)
  })
})

// ────────────────────────── aigc.assets / aigc.batchJobs ──────────────────────────

describe('@picora/sdk AIGC 域 — aigc.assets 子命名空间', () => {
  it('A1: list 上送必填 promptBlockHash query 并拆封 items', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { items: [makeAsset(ASSET_ID)] } }))
    const client = makeClient(fetchMock)
    const versions = await client.aigc.assets.list({ promptBlockHash: PROMPT_HASH })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/aigc/assets')
    expect(url).toContain(`promptBlockHash=${PROMPT_HASH}`)
    expect(versions).toHaveLength(1)
  })

  it('A2: promote 走 POST /assets/{id}/promote 并返回更新后资产', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { ...makeAsset(ASSET_ID), isCurrent: true, promotedAt: '2026-07-19T01:00:00.000Z' } }),
    )
    const client = makeClient(fetchMock)
    const asset = await client.aigc.assets.promote(ASSET_ID)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/aigc/assets/${ASSET_ID}/promote`)
    expect(init.method).toBe('POST')
    expect(asset.isCurrent).toBe(true)
  })

  it('A3: status 走 GET /assets/{id}/status(异步生成轮询)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { status: 'generating' } }),
    )
    const client = makeClient(fetchMock)
    const info = await client.aigc.assets.status(ASSET_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/aigc/assets/${ASSET_ID}/status`)
    expect(info.status).toBe('generating')
  })

  it('A4: delete 走 DELETE、restore 走 POST /restore', async () => {
    // 每次调用返回新 Response(同一 body 不能被消费两次)
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse({ success: true })))
    const client = makeClient(fetchMock)
    await client.aigc.assets.delete(ASSET_ID)
    await client.aigc.assets.restore(ASSET_ID)
    const [delUrl, delInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const [restoreUrl, restoreInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(delInit.method).toBe('DELETE')
    expect(String(delUrl)).toContain(`/v1/aigc/assets/${ASSET_ID}`)
    expect(restoreInit.method).toBe('POST')
    expect(String(restoreUrl)).toContain(`/v1/aigc/assets/${ASSET_ID}/restore`)
  })
})

describe('@picora/sdk AIGC 域 — aigc.batchJobs 子命名空间', () => {
  it('B1: get 走 GET /batch-jobs/{id} 并解析进度对象', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: BATCH_ID, total: 8, completed: 5, failed: 1, status: 'running', createdAt: '2026-07-19T00:00:00.000Z' } }),
    )
    const client = makeClient(fetchMock)
    const job = await client.aigc.batchJobs.get(BATCH_ID)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/v1/aigc/batch-jobs/${BATCH_ID}`)
    expect(job.completed).toBe(5)
  })

  it('B2: cancel 专项 — 走 POST /batch-jobs/{id}/cancel 且 resolve undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    await expect(client.aigc.batchJobs.cancel(BATCH_ID)).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain(`/v1/aigc/batch-jobs/${BATCH_ID}/cancel`)
    expect(init.method).toBe('POST')
  })
})

// ────────────────────────── aigc.generate / generateBatch ──────────────────────────

describe('@picora/sdk AIGC 域 — generate 双形态专项', () => {
  it('G1: 同步形态 — 202 status=ready 时 imageUrl 立即可用,body 上送 promptYaml/contentId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { assetId: ASSET_ID, status: 'ready', imageUrl: 'https://media.picora.me/xK9mR2pQ7vB.png', costCents: 200, balanceAfter: 9800 },
      }, 202),
    )
    const client = makeClient(fetchMock)
    const result = await client.aigc.generate({
      promptYaml: 'model: flux-schnell\nprompt: girl in autumn forest',
      contentId: CONTENT_ID,
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/aigc/generate')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      promptYaml: 'model: flux-schnell\nprompt: girl in autumn forest',
      contentId: CONTENT_ID,
    })
    expect(result.status).toBe('ready')
    // 判别联合:status='ready' 收窄后 imageUrl 为必有字段
    if (result.status === 'ready') {
      expect(result.imageUrl).toBe('https://media.picora.me/xK9mR2pQ7vB.png')
    }
    expect(result.balanceAfter).toBe(9800)
  })

  it('G2: 异步形态 — 202 status=pending 表示受理,须轮询 assets.status(assetId)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { assetId: ASSET_ID, status: 'pending', costCents: 500, balanceAfter: 9500 } }, 202),
    )
    const client = makeClient(fetchMock)
    const result = await client.aigc.generate({ promptYaml: 'model: flux-1.1-pro\nprompt: same girl in winter' })
    expect(result.status).toBe('pending')
    expect(result.assetId).toBe(ASSET_ID)
  })

  it('G3: 扣费保护 — generate 遇 5xx 不自动重试(fetch 仅调用一次)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ success: false, error: 'Internal server error' }, 500),
    )
    const client = makeClient(fetchMock)
    await expect(client.aigc.generate({ promptYaml: 'model: flux-schnell\nprompt: x' })).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('G4: generateBatch 上送 jobs/projectId body 并解析 202 受理对象', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { id: BATCH_ID, status: 'pending', total: 8, totalCostCents: 1600, createdAt: '2026-07-19T00:00:00.000Z' },
      }, 202),
    )
    const client = makeClient(fetchMock)
    const accepted = await client.aigc.generateBatch({
      jobs: [
        { promptYaml: 'model: flux-schnell\nprompt: a', count: 4 },
        { promptYaml: 'model: flux-1.1-pro\nprompt: b', count: 4, referenceImageUrl: 'https://media.picora.me/abc.jpg' },
      ],
      projectId: PROJECT_ID,
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/aigc/generate-batch')
    expect(JSON.parse(init.body as string)).toEqual({
      jobs: [
        { promptYaml: 'model: flux-schnell\nprompt: a', count: 4 },
        { promptYaml: 'model: flux-1.1-pro\nprompt: b', count: 4, referenceImageUrl: 'https://media.picora.me/abc.jpg' },
      ],
      projectId: PROJECT_ID,
    })
    expect(accepted.total).toBe(8)
    expect(accepted.status).toBe('pending')
  })
})

// ────────────────────────── aigc.templates ──────────────────────────

describe('@picora/sdk AIGC 域 — aigc.templates 子命名空间', () => {
  it('T1: list 携带 category/featuredOnly query,兼容 items 包装与裸数组双形态', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: { items: [{ id: 'tpl_1', name: '四格漫画' }] } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'tpl_2', name: '公众号长文' }] }))
    const client = makeClient(fetchMock)
    const wrapped = await client.aigc.templates.list({ category: 'comic', featuredOnly: true })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/aigc/templates')
    expect(url).toContain('category=comic')
    expect(url).toContain('featuredOnly=true')
    expect(wrapped[0]?.id).toBe('tpl_1')
    const bare = await client.aigc.templates.list()
    expect(bare[0]?.id).toBe('tpl_2')
  })

  it('T2: get 拼接模板 ID 路径', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { id: 'tpl_1', name: '四格漫画' } }))
    const client = makeClient(fetchMock)
    const tpl = await client.aigc.templates.get('tpl_1')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/aigc/templates/tpl_1')
    expect(tpl.id).toBe('tpl_1')
  })
})

// ────────────────────────── aiTools ──────────────────────────

describe('@picora/sdk AIGC 域 — aiTools namespace', () => {
  it('AT1: list 走 GET /v1/ai/tools 并拆封 data 数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ key: 'bg_remove', provider: 'replicate', model: 'rembg', costCents: 1, priceCents: 5, output: 'image', description: '抠图' }] }),
    )
    const client = makeClient(fetchMock)
    const tools = await client.aiTools.list()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/ai/tools')
    expect(tools[0]?.key).toBe('bg_remove')
  })

  it('AT2: invoke 专项 — tool 作为 path 参数经 encodeURIComponent 编码,body 上送 imageId/options', async () => {
    // 每次调用返回新 Response(本用例发两次请求,同一 body 不能被消费两次)
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(
      jsonResponse({ data: { logId: ASSET_ID, status: 'success', toolKey: 'smart_crop', costCents: 5, output: { type: 'image', imageId: 'xK9mR2pQ7vB' } } }, 202),
    ))
    const client = makeClient(fetchMock)
    const result = await client.aiTools.invoke('smart_crop', {
      imageId: 'xK9mR2pQ7vB',
      options: { aspectRatios: ['1:1', '16:9'] },
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/ai/smart_crop')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      imageId: 'xK9mR2pQ7vB',
      options: { aspectRatios: ['1:1', '16:9'] },
    })
    expect(result.status).toBe('success')

    // 恶意/异常 tool 值不能穿透路径结构(斜杠等一律被编码)
    await client.aiTools.invoke('ocr/../admin' as unknown as AiToolKey, { imageUrl: 'https://example.com/a.png' })
    const evilUrl = String(fetchMock.mock.calls[1]?.[0])
    expect(evilUrl).toContain('/v1/ai/ocr%2F..%2Fadmin')
    expect(evilUrl).not.toContain('/v1/ai/ocr/../admin')
  })

  it('AT3: logs 携带 tool/limit query 并拆封 data 数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ id: ASSET_ID, toolKey: 'ocr', inputImageId: 'xK9mR2pQ7vB', outputImageId: null, outputData: 'hello', status: 'success', costCents: 5, createdAt: '2026-07-19T00:00:00.000Z' }] }),
    )
    const client = makeClient(fetchMock)
    const logs = await client.aiTools.logs({ tool: 'ocr', limit: 50 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/ai/logs')
    expect(url).toContain('tool=ocr')
    expect(url).toContain('limit=50')
    expect(logs[0]?.outputData).toBe('hello')
  })
})

// ────────────────────────── credit ──────────────────────────

describe('@picora/sdk AIGC 域 — credit namespace', () => {
  it('CR1: balance 走 GET /v1/credit/balance', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { balanceCents: 9800, lifetimeTopupCents: 10000, lifetimeSpentCents: 200, monthlyMcpUsed: 3, monthlyPeriod: '2026-07', lastTopupAt: null } }),
    )
    const client = makeClient(fetchMock)
    const balance = await client.credit.balance()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/credit/balance')
    expect(balance.balanceCents).toBe(9800)
  })

  it('CR2: ledger 游标分页归一 + reason query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          items: [{ id: ASSET_ID, deltaCents: -200, balanceAfter: 9800, reason: 'aigc', refType: 'aigc_asset', refId: BATCH_ID, createdAt: '2026-07-19T00:00:00.000Z' }],
          nextCursor: 'c2',
        },
      }),
    )
    const client = makeClient(fetchMock)
    const page = await client.credit.ledger({ reason: 'aigc', cursor: 'c1', limit: 20 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/credit/ledger')
    expect(url).toContain('reason=aigc')
    expect(url).toContain('cursor=c1')
    expect(page.items[0]?.deltaCents).toBe(-200)
    expect(page.nextCursor).toBe('c2')
    expect(page.hasMore).toBe(true)
  })

  it('CR3: topup 走 POST + packageKey body 并返回 checkout URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { checkoutUrl: 'https://checkout.creem.io/xyz', packageKey: 'credit_10k', amountCents: 10000 } }),
    )
    const client = makeClient(fetchMock)
    const checkout = await client.credit.topup({ packageKey: 'credit_10k' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/credit/topup')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ packageKey: 'credit_10k' })
    expect(checkout.checkoutUrl).toBe('https://checkout.creem.io/xyz')
  })
})

// ────────────────────────── agreements ──────────────────────────

describe('@picora/sdk AIGC 域 — agreements namespace', () => {
  it('AG1: get 走 GET /v1/agreements/aigc(公开端点)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { type: 'aigc_terms', version: '2026-11-16-v1' } }),
    )
    const client = makeClient(fetchMock)
    const info = await client.agreements.get()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/agreements/aigc')
    expect(info.version).toBe('2026-11-16-v1')
  })

  it('AG2: accept 走 POST /accept + type/version body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    await expect(
      client.agreements.accept({ type: 'aigc_terms', version: '2026-11-16-v1' }),
    ).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/agreements/aigc/accept')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ type: 'aigc_terms', version: '2026-11-16-v1' })
  })

  it('AG3: status 走 GET /status 并解析同意状态', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { agreed: false, currentVersion: '2026-11-16-v1' } }),
    )
    const client = makeClient(fetchMock)
    const status = await client.agreements.status()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/agreements/aigc/status')
    expect(status.agreed).toBe(false)
  })
})
