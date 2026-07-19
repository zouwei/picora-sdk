/**
 * videos 命名空间 —— 视频托管(需 Pro 及以上套餐,转码异步)。
 *
 * 上传流程:upload() 响应 202(status=processing)→ 转码完成经 Bunny.net webhook
 * 写库 → 客户端轮询 status() 直到 status=ready 后拿 playbackUrl(HLS m3u8)。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { toFormData } from '../core/multipart.js'
import { normalizePage } from '../core/pagination.js'
import type {
  PaginatedResponse,
  UpdateVideoInput,
  UploadVideoAccepted,
  UploadVideoInput,
  Video,
  VideoListParams,
  VideoPublicMeta,
  VideoStatusInfo,
} from '../types/index.js'

export interface VideosNamespace {
  /**
   * 上传视频(multipart)。响应 202(status=processing):转码异步进行,须轮询 status() 直到 ready
   * 才拿到 playbackUrl(转码完成经 Bunny.net webhook 写库并同步更新存储配额)。
   * 仅 Pro 及以上套餐可用;文件大小 / 时长受套餐限制(Pro 500MB/30min,Pro+ 2GB/2h),
   * 套餐不符或配额超限 403,文件校验失败 422。
   * 非幂等请求,SDK 关闭 429/5xx 自动重试;需 read_write scope。
   */
  upload(input: UploadVideoInput): Promise<UploadVideoAccepted>
  /** 游标分页列出视频(按上传时间降序)。 */
  list(params?: VideoListParams): Promise<PaginatedResponse<Video>>
  /** 获取单个视频详细元数据(播放地址 / 转码状态 / 时长 / 封面)。 */
  get(id: string): Promise<Video>
  /** 更新视频标题或可见性(字段均可选)。仅本人视频可改,不存在或非本人 404;需 read_write scope。 */
  update(id: string, patch: UpdateVideoInput): Promise<void>
  /**
   * 删除视频及其所有转码文件(HLS 分片 / 封面),同步释放存储配额。
   * 仅本人视频可删,不存在返回 404;需 read_write_delete scope。
   */
  delete(id: string): Promise<void>
  /**
   * 查询转码状态(轮询用)。带宽降级行为:degraded 时 playbackUrl 自动重写为
   * 360p 低码率列表;suspended(带宽超 120%)时服务端返回 HTTP 451。
   */
  status(id: string): Promise<VideoStatusInfo>
  /**
   * 获取公开视频元数据(内部端点,仅供 media-serve 回源;只覆盖 R2 fallback 行。
   * 须携带与 api Worker INTERNAL_API_TOKEN 一致的共享密钥,不匹配一律 404)。
   */
  publicMeta(id: string, opts: { internalToken: string }): Promise<VideoPublicMeta>
}

export function createVideosNamespace(http: HttpCore): VideosNamespace {
  return {
    upload: (input) => {
      const form = toFormData(
        'file',
        {
          file: input.file,
          filename: input.filename,
          ...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
        },
        input.title !== undefined ? { title: input.title } : undefined,
      )
      return http.request<UploadVideoAccepted>({
        method: 'POST',
        path: '/v1/videos',
        body: form,
        retry: false,
      })
    },
    list: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      // 服务端数组键名为 videos,经 normalizePage 归一为统一 items 形态
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/videos', query })
      return normalizePage<Video>(raw, 'videos')
    },
    get: (id) =>
      http.request<Video>({ method: 'GET', path: `/v1/videos/${encodeURIComponent(id)}` }),
    update: async (id, patch) => {
      await http.request<void>({
        method: 'PATCH',
        path: `/v1/videos/${encodeURIComponent(id)}`,
        body: {
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          // wire 字段为 snake_case is_public
          ...(patch.isPublic !== undefined ? { is_public: patch.isPublic } : {}),
        },
        response: 'none',
      })
    },
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/videos/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    status: (id) =>
      http.request<VideoStatusInfo>({
        method: 'GET',
        path: `/v1/videos/${encodeURIComponent(id)}/status`,
      }),
    publicMeta: (id, opts) =>
      http.request<VideoPublicMeta>({
        method: 'GET',
        path: `/v1/videos/${encodeURIComponent(id)}/public-meta`,
        headers: { 'X-Internal-Token': opts.internalToken },
      }),
  }
}

export const VIDEOS_COVERAGE = [
  { method: 'POST', path: '/v1/videos', client: 'videos.upload' },
  { method: 'GET', path: '/v1/videos', client: 'videos.list' },
  { method: 'GET', path: '/v1/videos/{id}', client: 'videos.get' },
  { method: 'PATCH', path: '/v1/videos/{id}', client: 'videos.update' },
  { method: 'DELETE', path: '/v1/videos/{id}', client: 'videos.delete' },
  { method: 'GET', path: '/v1/videos/{id}/status', client: 'videos.status' },
  { method: 'GET', path: '/v1/videos/{id}/public-meta', client: 'videos.publicMeta' },
] as const satisfies readonly CoveredOperation[]
