/**
 * 教学画板域类型(boards,v0.80.0)。
 *
 * `.boardraw` = Excalidraw 兼容的场景 JSON;托管语义与 docs 平行,
 * 但内容是整份场景 JSON(≤256KB 内联直存,更大存 R2,调用方统一用 /raw 取全文)。
 */

/** GET /v1/boards 列表项 / 单个画板元数据(不含场景全文,全文走 boards.getRaw) */
export interface Board {
  /** 画板唯一 ID,nanoid 21 字符 */
  id: string
  /** 画板标题(默认取文件名去 .boardraw 扩展名) */
  title: string
  /** 上传时的原始文件名(含 .boardraw 扩展名) */
  filename: string
  /** 场景 JSON 字节数 */
  sizeBytes: number
  /** 有效场景元素总数(不含 isDeleted 软删除元素) */
  elementCount: number
  /** 是否公开可读(公开画板 getRaw 无需认证) */
  isPublic: boolean
  /** 标签列表(最多 10 个,每个 ≤32 字符) */
  tags: string[]
  /**
   * 内容存储位置抽象:true = 场景 JSON 内联直存(≤256KB),false = 存于 R2。
   * 调用方无需感知差异,统一用 getRaw 取全文。
   */
  hasInlineContent: boolean
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 最近更新时间(ISO 8601) */
  updatedAt: string
}

/**
 * GET /v1/boards 列表响应。
 *
 * 注:boards 端点仅返回 `items` + `nextCursor`(不含 media 端点的 `hasMore`),
 * 故不复用 PaginatedResponse;`nextCursor === null` 即已到末页。
 */
export interface BoardListResult {
  /** 当前页画板列表 */
  items: Board[]
  /** 下一页游标;null 表示已到末页 */
  nextCursor: string | null
}

/** GET /v1/boards 列表查询参数(游标分页;sort 切换时游标失效,需 reset) */
export interface BoardListParams {
  /** 上一页 nextCursor;首次不传或传空串视为首页 */
  cursor?: string
  /** 每页数量,1~50,默认 20 */
  limit?: number
  /** 标题 / 文件名模糊搜索(≤100 字符) */
  q?: string
  /** 按单标签精确过滤(≤200 字符) */
  tag?: string
  /** 公开性过滤;不传 = 全部 */
  isPublic?: boolean
  /** 排序,默认 created_desc */
  sort?: 'created_desc' | 'created_asc' | 'updated_desc' | 'updated_asc'
}

/** POST /v1/boards 入参(上传新画板) */
export interface CreateBoardInput {
  /** 文件名,必须以 `.boardraw` 结尾(1~255 字符) */
  filename: string
  /** Excalidraw 兼容的场景 JSON 字符串,最大 5 MB */
  content: string
  /** 画板标题(≤200 字符);缺省取文件名去扩展名 */
  title?: string
  /** 标签列表(最多 10 个,每个 ≤32 字符) */
  tags?: string[]
  /** 是否公开可读,默认 false */
  isPublic?: boolean
}

/** PATCH /v1/boards/{id} 入参(至少提供一个字段) */
export interface UpdateBoardInput {
  /** 新标题(≤200 字符) */
  title?: string
  /** 公开性开关 */
  isPublic?: boolean
  /** 覆盖标签列表(最多 10 个,每个 ≤32 字符) */
  tags?: string[]
}

/** DELETE /v1/boards 批量删除结果 */
export interface BoardBatchDeleteResult {
  /** 成功删除的画板 ID 列表 */
  deleted: string[]
  /** 删除失败项(含失败原因) */
  failed: { id: string; reason: string }[]
}
