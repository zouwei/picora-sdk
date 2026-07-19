/**
 * v0.61.4 PR4-A 示例：AI 视频生成软件按剧集同步资产到 Picora。
 *
 * 适用场景：第三方 AI 视频生成（ComfyUI / Replicate / OpenAI Sora 等）软件
 * 完成生成后，把视频文件 + 字幕脚本批量推送到 Picora 云端，按剧集组织。
 *
 * 鉴权：
 *   - API Key：sk_live_ 前缀（适合受信任脚本）
 *   - OAuth Bearer token：Device Flow 申请（适合 CLI / 桌面端）
 *
 * 运行方式：
 *   tsx examples/ai-video-sync.ts
 */
import { createPicoraClient } from '../src/index.js'
import type { Episode, EpisodeSyncResult } from '../src/index.js'

async function main() {
  // 1. 初始化客户端（API Key 模式）
  const picora = createPicoraClient({
    apiKey: process.env['PICORA_API_KEY'] ?? '',
    baseUrl: process.env['PICORA_BASE_URL'] ?? 'https://api.picora.me',
    userAgent: 'ai-video-sync-example/1.0',
  })

  // 2. 找或创建合集（type=tv_series）
  // findOrCreate 模式 demo：先 list 后 create
  const existing = await picora.collections.list({ type: 'tv_series' })
  let collection = existing.items.find((c) => c.slug === 'my-ai-series')
  if (!collection) {
    collection = await picora.collections.create({
      name: '我的 AI 剧集',
      slug: 'my-ai-series',
      collectionType: 'tv_series',
      allowedResourceTypes: ['video', 'audio', 'doc'],
      description: 'AI 视频生成软件输出',
    })
  }
  console.log(`Collection ready: ${collection.id} (${collection.name})`)

  // 3. 找或创建剧集（EP01）
  const eps = await picora.episodes.list(collection.id)
  let ep01: Episode | undefined = eps.items.find((e) => e.sequenceNo === 1)
  if (!ep01) {
    ep01 = await picora.episodes.create(collection.id, {
      sequenceNo: 1,
      title: 'EP01 - 开篇',
      description: '主角登场，世界观构建',
    })
  }
  console.log(`Episode ready: ${ep01.id} (#${ep01.sequenceNo} ${ep01.title})`)

  // 4. 同步资产（假设视频已通过 /v1/videos 上传，文档通过 /v1/docs）
  //    PR4-A 阶段：客户端先用既有上传接口拿到 resourceId，再 sync 到剧集
  //    PR4-B 阶段：SDK 内置 TUS 上传 + sync 一站式
  const result: EpisodeSyncResult = await picora.episodes.sync(collection.id, ep01.id, {
    idempotencyKey: `ai-batch-${Date.now()}`,   // 同 key 24h 内重发返回首次结果
    assets: [
      { resourceType: 'video', resourceId: 'vid_uploaded_video_xxxx' },
      { resourceType: 'doc',   resourceId: 'doc_uploaded_script_yyy' },
    ],
  })

  console.log(`Sync result:`)
  console.log(`  Total: ${result.totalCount}`)
  console.log(`  Applied: ${result.appliedCount}`)
  console.log(`  Skipped (duplicate): ${result.skippedCount}`)
  console.log(`  Failed: ${result.failedCount}`)
  for (const item of result.applied) {
    if (item.status !== 'applied') {
      console.warn(`  ⚠ ${item.resourceId}: ${item.status} (${item.reason})`)
    }
  }
}

main().catch((err) => {
  console.error('Sync failed:', err)
  process.exit(1)
})
