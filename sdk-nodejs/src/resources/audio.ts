/**
 * audio 命名空间 —— 音频托管(v0.12.0,需 Pro 及以上套餐,与视频共享 media_storage 配额)。
 *
 * 与视频不同,音频上传是同步的:201 返回时文件已可立即播放(无转码流程)。
 * MP3 (ID3v2) 与 FLAC 自动解析内嵌封面 + 码率 + 时长;其他格式用默认 SVG 封面。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { toFormData } from '../core/multipart.js'
import type { Audio, UpdateAudioInput, UploadAudioInput } from '../types/index.js'

export interface AudioNamespace {
  /**
   * 上传音频(multipart,同步:201 返回即可播放,无转码流程)。支持 mp3 / m4a / mp4 / wav / flac / ogg,
   * 服务端做 MIME 白名单 + 幻数校验。需 Pro 及以上套餐,与视频共享 media_storage 配额,
   * 超限返回 403 QUOTA_EXCEEDED,格式校验失败 422。
   * 非幂等请求,SDK 关闭 429/5xx 自动重试;需 read_write scope。
   */
  upload(input: UploadAudioInput): Promise<Audio>
  /** 查询单个音频元数据(含 thumbnail / duration / bitrate)。 */
  get(id: string): Promise<Audio>
  /** 更新音频标题或可见性(两个字段均可选,空对象为 no-op)。 */
  update(id: string, patch: UpdateAudioInput): Promise<void>
  /** 永久删除音频(R2 对象 + 内嵌封面 + KV 缓存 + 数据库记录全部清理,不可恢复)。 */
  delete(id: string): Promise<void>
}

export function createAudioNamespace(http: HttpCore): AudioNamespace {
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
      return http.request<Audio>({ method: 'POST', path: '/v1/audio', body: form, retry: false })
    },
    get: (id) =>
      http.request<Audio>({ method: 'GET', path: `/v1/audio/${encodeURIComponent(id)}` }),
    update: async (id, patch) => {
      await http.request<void>({
        method: 'PATCH',
        path: `/v1/audio/${encodeURIComponent(id)}`,
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
        path: `/v1/audio/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
  }
}

export const AUDIO_COVERAGE = [
  { method: 'POST', path: '/v1/audio', client: 'audio.upload' },
  { method: 'GET', path: '/v1/audio/{id}', client: 'audio.get' },
  { method: 'PATCH', path: '/v1/audio/{id}', client: 'audio.update' },
  { method: 'DELETE', path: '/v1/audio/{id}', client: 'audio.delete' },
] as const satisfies readonly CoveredOperation[]
