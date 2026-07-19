/**
 * 文档域类型(v0.3.0 docs/KB 域批次)。
 *
 * 对应 spec tag=docs 的 12 个 operation:Markdown 文档托管
 * (上传 / 列表 / 元数据 / 全文 / 批量删除 / 批量迁移 / 历史版本 revisions)。
 * KB(知识库)与冲突分支类型在 types/kbs.ts。
 */

/** GET /v1/docs 列表 / GET /v1/docs/{id} 单条文档元数据(不含正文,正文经 docs.raw 获取) */
export interface DocItem {
  /** 文档唯一 ID(nanoid 21 字符) */
  id: string
  /** 文档标题(从 frontmatter / h1 提取,或上传时显式指定) */
  title: string
  /** 上传时的原始文件名(含扩展名) */
  filename: string
  /** 内容字节数 */
  sizeBytes: number
  /** 正文词数(分词后) */
  wordCount: number
  /** 文档内图片总数(含改写前) */
  imageCount: number
  /** 成功改写为 Picora CDN 链接的内嵌 base64 图片数 */
  rewrittenCount: number
  /** 是否公开(公开文档 raw 端点无需认证) */
  isPublic: boolean
  /** 标签列表 */
  tags: string[]
  /** 卡片封面图 URL;null 表示文档无图片 */
  coverUrl: string | null
  /** 内容是否直存 DB(≤256KB;>256KB 走 R2)。拉全文一律用 docs.raw,无需关心此字段 */
  hasInlineContent: boolean
  /** 所属 KB ID;null = 未归属任一 KB */
  kbId: string | null
  /** KB 内 POSIX 相对路径;null = 未归属 KB */
  relativePath: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 最后更新时间(ISO 8601) */
  updatedAt: string
}

/** POST /v1/docs 上传入参(JSON body,非 multipart;正文直接放 content 字符串) */
export interface CreateDocInput {
  /** 文件名,必须以 .md 或 .markdown 结尾(≤255 字符) */
  filename: string
  /** Markdown 原文(含可选 YAML frontmatter),最大 5 MB */
  content: string
  /** 文档标题(覆盖 frontmatter / h1 提取结果,≤200 字符) */
  title?: string
  /** 标签列表(最多 10 个,每个 ≤32 字符) */
  tags?: string[]
  /** 是否公开,默认 true */
  isPublic?: boolean
  /** 是否自动改写内嵌 base64 图片为 CDN URL,默认 true;关闭后内嵌图片保留原样 */
  rewriteImages?: boolean
  /** 归属 KB ID(nanoid 21 字符,需与 relativePath 同时提供)。批量写入推荐走 kbs.sync */
  kbId?: string
  /** KB 内 POSIX 相对路径(≤1024 字符,需与 kbId 同时提供;禁止绝对路径 / `..` 段) */
  relativePath?: string
}

/**
 * POST /v1/docs 上传结果。
 * 服务端 201 = 新文档;200 + duplicate=true = 内容 sha256 命中既有文档
 * (返回已有文档,不计配额)。
 */
export interface DocUploadResult extends DocItem {
  /** 命中去重时为 true(返回的是既有文档,本次未新建) */
  duplicate?: boolean
}

/** GET /v1/docs 查询参数 */
export interface DocListParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 每页数量(1-50,默认 20) */
  limit?: number
  /** 全文搜索关键词(匹配标题 / 标签) */
  q?: string
  /** 按标签过滤(单标签精确匹配) */
  tag?: string
  /** 按可见性过滤;不传返回全部 */
  isPublic?: boolean
  /** 排序字段,默认 updated_at */
  sort?: 'updated_at' | 'created_at' | 'title'
  /** 按 KB 过滤(传字符串 'null' 返回未归属 KB 的文档) */
  kbId?: string
  /** 按 relativePath 前缀过滤(需配合 kbId 使用) */
  prefix?: string
}

/** PATCH /v1/docs/{id} 入参(至少提供一个字段;正文不可经此端点修改,需重新上传) */
export interface UpdateDocInput {
  /** 新标题(≤200 字符) */
  title?: string
  /** 是否公开 */
  isPublic?: boolean
  /** 完整替换的标签列表(≤10 个) */
  tags?: string[]
  /** 移入 KB(需与 relativePath 同时提供);显式传 null 移出 KB */
  kbId?: string | null
  /** KB 内新的相对路径(需与 kbId 同时提供) */
  relativePath?: string
}

/** DELETE /v1/docs 批量删除入参 */
export interface DocsBatchDeleteInput {
  /** 要删除的文档 ID 列表(nanoid 21 字符,单次最多 50 个) */
  ids: string[]
  /** true 执行硬删(同时清理 R2 文件);默认软删 */
  hard?: boolean
}

/** DELETE /v1/docs 批量删除结果 */
export interface DocsBatchDeleteResult {
  /** 成功删除数 */
  deleted: number
  /** 删除失败数(文档不存在或无权限) */
  failed: number
}

/** POST /v1/docs/raw:batch 成功项(顺序与入参 ids 一致) */
export interface DocRawBatchItem {
  /** 文档 ID(nanoid 21 字符) */
  id: string
  /** 完整 Markdown 文本 */
  content: string
  /** 最后更新时间(ISO 8601) */
  updatedAt: string
  /** SHA-256(content) 十六进制,64 字符 */
  sourceHash: string
}

/** POST /v1/docs/raw:batch 失败项(越权 / 不存在 / 已软删统一归 NOT_FOUND,不泄漏存在性) */
export interface DocRawBatchFailure {
  /** 文档 ID */
  id: string
  /** NOT_FOUND=不可见;CONTENT_FETCH_FAILED=内容读取失败 */
  reason: 'NOT_FOUND' | 'CONTENT_FETCH_FAILED'
}

/** POST /v1/docs/raw:batch 结果(成功项与失败项分区返回) */
export interface DocsRawBatchResult {
  docs: DocRawBatchItem[]
  failed: DocRawBatchFailure[]
}

/** POST /v1/docs/batch-move 入参 */
export interface DocsBatchMoveInput {
  /** 文档 ID 列表(nanoid 21 字符,单次最多 50 个) */
  ids: string[]
  /** 目标合集 ID(nanoid 21 字符);null = 移出合集(kb_id / relative_path 置 NULL) */
  kbId: string | null
}

/** POST /v1/docs/batch-move 结果(逐篇处理,部分失败不回滚) */
export interface DocsBatchMoveResult {
  /** 成功迁移的文档 id 列表 */
  moved: string[]
  /** 失败列表(路径冲突 / 目标合集不存在等,reason 为服务端失败原因码) */
  failed: Array<{ id: string; reason: string }>
}

/** 历史版本来源:upload=直接上传替换 / sync=KB 同步替换 / restore=版本还原 */
export type DocRevisionOrigin = 'upload' | 'sync' | 'restore'

/** GET /v1/docs/{id}/revisions 单条历史版本元数据(v0.74.0 文档版本控制) */
export interface DocRevision {
  /** 版本 ID(nanoid 21 字符) */
  id: string
  /** 单调递增版本号(每文档独立,从 1 开始) */
  revNumber: number
  /** 该版本内容字节数 */
  sizeBytes: number
  /** 版本来源 */
  origin: DocRevisionOrigin
  /** 该版本内容 SHA-256(hex 64 字符) */
  sourceHash: string
  /** 快照创建时间(ISO 8601) */
  createdAt: string
}

/** GET /v1/docs/{id}/revisions 结果(revNumber 倒序) */
export interface DocRevisionList {
  /** 历史版本列表 */
  revisions: DocRevision[]
  /** 该文档全部历史版本占用字节合计 */
  totalBytes: number
}

/** GET /v1/docs/{id}/revisions/{revId} 结果(版本元数据 + 完整正文) */
export interface DocRevisionDetail extends DocRevision {
  /** 该版本完整 Markdown 正文 */
  content: string
}

/**
 * POST /v1/docs/{id}/revisions/{revId}/restore 结果。
 * 结构同上传响应:还原产生新的当前版文档(文档 ID 更新,历史版本自动重挂靠);
 * 还原内容与当前内容 hash 一致时 duplicate=true 且无副作用。
 */
export interface RestoreDocRevisionResult extends DocItem {
  /** 还原后当前版内容 SHA-256(hex 64 字符) */
  sourceHash?: string
  /** 还原内容与当前内容相同(hash 一致)时为 true,本次调用无副作用 */
  duplicate?: boolean
}
