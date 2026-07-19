/**
 * images 命名空间(0.2.x 存量:list / get / delete;v0.3.0 媒体域批次补齐:
 * upload / update / 批量删除 / 批量迁移 / 哈希查重 / 签名 URL / public-meta / 增量同步)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { toFormData } from '../core/multipart.js'
import type {
  Image,
  ImageBatchDeleteResult,
  ImageBatchMoveInput,
  ImageBatchMoveResult,
  ImageExistsResult,
  ImageListParams,
  ImagePublicMeta,
  PaginatedResponse,
  SignImageResult,
  SyncStateParams,
  SyncStateResult,
  UpdateImageInput,
  UploadImageInput,
} from '../types/index.js'

export interface ImagesNamespace {
  /**
   * 游标分页列出当前用户的图片,按 created_at DESC, id DESC 排序(禁用 OFFSET 分页)。
   * 可按 tag 标签精确筛选;翻页游标 / 页大小 / 可见性过滤等入参见 ImageListParams。
   */
  list(params?: ImageListParams): Promise<PaginatedResponse<Image>>
  /** 获取单张图片元数据(id 为 nanoid 11 字符)。仅本人图片可读,不存在或非本人一律 404。 */
  get(id: string): Promise<Image>
  /**
   * 删除单张图片。服务端级联清理 ObjectStorage 文件 + 元数据缓存(img:{id})+ CDN 缓存 + 数据库记录。
   * 仅本人图片可删,不存在或非本人返回 404;需 read_write_delete scope。
   */
  delete(id: string): Promise<void>
  /**
   * 上传图片(multipart;请求 Content-Type 由 SDK 自动设置,勿手动覆盖)。支持 JPEG / PNG / GIF / WebP / SVG。
   * 上传成功(201)后服务端自动更新存储配额缓存(quota:img_storage:{userId});
   * 命中既有 sha256 时不重复计配额(响应头 X-Picora-Duplicate: true)。
   * 存储超限返回 403 QUOTA_EXCEEDED,文件校验失败 422。
   * 非幂等请求,SDK 关闭 429/5xx 自动重试;需 read_write scope。
   */
  upload(input: UploadImageInput): Promise<Image>
  /**
   * 更新图片元数据(标题 / 标签 / 可见性;字段均可选,tags 为全量替换而非增量)。
   * 仅本人图片可改,不存在或非本人 404;需 read_write scope。
   */
  update(id: string, patch: UpdateImageInput): Promise<Image>
  /**
   * 批量删除图片,单次最多 50 张(超限 422)。每张同步级联清理 ObjectStorage + 数据库 + 缓存 + CDN;
   * 任一失败不影响其他图片,结果含 deleted / failed 计数。需 read_write_delete scope。
   */
  batchDelete(input: { ids: string[] }): Promise<ImageBatchDeleteResult>
  /**
   * 批量迁移图片合集归属,单次最多 50 张。kbId 为合集 ID = 迁入(该合集须归属本人,否则 404);
   * kbId 传 null = 移出合集(kb_id 置 NULL)。仅更新属于本人的行,结果 moved 为实际迁移数。需 write scope。
   */
  batchMove(input: ImageBatchMoveInput): Promise<ImageBatchMoveResult>
  /**
   * 批量 sha256 查重(单次最多 200 个),返回 existing(含 id + url)与 missing。
   * 只读、不计配额,但语义上属写入路径:需 read_write scope 且走 upload 限流档。
   */
  exists(input: { hashes: string[] }): Promise<ImageExistsResult>
  /**
   * 为受限图片生成带签名的限时访问 URL(默认 3600 秒,上限 86400)。仅图片所有者可调用;需 read_write scope。
   */
  sign(id: string, opts?: { expSeconds?: number }): Promise<SignImageResult>
  /**
   * 获取公开图片元数据(内部端点,仅供 media-serve 回源;须携带与 api Worker
   * INTERNAL_API_TOKEN 一致的共享密钥,不匹配一律 404)。
   */
  publicMeta(id: string, opts: { internalToken: string }): Promise<ImagePublicMeta>
  /**
   * 增量同步(v0.37.0):返回自 since 游标以来的 upsert + delete 变更事件,
   * 按 (updated_at, id) 升序合并 image / video / audio 三类资源。
   * 首次同步不传 since;hasMore=true 时用 nextCursor 继续拉。
   */
  syncState(params?: SyncStateParams): Promise<SyncStateResult>
}

export function createImagesNamespace(http: HttpCore): ImagesNamespace {
  return {
    list: (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      // 服务端页大小参数名为 limit(0.2.x 曾误发 pageSize 被忽略,0.3.0 修正映射)
      if (params?.pageSize !== undefined) query['limit'] = params.pageSize
      if (params?.tag !== undefined) query['tag'] = params.tag
      if (params?.startDate !== undefined) query['start_date'] = params.startDate
      if (params?.endDate !== undefined) query['end_date'] = params.endDate
      return http.request<PaginatedResponse<Image>>({ method: 'GET', path: '/v1/images', query })
    },
    get: (id) => http.request<Image>({ method: 'GET', path: `/v1/images/${encodeURIComponent(id)}` }),
    delete: async (id) => {
      await http.request<void>({ method: 'DELETE', path: `/v1/images/${encodeURIComponent(id)}` })
    },
    upload: (input) => {
      const form = toFormData(
        'file',
        {
          file: input.file,
          filename: input.filename,
          ...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
        },
        {
          // form-data 限制:tags 传 JSON 字符串,isPublic 传 'true'/'false'
          ...(input.tags !== undefined ? { tags: JSON.stringify(input.tags) } : {}),
          ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
        },
      )
      return http.request<Image>({ method: 'POST', path: '/v1/images', body: form, retry: false })
    },
    update: (id, patch) =>
      http.request<Image>({
        method: 'PATCH',
        path: `/v1/images/${encodeURIComponent(id)}`,
        body: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
          // wire 字段为 snake_case is_public
          ...(patch.isPublic !== undefined ? { is_public: patch.isPublic } : {}),
        },
      }),
    batchDelete: (input) =>
      http.request<ImageBatchDeleteResult>({
        method: 'DELETE',
        path: '/v1/images',
        body: { ids: input.ids },
      }),
    batchMove: (input) =>
      http.request<ImageBatchMoveResult>({
        method: 'POST',
        path: '/v1/images/batch-move',
        body: { ids: input.ids, kbId: input.kbId },
      }),
    exists: (input) =>
      http.request<ImageExistsResult>({
        method: 'POST',
        path: '/v1/images/exists',
        body: { hashes: input.hashes },
      }),
    sign: (id, opts) =>
      http.request<SignImageResult>({
        method: 'POST',
        path: `/v1/images/${encodeURIComponent(id)}/sign`,
        body: opts?.expSeconds !== undefined ? { expSeconds: opts.expSeconds } : {},
      }),
    publicMeta: (id, opts) =>
      http.request<ImagePublicMeta>({
        method: 'GET',
        path: `/v1/images/${encodeURIComponent(id)}/public-meta`,
        headers: { 'X-Internal-Token': opts.internalToken },
      }),
    syncState: (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.type !== undefined) query['type'] = params.type
      if (params?.since !== undefined) query['since'] = params.since
      if (params?.limit !== undefined) query['limit'] = params.limit
      return http.request<SyncStateResult>({ method: 'GET', path: '/v1/sync/state', query })
    },
  }
}

export const IMAGES_COVERAGE = [
  { method: 'GET', path: '/v1/images', client: 'images.list' },
  { method: 'GET', path: '/v1/images/{id}', client: 'images.get' },
  { method: 'DELETE', path: '/v1/images/{id}', client: 'images.delete' },
  { method: 'POST', path: '/v1/images', client: 'images.upload' },
  { method: 'PATCH', path: '/v1/images/{id}', client: 'images.update' },
  { method: 'DELETE', path: '/v1/images', client: 'images.batchDelete' },
  { method: 'POST', path: '/v1/images/batch-move', client: 'images.batchMove' },
  { method: 'POST', path: '/v1/images/exists', client: 'images.exists' },
  { method: 'POST', path: '/v1/images/{id}/sign', client: 'images.sign' },
  { method: 'GET', path: '/v1/images/{id}/public-meta', client: 'images.publicMeta' },
  { method: 'GET', path: '/v1/sync/state', client: 'images.syncState' },
] as const satisfies readonly CoveredOperation[]
