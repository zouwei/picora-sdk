/**
 * uploads 命名空间 —— TUS 1.0 断点续传五件套(v0.37.0 /v1/uploads)。
 *
 * 协议特性:进度 / 能力信息全部在响应 header 中(无 JSON body),
 * 因此本命名空间统一使用 response:'raw' 读头;PATCH 分片为非幂等请求,
 * 必须 retry:false(重发同一分片会触发服务端 409 offset 冲突)。
 *
 * 典型断点续传流程:
 *   1. create({ uploadLength, metadata }) → 拿到 session id / uploadUrl
 *   2. 循环 append(id, { chunk, offset }) 直到 offset === uploadLength
 *      (最后一片到达后服务端自动 sha256 查重 + 入库)
 *   3. 网络中断后 status(id) 读回服务端 offset,从断点继续 append
 *   4. 放弃上传时 abort(id) 释放预扣配额
 */

import { PicoraApiError } from '../errors.js'
import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  TusAppendResult,
  TusCapabilities,
  TusCreateInput,
  TusUploadProgress,
  TusUploadSession,
} from '../types/index.js'

/** TUS 协议版本(服务端仅支持 1.0.0) */
const TUS_VERSION = '1.0.0'

/**
 * 按 TUS 规约编码 Upload-Metadata 头:`key base64(value)` 逗号分隔。
 * value 经 UTF-8 编码后转标准 base64(带填充);key 不得含空格 / 逗号(调用方保证)。
 */
function encodeTusMetadata(metadata: Record<string, string>): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(metadata)) {
    const bytes = new TextEncoder().encode(value)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    parts.push(`${key} ${btoa(binary)}`)
  }
  return parts.join(',')
}

/** 从 raw Response 读取可选整数头;缺失返回 null,非数字抛协议错误 */
function readOptionalIntHeader(res: Response, name: string): number | null {
  const value = res.headers.get(name)
  if (value === null) return null
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new PicoraApiError(res.status, 'TUS_PROTOCOL_ERROR', `invalid ${name} header: ${value}`)
  }
  return n
}

/** 从 raw Response 读取必需整数头;缺失即抛协议错误 */
function readRequiredIntHeader(res: Response, name: string): number {
  const n = readOptionalIntHeader(res, name)
  if (n === null) {
    throw new PicoraApiError(res.status, 'TUS_PROTOCOL_ERROR', `missing ${name} header in TUS response`)
  }
  return n
}

/** HEAD / GET 共用:从响应头解析上传进度 */
function parseProgress(res: Response): TusUploadProgress {
  const expiresAt = res.headers.get('Upload-Expires')
  return {
    offset: readRequiredIntHeader(res, 'Upload-Offset'),
    length: readOptionalIntHeader(res, 'Upload-Length'),
    ...(expiresAt !== null ? { expiresAt } : {}),
  }
}

export interface UploadsNamespace {
  /**
   * 创建断点续传 session(TUS creation 扩展)。服务端按 uploadLength 预扣存储配额,
   * 201 的 Location 头即后续 PATCH / HEAD / DELETE 的目标(SDK 已解析为 id + 绝对 uploadUrl)。
   * metadata 推荐至少含 filename / contentType / resourceType(image|video|audio),供最后一片入库时归类;
   * 配额不足返回 403,超单文件上限返回 413。
   * 非幂等请求(重试会重复建 session + 重复预扣配额),SDK 关闭自动重试;需 read_write scope。
   */
  create(input: TusCreateInput): Promise<TusUploadSession>
  /** 查询 session 当前进度(TUS HEAD 语义):Upload-Offset / Upload-Length 头。断点续传前用于确认服务端 offset。 */
  status(id: string): Promise<TusUploadProgress>
  /** 查询 session 进度(GET 语义,与 status 等价,另含 Upload-Expires 过期时间)。 */
  get(id: string): Promise<TusUploadProgress>
  /**
   * 追加分片(TUS PATCH)。offset 必须等于服务端当前 offset,否则 409(乱序 / 重发)。
   * 最后一片到达后服务端自动 sha256 查重并入库。非幂等,SDK 关闭 429/5xx 自动重试 ——
   * 失败后应先 status() 读回真实 offset 再续传。
   */
  append(id: string, input: { chunk: Uint8Array; offset: number }): Promise<TusAppendResult>
  /** 探测服务端 TUS 能力(OPTIONS,公开端点):协议版本 / 扩展 / 单文件上限。 */
  capabilities(): Promise<TusCapabilities>
  /** 取消上传:session 置为 cancelled、释放预扣配额、删除 R2 临时对象。 */
  abort(id: string): Promise<void>
}

export function createUploadsNamespace(http: HttpCore): UploadsNamespace {
  return {
    create: async (input) => {
      const headers: Record<string, string> = {
        'Tus-Resumable': TUS_VERSION,
        'Upload-Length': String(input.uploadLength),
      }
      if (input.metadata !== undefined && Object.keys(input.metadata).length > 0) {
        headers['Upload-Metadata'] = encodeTusMetadata(input.metadata)
      }
      const res = await http.request<Response>({
        method: 'POST',
        path: '/v1/uploads',
        headers,
        response: 'raw',
        retry: false,
      })
      const location = res.headers.get('Location')
      if (location === null) {
        throw new PicoraApiError(res.status, 'TUS_PROTOCOL_ERROR', 'missing Location header in TUS creation response')
      }
      // Location 可能是相对路径(如 /v1/uploads/{sessionId}),按 baseUrl 解析为绝对 URL
      const uploadUrl = new URL(location, http.config.baseUrl).toString()
      const segments = new URL(uploadUrl).pathname.split('/').filter((s) => s.length > 0)
      const last = segments[segments.length - 1]
      if (last === undefined) {
        throw new PicoraApiError(res.status, 'TUS_PROTOCOL_ERROR', `cannot extract session id from Location: ${location}`)
      }
      return { id: decodeURIComponent(last), uploadUrl }
    },
    status: async (id) => {
      const res = await http.request<Response>({
        method: 'HEAD',
        path: `/v1/uploads/${encodeURIComponent(id)}`,
        headers: { 'Tus-Resumable': TUS_VERSION },
        response: 'raw',
      })
      return parseProgress(res)
    },
    get: async (id) => {
      const res = await http.request<Response>({
        method: 'GET',
        path: `/v1/uploads/${encodeURIComponent(id)}`,
        headers: { 'Tus-Resumable': TUS_VERSION },
        response: 'raw',
      })
      return parseProgress(res)
    },
    append: async (id, input) => {
      const res = await http.request<Response>({
        method: 'PATCH',
        path: `/v1/uploads/${encodeURIComponent(id)}`,
        headers: {
          'Tus-Resumable': TUS_VERSION,
          'Upload-Offset': String(input.offset),
          // TUS 规约固定 Content-Type;Uint8Array body 由 http core 透传,不会被 JSON 化
          'Content-Type': 'application/offset+octet-stream',
        },
        body: input.chunk,
        response: 'raw',
        retry: false,
      })
      return { offset: readRequiredIntHeader(res, 'Upload-Offset') }
    },
    capabilities: async () => {
      const res = await http.request<Response>({
        method: 'OPTIONS',
        path: '/v1/uploads',
        response: 'raw',
      })
      const versionsHeader = res.headers.get('Tus-Version') ?? res.headers.get('Tus-Resumable') ?? ''
      const extensionsHeader = res.headers.get('Tus-Extension') ?? ''
      return {
        versions: versionsHeader.split(',').map((s) => s.trim()).filter((s) => s.length > 0),
        extensions: extensionsHeader.split(',').map((s) => s.trim()).filter((s) => s.length > 0),
        maxSizeBytes: readOptionalIntHeader(res, 'Tus-Max-Size'),
      }
    },
    abort: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/uploads/${encodeURIComponent(id)}`,
        headers: { 'Tus-Resumable': TUS_VERSION },
        response: 'none',
      })
    },
  }
}

export const UPLOADS_COVERAGE = [
  { method: 'POST', path: '/v1/uploads', client: 'uploads.create' },
  { method: 'OPTIONS', path: '/v1/uploads', client: 'uploads.capabilities' },
  { method: 'HEAD', path: '/v1/uploads/{id}', client: 'uploads.status' },
  { method: 'GET', path: '/v1/uploads/{id}', client: 'uploads.get' },
  { method: 'PATCH', path: '/v1/uploads/{id}', client: 'uploads.append' },
  { method: 'DELETE', path: '/v1/uploads/{id}', client: 'uploads.abort' },
] as const satisfies readonly CoveredOperation[]
