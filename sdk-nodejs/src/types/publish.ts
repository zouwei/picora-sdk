/**
 * publish(多平台一键发布)+ published-pages(发布页)+ mcp(工具 catalog / 用量)
 * 域类型(v0.3.0 平台域批次)。
 *
 * publish(v0.54):绑定微信公众号/小红书/掘金/Medium/Substack 后,把发布页
 * 并发发布到 1-5 个平台(202 异步 job)。
 * published-pages(v0.43):从 KB 文档创建公开渲染页(/p/{slug},无需认证)。
 * mcp:公开工具 catalog(/mcp/tools.json)+ 当月调用用量(/v1/mcp/usage)。
 */

// ────────────────────────── publish ──────────────────────────

/** 支持的发布平台 */
export type PublishPlatformKey = 'wechat' | 'xiaohongshu' | 'juejin' | 'medium' | 'substack'

/** 已绑定的发布平台(v0.54) */
export interface PublishPlatformBinding {
  /** 绑定记录 ID(nanoid 21 字符) */
  id: string
  /** 所属用户 ID */
  ownerId: string
  /** 平台标识 */
  platform: PublishPlatformKey
  /** 平台侧用户 ID */
  externalUserId?: string
  /** 授权状态 */
  status: 'active' | 'revoked' | 'expired'
  /** 授权过期时间(ISO 8601);null 表示长期有效 */
  expiresAt?: string | null
  /** 绑定时间(ISO 8601) */
  createdAt: string
}

/** POST /v1/publish/platforms 入参(wechat/medium=OAuth · xiaohongshu/juejin/substack=AccessKey) */
export interface ConnectPlatformInput {
  /** 平台标识 */
  platform: PublishPlatformKey
  /** 平台特定凭据(OAuth code 或 access_key + secret) */
  credentials: Record<string, unknown>
}

/** 发布任务状态(partial=部分平台失败,failed=全部失败) */
export type PublishJobStatus = 'pending' | 'publishing' | 'partial' | 'completed' | 'failed'

/** 多平台发布任务(v0.54) */
export interface PublishJob {
  /** 任务 ID(nanoid 21 字符) */
  id: string
  /** 所属用户 ID */
  ownerId: string
  /** 来源文档 ID */
  docId: string
  /** 目标平台列表 */
  platforms: string[]
  /** 任务总状态 */
  status: PublishJobStatus
  /** 每平台子任务结果(成功 URL 或失败原因,key 为平台名) */
  results?: Record<string, unknown>
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 完成时间(ISO 8601);null 表示未完成 */
  completedAt?: string | null
}

/** POST /v1/publish/jobs 入参 */
export interface CreatePublishJobInput {
  /** 发布页 ID(必须为已 publish 状态) */
  pageId: string
  /** 目标平台(1~5 个,须均已绑定) */
  platforms: PublishPlatformKey[]
  /** 每平台覆盖字段(标题/封面/摘要),key 为平台名 */
  overrides?: Record<string, Record<string, unknown>>
}

// ────────────────────────── published-pages ──────────────────────────

/** 发布页渲染模板 */
export type PublishedPageLayout = 'article' | 'comic' | 'gallery'

/** 发布页状态 */
export type PublishedPageStatus = 'draft' | 'published' | 'unpublished'

/** 发布页对象(v0.43) */
export interface PublishedPage {
  /** 发布页 ID(nanoid 21 字符) */
  id: string
  /** 所属用户 ID */
  ownerId: string
  /** 来源 KB 文档 ID */
  docId: string
  /** URL slug(全 owner 唯一;公开访问路径 /p/{slug}) */
  slug: string
  /** 页面标题 */
  title: string
  /** 页面描述;null 表示未填写 */
  description?: string | null
  /** 封面图片 ID(nanoid 11 字符);null 表示无封面 */
  coverImageId?: string | null
  /** 渲染模板 */
  layout: PublishedPageLayout
  /** 发布状态 */
  status: PublishedPageStatus
  /** 浏览量(后台异步累加) */
  viewCount?: number
  /** 发布时间(ISO 8601);null 表示未发布 */
  publishedAt?: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 更新时间(ISO 8601) */
  updatedAt?: string
}

/** POST /v1/published-pages 入参 */
export interface CreatePublishedPageInput {
  /** 来源 KB 文档 ID(nanoid 21 字符) */
  docId: string
  /** URL slug(2~64 字符,小写字母+数字+短横线,全 owner 唯一) */
  slug: string
  /** 页面标题(1~200 字符) */
  title: string
  /** 渲染模板(决定页面样式) */
  layout: PublishedPageLayout
  /** 页面描述(≤500 字符) */
  description?: string
  /** 封面图片 ID(nanoid 11 字符) */
  coverImageId?: string
}

/** PATCH /v1/published-pages/{id} 入参(slug 不可改,要改请重建) */
export interface UpdatePublishedPageInput {
  /** 页面标题 */
  title?: string
  /** 页面描述 */
  description?: string
  /** 封面图片 ID */
  coverImageId?: string
  /** 渲染模板 */
  layout?: PublishedPageLayout
}

/** GET /v1/published-pages/{id}/export/wechat 结果 */
export interface WechatExportResult {
  /** 公众号兼容 HTML(段落/标题/图片/列表均内联样式,可直接粘贴到公众号编辑器) */
  html: string
}

// ────────────────────────── mcp ──────────────────────────

/** MCP 工具元数据条目 */
export interface McpToolInfo {
  /** MCP 工具名(snake_case,如 'upload_image') */
  name: string
  /** 工具所属域(images / kbs / docs 等) */
  domain: string
  /** 工具功能描述 */
  description?: string
  /** 入参 JSON Schema(MCP 标准格式) */
  inputSchema?: Record<string, unknown>
}

/** GET /mcp/tools.json 结果(公开端点,裸 JSON 无业务包装;边缘缓存 5 分钟) */
export interface McpToolsCatalog {
  /** catalog 版本(如 'v0.33.0') */
  version: string
  /** 生成时间(ISO 8601) */
  generatedAt: string
  /** 汇总统计 */
  totals?: {
    /** 工具总数 */
    tools?: number
    /** 按 domain 分组的工具数量 */
    byDomain?: Record<string, number>
  }
  /** 工具列表(按 domain 排列) */
  tools: McpToolInfo[]
}

/** 按工具拆分的 MCP 调用统计 */
export interface McpToolUsage {
  /** 工具 key */
  toolKey: string
  /** 计费档位 */
  tier: 'read' | 'write' | 'aigc'
  /** 调用次数 */
  calls: number
  /** 累计费用(cents) */
  costCents: number
}

/** GET /v1/mcp/usage 结果(v0.47:本月 MCP 调用统计) */
export interface McpUsage {
  /** 统计月份(如 '2026-05') */
  yearMonth: string
  /** 总调用次数 */
  totalCalls: number
  /** 累计费用(cents) */
  totalCostCents: number
  /** 已用免费额度次数 */
  freeQuotaUsed: number
  /** 免费额度上限 */
  freeQuotaLimit: number
  /** 按工具拆分明细 */
  byTool: McpToolUsage[]
}
