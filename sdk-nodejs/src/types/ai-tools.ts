/**
 * AI 工具箱域类型(v0.3.0 AIGC 域批次)。
 *
 * 对应 spec tag=ai-tools 共 3 个 operation:工具清单(公开)/ 单工具执行 / 调用日志。
 * v0.48:5 个图片 AI 工具,Credit 预扣 + 24h 去重 + 失败自动 refund。
 */

/** AI 工具键(POST /v1/ai/{tool} 的 path 参数取值) */
export type AiToolKey = 'smart_crop' | 'alt_text' | 'auto_tag' | 'ocr' | 'bg_remove'

/** 工具输出形态 */
export type AiToolOutputType = 'image' | 'text' | 'tags' | 'markdown'

/** GET /v1/ai/tools 条目(工具 metadata + 定价;公开端点,前端渲染工具卡片用) */
export interface AiToolSpec {
  /** 工具键 */
  key: AiToolKey
  /** 底层服务提供方 */
  provider: 'replicate' | 'openai' | 'stub'
  /** 底层模型名 */
  model: string
  /** 平台成本(cents,参考值) */
  costCents: number
  /** 用户售价(Credit cents/次) */
  priceCents: number
  /** 输出形态 */
  output: AiToolOutputType
  /** 工具描述 */
  description: string
}

/** POST /v1/ai/{tool} 入参(imageId 与 imageUrl 二选一,均缺失 422) */
export interface InvokeAiToolInput {
  /** 已存在的 Picora 图片 ID(11 字符) */
  imageId?: string
  /** 外部图片 URL(与 imageId 二选一) */
  imageUrl?: string
  /** 工具特定参数(如 smart_crop 的 aspectRatios) */
  options?: Record<string, unknown>
}

/** 工具执行输出(按 type 取对应字段) */
export interface AiToolOutput {
  /** 输出形态 */
  type?: AiToolOutputType
  /** 产出图片 ID(type=image 时,如 bg_remove 的抠图结果) */
  imageId?: string
  /** 产出图片外链 URL(type=image 时) */
  imageUrl?: string
  /** 产出文本(type=text / markdown 时,如 alt_text / ocr 结果) */
  text?: string
  /** 产出标签(type=tags 时,auto_tag 结果) */
  tags?: string[]
}

/**
 * POST /v1/ai/{tool} 结果。HTTP 202 但实际同步完成(202 仅表示已计费),
 * 无需轮询,data 即最终结果;status=failed 时 Credit 已自动 refund。
 */
export interface AiToolResult {
  /** 调用日志 ID(nanoid 21 字符,与 logs() 条目对应) */
  logId: string
  /** 执行结果 */
  status: 'success' | 'failed'
  /** 本次执行的工具 */
  toolKey: AiToolKey
  /** 执行输出(status=failed 时缺省) */
  output?: AiToolOutput
  /** 本次消耗积分(Credit cents;failed 已 refund) */
  costCents: number
  /** 失败原因(status=failed 时) */
  failureReason?: string
  /** 执行耗时(ms) */
  durationMs?: number
}

/** GET /v1/ai/logs 条目(当前用户 AI 工具调用记录,倒序) */
export interface AiToolLogItem {
  /** 日志 ID(nanoid 21 字符) */
  id: string
  /** 工具键 */
  toolKey: string
  /** 输入图片 ID;外部 URL 输入时为 null */
  inputImageId: string | null
  /** 产出图片 ID;非 image 输出为 null */
  outputImageId: string | null
  /** 产出数据(文本/标签 JSON 序列化);非文本类输出为 null */
  outputData: string | null
  /** 执行结果状态 */
  status: string
  /** 消耗积分(Credit cents) */
  costCents: number
  /** 调用时间(ISO 8601) */
  createdAt: string
}

/** GET /v1/ai/logs 查询选项(非分页,直接返回最近记录) */
export interface AiToolLogsParams {
  /** 可选:按工具过滤 */
  tool?: AiToolKey
  /** 返回条数(1~100,默认 20) */
  limit?: number
}
