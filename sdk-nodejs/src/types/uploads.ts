/**
 * TUS 1.0 断点续传类型(v0.37.0 /v1/uploads;v0.3.0 媒体域批次进 SDK)。
 *
 * 协议参考 https://tus.io/protocols/resumable-upload.html。
 * 进度与能力信息均在响应 header 中(无 JSON body),SDK 以 raw 模式读取后归一为以下形态。
 */

/** POST /v1/uploads 创建入参 */
export interface TusCreateInput {
  /** 全文件总字节数(Upload-Length 头),创建时服务端按此值预扣存储配额 */
  uploadLength: number
  /**
   * TUS metadata 键值对(Upload-Metadata 头,SDK 自动按 TUS 规约 base64 编码)。
   * 推荐至少包含 filename / contentType / resourceType(image|video|audio)。
   * key 不得含空格与逗号(TUS 规约)。
   */
  metadata?: Record<string, string>
}

/** POST /v1/uploads 创建结果(从 201 响应 Location 头解析) */
export interface TusUploadSession {
  /** Session ID(Location 最后一段) */
  id: string
  /** Session 绝对 URL(相对 Location 已按 baseUrl 解析),后续 PATCH / HEAD / DELETE 目标 */
  uploadUrl: string
}

/** HEAD / GET /v1/uploads/{id} 进度查询结果(从响应头解析) */
export interface TusUploadProgress {
  /** 已接收字节数(Upload-Offset 头) */
  offset: number
  /** 全文件总字节数(Upload-Length 头);服务端未返回时为 null */
  length: number | null
  /** 会话过期时间(Upload-Expires 头,RFC 7231 格式);仅 GET 语义可能返回 */
  expiresAt?: string
}

/** PATCH /v1/uploads/{id} 分片追加结果 */
export interface TusAppendResult {
  /** 服务端确认的新 offset(Upload-Offset 头);等于旧 offset + 分片字节数 */
  offset: number
}

/** OPTIONS /v1/uploads 服务端能力探测结果(从响应头解析) */
export interface TusCapabilities {
  /** 服务端支持的协议版本列表(Tus-Version 头,逗号分隔) */
  versions: string[]
  /** 支持的协议扩展列表(Tus-Extension 头,逗号分隔;如 creation / expiration) */
  extensions: string[]
  /** 单文件大小上限(Tus-Max-Size 头,bytes);未声明时为 null */
  maxSizeBytes: number | null
}
