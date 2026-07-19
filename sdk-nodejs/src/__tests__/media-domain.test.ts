/**
 * v0.3.0 媒体域批次 —— images 扩展 / uploads(TUS) / videos / audio / media /
 * watermarkTemplates / storageTier 命名空间测试。
 *
 * 覆盖:
 *   images 扩展(8):multipart 上传专项(FormData + 不手动设 Content-Type)、
 *     update is_public 映射、批量删除 / 迁移 / 查重、sign、public-meta 内部头、syncState query
 *   uploads TUS(6):create 三协议头 + Location 解析、status/get 读 Upload-Offset、
 *     append 协议头 + retry:false 语义、capabilities、abort
 *   videos(5):upload 202 multipart、list 归一 videos 键、status URL、update body、delete
 *   audio(3):upload multipart、get URL、update is_public 映射
 *   media(3):list query 映射 + items 归一、get URL、batchDelete body
 *   watermark(3):list 拆封、create POST body、update If-Unmodified-Since 头
 *   storageTier(3):stats URL、promote body、bulkDelete 两步(dryRun query 区分)
 */
import { describe, it, expect, vi } from 'vitest'
import { createPicoraClient } from '../client.js'
import { PicoraApiError } from '../errors.js'
import type { Audio, Image, MediaItem, Video, WatermarkTemplate } from '../types/index.js'

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers })
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return createPicoraClient({ apiKey: 'sk_live_x', fetch: fetchMock as unknown as typeof fetch })
}

function makeImage(id: string): Image {
  return {
    id,
    userId: 'user_xxxxxxxxxxxxxxxxxxx',
    filename: 'photo.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    tags: [],
    isPublic: true,
    url: `https://media.picora.me/${id}.jpg`,
    createdAt: '2026-07-19T00:00:00.000Z',
  }
}

// ────────────────────────── images 扩展 ──────────────────────────

describe('@picora/sdk 媒体域 — images 扩展', () => {
  it('I1: upload 发送 FormData 且不手动设置 multipart Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeImage('xK9mR2pQ7vB') }, 201))
    const client = makeClient(fetchMock)
    await client.images.upload({
      file: new Uint8Array([1, 2, 3]),
      filename: 'a.png',
      contentType: 'image/png',
      tags: ['风景', '旅行'],
      isPublic: false,
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/images')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    // boundary 必须由 fetch 自动生成:headers 中不得有手动 Content-Type
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    const form = init.body as FormData
    expect(form.get('tags')).toBe('["风景","旅行"]')
    expect(form.get('isPublic')).toBe('false')
    const file = form.get('file')
    expect(file).toBeInstanceOf(Blob)
    expect((file as File).name).toBe('a.png')
  })

  it('I2: update PATCH 将 isPublic 映射为 wire 字段 is_public', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: makeImage('xK9mR2pQ7vB') }))
    const client = makeClient(fetchMock)
    await client.images.update('xK9mR2pQ7vB', { title: '夏日海滩', isPublic: false })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({ title: '夏日海滩', is_public: false })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/images/xK9mR2pQ7vB')
  })

  it('I3: batchDelete 走 DELETE /v1/images + JSON body ids', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { deleted: 2, failed: 0 } }))
    const client = makeClient(fetchMock)
    const result = await client.images.batchDelete({ ids: ['a11111111aa', 'b22222222bb'] })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/images')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['a11111111aa', 'b22222222bb'] })
    expect(result).toEqual({ deleted: 2, failed: 0 })
  })

  it('I4: batchMove 支持 kbId=null(移出合集)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { moved: 3 } }))
    const client = makeClient(fetchMock)
    const result = await client.images.batchMove({ ids: ['a11111111aa'], kbId: null })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/images/batch-move')
    expect(JSON.parse(init.body as string)).toEqual({ ids: ['a11111111aa'], kbId: null })
    expect(result.moved).toBe(3)
  })

  it('I5: exists 上送 hashes,返回 existing + missing', async () => {
    const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          existing: { [hash]: { id: 'abc12345xyz', url: 'https://media.picora.me/abc12345xyz.jpg' } },
          missing: [],
        },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.images.exists({ hashes: [hash] })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(init.body as string)).toEqual({ hashes: [hash] })
    expect(result.existing[hash]?.id).toBe('abc12345xyz')
  })

  it('I6: sign POST expSeconds 到 /v1/images/{id}/sign', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: { signedUrl: 'https://x/y?sig=z', expiresAt: '2026-07-19T01:00:00.000Z', exp: 1789000000 },
      }),
    )
    const client = makeClient(fetchMock)
    const result = await client.images.sign('xK9mR2pQ7vB', { expSeconds: 600 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/images/xK9mR2pQ7vB/sign')
    expect(JSON.parse(init.body as string)).toEqual({ expSeconds: 600 })
    expect(result.signedUrl).toContain('sig=')
  })

  it('I7: publicMeta 携带 X-Internal-Token 头(spec 响应无业务包装,原样返回)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ storageKey: 'images/u/2026-07/x.jpg', mimeType: 'image/jpeg', isPublic: true }),
    )
    const client = makeClient(fetchMock)
    const meta = await client.images.publicMeta('xK9mR2pQ7vB', { internalToken: 'sk_internal_t' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/images/xK9mR2pQ7vB/public-meta')
    expect((init.headers as Record<string, string>)['X-Internal-Token']).toBe('sk_internal_t')
    expect(meta.storageKey).toBe('images/u/2026-07/x.jpg')
  })

  it('I8: syncState 传 type / since / limit query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { changes: [], nextCursor: null, hasMore: false } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.images.syncState({ type: 'image', since: 'cur_abc', limit: 200 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/sync/state')
    expect(url).toContain('type=image')
    expect(url).toContain('since=cur_abc')
    expect(url).toContain('limit=200')
    expect(result.hasMore).toBe(false)
  })
})

// ────────────────────────── uploads(TUS)──────────────────────────

describe('@picora/sdk 媒体域 — uploads TUS 断点续传', () => {
  it('U1: create 发送 Tus-Resumable / Upload-Length / Upload-Metadata 三协议头并解析 Location', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      emptyResponse(201, { Location: '/v1/uploads/sess_aZ9kR2pQ7vB', 'Tus-Resumable': '1.0.0' }),
    )
    const client = makeClient(fetchMock)
    const session = await client.uploads.create({
      uploadLength: 4096,
      metadata: { filename: 'a.png', resourceType: 'image' },
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/uploads')
    expect(init.method).toBe('POST')
    const headers = init.headers as Record<string, string>
    expect(headers['Tus-Resumable']).toBe('1.0.0')
    expect(headers['Upload-Length']).toBe('4096')
    // TUS 规约:'key base64(value)' 逗号分隔
    expect(headers['Upload-Metadata']).toBe('filename YS5wbmc=,resourceType aW1hZ2U=')
    expect(session.id).toBe('sess_aZ9kR2pQ7vB')
    expect(session.uploadUrl).toBe('https://api.picora.me/v1/uploads/sess_aZ9kR2pQ7vB')
  })

  it('U2: create 缺 Location 头抛 TUS_PROTOCOL_ERROR', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(201))
    const client = makeClient(fetchMock)
    await expect(client.uploads.create({ uploadLength: 10 })).rejects.toMatchObject({
      code: 'TUS_PROTOCOL_ERROR',
    })
  })

  it('U3: status(HEAD)读取 Upload-Offset / Upload-Length 头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      emptyResponse(200, { 'Upload-Offset': '1024', 'Upload-Length': '4096', 'Tus-Resumable': '1.0.0' }),
    )
    const client = makeClient(fetchMock)
    const progress = await client.uploads.status('sess_x')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/uploads/sess_x')
    expect(init.method).toBe('HEAD')
    expect(progress).toEqual({ offset: 1024, length: 4096 })
  })

  it('U4: get(GET 语义)另解析 Upload-Expires,并带 Tus-Resumable 头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      emptyResponse(200, {
        'Upload-Offset': '2048',
        'Upload-Length': '4096',
        'Upload-Expires': 'Sat, 19 Jul 2026 12:00:00 GMT',
      }),
    )
    const client = makeClient(fetchMock)
    const progress = await client.uploads.get('sess_x')
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('GET')
    expect((init.headers as Record<string, string>)['Tus-Resumable']).toBe('1.0.0')
    expect(progress).toEqual({ offset: 2048, length: 4096, expiresAt: 'Sat, 19 Jul 2026 12:00:00 GMT' })
  })

  it('U5: append 发送三个 TUS 协议头 + 分片 body 透传,读回新 Upload-Offset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      emptyResponse(204, { 'Upload-Offset': '2048', 'Tus-Resumable': '1.0.0' }),
    )
    const client = makeClient(fetchMock)
    const chunk = new Uint8Array([9, 9, 9])
    const result = await client.uploads.append('sess_x', { chunk, offset: 1024 })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/uploads/sess_x')
    expect(init.method).toBe('PATCH')
    const headers = init.headers as Record<string, string>
    expect(headers['Tus-Resumable']).toBe('1.0.0')
    expect(headers['Upload-Offset']).toBe('1024')
    expect(headers['Content-Type']).toBe('application/offset+octet-stream')
    expect(init.body).toBe(chunk)
    expect(result.offset).toBe(2048)
  })

  it('U6: append 为非幂等请求 —— 500 不自动重试(retry:false 语义)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: false, error: 'boom' }, 500))
    // 客户端保持默认 retryOnServerError:true,验证 retry:false 在请求级生效
    const client = makeClient(fetchMock)
    await expect(
      client.uploads.append('sess_x', { chunk: new Uint8Array([1]), offset: 0 }),
    ).rejects.toBeInstanceOf(PicoraApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('U7: capabilities(OPTIONS)解析 Tus-Version / Tus-Extension / Tus-Max-Size', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      emptyResponse(204, {
        'Tus-Resumable': '1.0.0',
        'Tus-Version': '1.0.0',
        'Tus-Extension': 'creation,expiration',
        'Tus-Max-Size': '2147483648',
      }),
    )
    const client = makeClient(fetchMock)
    const caps = await client.uploads.capabilities()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('OPTIONS')
    expect(caps).toEqual({
      versions: ['1.0.0'],
      extensions: ['creation', 'expiration'],
      maxSizeBytes: 2147483648,
    })
  })

  it('U8: abort 走 DELETE 并 resolve void(204)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(204))
    const client = makeClient(fetchMock)
    await expect(client.uploads.abort('sess_x')).resolves.toBeUndefined()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('DELETE')
  })
})

// ────────────────────────── videos ──────────────────────────

describe('@picora/sdk 媒体域 — videos', () => {
  it('V1: upload 发送 FormData(含 title 字段)且响应 202 解析 videoId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { videoId: 'V1StGXR8_Z5jdHi6B-myT', status: 'processing' } }, 202),
    )
    const client = makeClient(fetchMock)
    const result = await client.videos.upload({
      file: new Uint8Array([1]),
      filename: 'demo.mp4',
      title: '发布会录像',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/videos')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect((init.body as FormData).get('title')).toBe('发布会录像')
    expect(result).toEqual({ videoId: 'V1StGXR8_Z5jdHi6B-myT', status: 'processing' })
  })

  it('V2: list 归一服务端 videos 数组键为统一 items', async () => {
    const video: Partial<Video> = { id: 'V1StGXR8_Z5jdHi6B-myT', title: 'x', status: 'ready' }
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { videos: [video], nextCursor: 'cur_next' } }),
    )
    const client = makeClient(fetchMock)
    const page = await client.videos.list({ cursor: 'cur_prev', limit: 50 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/videos')
    expect(url).toContain('cursor=cur_prev')
    expect(url).toContain('limit=50')
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe('V1StGXR8_Z5jdHi6B-myT')
    expect(page.nextCursor).toBe('cur_next')
    expect(page.hasMore).toBe(true)
  })

  it('V3: status 拼接 /v1/videos/{id}/status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: {
          id: 'V1StGXR8_Z5jdHi6B-myT',
          status: 'ready',
          playbackUrl: 'https://cdn/x/index.m3u8',
          thumbnailUrl: null,
          durationSeconds: 185,
          progress: null,
        },
      }),
    )
    const client = makeClient(fetchMock)
    const status = await client.videos.status('V1StGXR8_Z5jdHi6B-myT')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/videos/V1StGXR8_Z5jdHi6B-myT/status')
    expect(status.playbackUrl).toBe('https://cdn/x/index.m3u8')
  })

  it('V4: update PATCH 映射 isPublic → is_public,SuccessNull 返回 void', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: null }))
    const client = makeClient(fetchMock)
    await expect(
      client.videos.update('V1StGXR8_Z5jdHi6B-myT', { title: 'v2', isPublic: true }),
    ).resolves.toBeUndefined()
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'v2', is_public: true })
  })

  it('V5: publicMeta 携带 X-Internal-Token 内部密钥头', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ storageKey: 'videos/u/x.mp4', mimeType: 'video/mp4', sizeBytes: 1, filename: 'x.mp4' }),
    )
    const client = makeClient(fetchMock)
    await client.videos.publicMeta('V1StGXR8_Z5jdHi6B-myT', { internalToken: 'sk_internal_t' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/videos/V1StGXR8_Z5jdHi6B-myT/public-meta')
    expect((init.headers as Record<string, string>)['X-Internal-Token']).toBe('sk_internal_t')
  })
})

// ────────────────────────── audio ──────────────────────────

describe('@picora/sdk 媒体域 — audio', () => {
  const audio: Partial<Audio> = { id: 'KkVO6hcQTwBXgPTvb-_uE', type: 'audio', status: 'ready' }

  it('A1: upload 发送 FormData 且不手动设 Content-Type(201 同步返回)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: audio }, 201))
    const client = makeClient(fetchMock)
    const result = await client.audio.upload({
      file: new Uint8Array([1, 2]),
      filename: 'track.mp3',
      contentType: 'audio/mpeg',
      title: 'Episode 12',
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/audio')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
    expect((init.body as FormData).get('title')).toBe('Episode 12')
    expect(result.id).toBe('KkVO6hcQTwBXgPTvb-_uE')
  })

  it('A2: get 拼接 /v1/audio/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: audio }))
    const client = makeClient(fetchMock)
    await client.audio.get('KkVO6hcQTwBXgPTvb-_uE')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/audio/KkVO6hcQTwBXgPTvb-_uE')
  })

  it('A3: update PATCH 映射 isPublic → is_public;delete 204 返回 void', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: null }))
      .mockResolvedValueOnce(emptyResponse(204))
    const client = makeClient(fetchMock)
    await client.audio.update('KkVO6hcQTwBXgPTvb-_uE', { isPublic: false })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(init.body as string)).toEqual({ is_public: false })
    await expect(client.audio.delete('KkVO6hcQTwBXgPTvb-_uE')).resolves.toBeUndefined()
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE')
  })
})

// ────────────────────────── media(统一)──────────────────────────

describe('@picora/sdk 媒体域 — media 统一端点', () => {
  it('M1: list 映射 isPublic → is_public query 并归一 items', async () => {
    const item: Partial<MediaItem> = { id: 'xK9mR2pQ7vB', type: 'image' }
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { items: [item], nextCursor: null, hasMore: false } }),
    )
    const client = makeClient(fetchMock)
    const page = await client.media.list({ type: 'audio', q: 'intro', isPublic: true, limit: 10 })
    const url = String(fetchMock.mock.calls[0]?.[0])
    expect(url).toContain('/v1/media')
    expect(url).toContain('type=audio')
    expect(url).toContain('q=intro')
    expect(url).toContain('is_public=true')
    expect(url).toContain('limit=10')
    expect(page.items).toHaveLength(1)
    expect(page.hasMore).toBe(false)
  })

  it('M2: get 拼接 /v1/media/{id}', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { id: 'V1StGXR8_Z5jdHi6B-myT', type: 'video' } }),
    )
    const client = makeClient(fetchMock)
    const item = await client.media.get('V1StGXR8_Z5jdHi6B-myT')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/media/V1StGXR8_Z5jdHi6B-myT')
    expect(item.type).toBe('video')
  })

  it('M3: batchDelete 走 DELETE /v1/media + {id,type} 条目 body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { deleted: ['xK9mR2pQ7vB'], failed: [] } }),
    )
    const client = makeClient(fetchMock)
    const result = await client.media.batchDelete({
      items: [{ id: 'xK9mR2pQ7vB', type: 'image' }],
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/media')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(init.body as string)).toEqual({ items: [{ id: 'xK9mR2pQ7vB', type: 'image' }] })
    expect(result.deleted).toEqual(['xK9mR2pQ7vB'])
  })
})

// ────────────────────────── watermarkTemplates ──────────────────────────

describe('@picora/sdk 媒体域 — watermarkTemplates', () => {
  const tpl: Partial<WatermarkTemplate> = {
    id: 'V1StGXR8_Z5jdHi6B-myT',
    name: '右下角小字水印',
    type: 'text',
  }

  it('W1: list 拆封 data 数组', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true, data: [tpl] }))
    const client = makeClient(fetchMock)
    const result = await client.watermarkTemplates.list()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/watermark-templates')
    expect(result).toEqual([tpl])
  })

  it('W2: create POST JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(tpl, 201))
    const client = makeClient(fetchMock)
    await client.watermarkTemplates.create({
      name: '右下角小字水印',
      type: 'text',
      text: '© Picora',
      opacity: 0.5,
    })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body['type']).toBe('text')
    expect(body['opacity']).toBe(0.5)
  })

  it('W3: update 传 If-Unmodified-Since 乐观锁头;delete 返回 void', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(tpl))
      .mockResolvedValueOnce(jsonResponse({ success: true }))
    const client = makeClient(fetchMock)
    await client.watermarkTemplates.update(
      'V1StGXR8_Z5jdHi6B-myT',
      { name: 'x', type: 'text' },
      { ifUnmodifiedSince: '2026-05-09T10:00:00.000Z' },
    )
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect((init.headers as Record<string, string>)['If-Unmodified-Since']).toBe('2026-05-09T10:00:00.000Z')
    await expect(client.watermarkTemplates.delete('V1StGXR8_Z5jdHi6B-myT')).resolves.toBeUndefined()
  })
})

// ────────────────────────── storageTier ──────────────────────────

describe('@picora/sdk 媒体域 — storageTier', () => {
  it('S1: stats 走 GET /v1/me/storage-tier-stats', async () => {
    const stat = { count: 1, sizeBytes: 100, percentage: 0.5 }
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: { hot: stat, cool: stat, archive: stat, savingsEstimateMonthly: 0.42 } }),
    )
    const client = makeClient(fetchMock)
    const stats = await client.storageTier.stats()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/v1/me/storage-tier-stats')
    expect(stats.savingsEstimateMonthly).toBe(0.42)
  })

  it('S2: promote POST resourceType + resourceIds', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: { promoted: 2, failed: 0 } }))
    const client = makeClient(fetchMock)
    const result = await client.storageTier.promote({
      resourceType: 'image',
      resourceIds: ['xK9mR2pQ7vB', 'aB3cD4eF5gH'],
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(String(url)).toContain('/v1/me/storage-tier/promote')
    expect(JSON.parse(init.body as string)).toEqual({
      resourceType: 'image',
      resourceIds: ['xK9mR2pQ7vB', 'aB3cD4eF5gH'],
    })
    expect(result.promoted).toBe(2)
  })

  it('S3: bulkDelete 预览走 dryRun=true,确认执行走 dryRun=false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: { count: 42, snapshotToken: 'snap_x' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { deleted: 42, failed: 0 } }))
    const client = makeClient(fetchMock)

    const preview = await client.storageTier.bulkDelete({
      resourceType: 'image',
      filters: { createdBefore: '2025-01-01T00:00:00Z' },
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('dryRun=true')
    expect(preview.snapshotToken).toBe('snap_x')

    const executed = await client.storageTier.bulkDelete({
      snapshotToken: preview.snapshotToken,
      confirmCount: preview.count,
    })
    const [url2, init2] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(String(url2)).toContain('dryRun=false')
    expect(JSON.parse(init2.body as string)).toEqual({ snapshotToken: 'snap_x', confirmCount: 42 })
    expect(executed.deleted).toBe(42)
  })
})
