/**
 * AIGC 域类型(v0.3.0 AIGC 域批次)。
 *
 * 对应 spec tag=aigc 共 30 个 operation:项目(projects)→ 剧集(episodes)→
 * 内容(contents)→ 资产(assets)四层结构,外加批量任务(batch-jobs)、
 * 起手模板(templates)与生成入口(generate / generate-batch)。
 *
 * 注意:spec 已声明 `/v1/aigc/projects/*` 前缀为废弃(响应带 Deprecation 头),
 * 新集成建议迁移到 `/v1/collections?type=aigc`;SDK 按契约现状仍完整覆盖。
 */

/** AIGC 项目类型(创作品类;模板 category 与之同枚举) */
export type AigcProjectType = 'comic' | 'wechat' | 'picturebook' | 'tutorial' | 'custom'

/** AIGC 项目状态(deleted 为软删,由后续 cron 异步清理) */
export type AigcProjectStatus = 'active' | 'archived' | 'deleted'

/** AIGC 项目对象(GET /v1/aigc/projects 列表条目 / GET /v1/aigc/projects/{id} 详情) */
export interface AigcProject {
  /** 项目 ID(nanoid 21 字符) */
  id: string
  /** 所属用户 ID */
  userId: string
  /** 组织场景下的归属主体 ID(个人项目与 userId 相同;服务端可能缺省) */
  ownerId?: string
  /** 项目名(≤120 字符) */
  name: string
  /** 项目类型;创建后不可修改 */
  type: AigcProjectType
  /** 描述;null 表示未填写 */
  description?: string | null
  /** 创作 KB ID(prompt 草稿所在知识库);未绑定为 null */
  creatorKbId?: string | null
  /** 产出 KB ID(sync-to-output 目标知识库);未绑定为 null */
  outputKbId?: string | null
  /** 剧集数(服务端缓存值) */
  episodeCount?: number
  /** 资产数(服务端缓存值) */
  assetCount?: number
  /** 项目状态 */
  status: AigcProjectStatus
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 最后更新时间(ISO 8601) */
  updatedAt?: string
}

/** GET /v1/aigc/projects 查询选项(游标分页,按 created_at DESC + id DESC 排序) */
export interface AigcProjectListParams {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 每页数量(默认 20,最大 100) */
  limit?: number
  /** 按项目类型过滤 */
  type?: AigcProjectType
  /** 按状态过滤 */
  status?: AigcProjectStatus
}

/** POST /v1/aigc/projects 创建入参(创建空项目;需带 starter docs + KB 用 fromTemplate) */
export interface CreateAigcProjectInput {
  /** 项目名(1~120 字符) */
  name: string
  /** 项目类型;创建后不可修改 */
  type: AigcProjectType
  /** 描述(≤500 字符) */
  description?: string
}

/** PATCH /v1/aigc/projects/{id} 入参(type 不可改;status 仅可在 active/archived 间切换) */
export interface UpdateAigcProjectInput {
  /** 新项目名(≤120 字符) */
  name?: string
  /** 新描述 */
  description?: string
  /** 新状态(不含 deleted;删除走 delete 方法) */
  status?: 'active' | 'archived'
}

/** POST /v1/aigc/projects/from-template 入参 */
export interface CreateAigcProjectFromTemplateInput {
  /** 模板 ID(须为 active 状态模板,否则 404) */
  templateId: string
  /** 新项目名(1~120 字符) */
  projectName: string
}

/** POST /v1/aigc/projects/{id}/sync-to-output 结果(prompt 块同步到产出 KB 的统计) */
export interface AigcSyncToOutputResult {
  /** 本次更新的产出 KB 文档数 */
  docsUpdated: number
  /** 注入的图片引用数 */
  assetsLinked: number
  /** 非致命告警(如个别 prompt 块无当前版本资产) */
  warnings?: string[]
}

/** AIGC 剧集 / 内容共用状态机 */
export type AigcEpisodeStatus = 'draft' | 'generating' | 'ready' | 'published'

/** AIGC 剧集对象(项目下的一集) */
export interface AigcEpisode {
  /** 剧集 ID(nanoid 21 字符) */
  id: string
  /** 所属项目 ID */
  projectId: string
  /** 在项目内的序号(正整数) */
  sequenceNo: number
  /** 标题(≤200 字符) */
  title: string
  /** 状态 */
  status: AigcEpisodeStatus
  /** 内容数(服务端缓存值) */
  contentCount: number
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 最后更新时间(ISO 8601) */
  updatedAt: string
}

/** POST /v1/aigc/projects/{id}/episodes 入参 */
export interface CreateAigcEpisodeInput {
  /** 标题(1~200 字符) */
  title: string
  /** 在项目内的序号;省略默认追加到末尾(project.episodeCount + 1) */
  sequenceNo?: number
}

/** PATCH /v1/aigc/episodes/{id} 入参(至少提供一个字段) */
export interface UpdateAigcEpisodeInput {
  /** 新标题(1~200 字符) */
  title?: string
  /** 新序号(正整数) */
  sequenceNo?: number
  /** 新状态 */
  status?: AigcEpisodeStatus
}

/** AIGC 内容对象(剧集下的一页/一格,可关联 Markdown 文档) */
export interface AigcContent {
  /** 内容 ID(nanoid 21 字符) */
  id: string
  /** 所属剧集 ID */
  episodeId: string
  /** 关联的 Markdown 文档 ID(21 字符);null 表示未绑定 */
  docId: string | null
  /** 在剧集内的序号(正整数) */
  sequenceNo: number
  /** 标题(≤200 字符) */
  title: string
  /** 文档内 prompt 块数(服务端缓存值) */
  promptCount: number
  /** 资产数(服务端缓存值) */
  assetCount: number
  /** 状态 */
  status: AigcEpisodeStatus
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 最后更新时间(ISO 8601) */
  updatedAt: string
}

/** POST /v1/aigc/episodes/{id}/contents 入参 */
export interface CreateAigcContentInput {
  /** 标题(1~200 字符) */
  title: string
  /** 关联文档 ID(21 字符) */
  docId?: string
  /** 在剧集内的序号;省略默认追加到末尾(episode.contentCount + 1) */
  sequenceNo?: number
}

/** PATCH /v1/aigc/contents/{id} 入参(至少提供一个字段) */
export interface UpdateAigcContentInput {
  /** 新标题(1~200 字符) */
  title?: string
  /** 关联文档 ID(21 字符);传 null 解绑 */
  docId?: string | null
  /** 新序号(正整数) */
  sequenceNo?: number
  /** 新状态 */
  status?: AigcEpisodeStatus
}

/** AIGC 资产状态(deleted 为软删,可 restore 恢复) */
export type AigcAssetStatus = 'pending' | 'generating' | 'ready' | 'failed' | 'deleted'

/** AIGC 资产对象(一次生成产物;同 promptBlockHash 的资产构成一个版本组) */
export interface AigcAsset {
  /** 资产 ID(nanoid 21 字符) */
  id: string
  /** 所属 content ID;游离资产(未挂载到内容)为 null */
  contentId: string | null
  /** 生成成功后关联的图片 ID(11 字符);未完成/失败为 null */
  imageId: string | null
  /** prompt 块的 sha256(64 位 hex);同 hash 为一个版本组 */
  promptBlockHash: string
  /** 生成该资产的 prompt 块(YAML,v0.38 prompt code-block 协议) */
  promptYaml: string
  /** 生成模型名(如 flux-schnell / dall-e-3) */
  model: string
  /** 本次生成消耗积分(Credit cents) */
  costCents: number
  /** 版本组内序号 */
  sequenceNo: number
  /** 资产状态 */
  status: AigcAssetStatus
  /** 失败原因;非 failed 为 null */
  failureReason: string | null
  /** 生成服务提供方;null 表示未知 */
  generatorProvider: string | null
  /** 生成服务侧任务 ID;null 表示同步生成无任务号 */
  generatorJobId: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 生成完成时间(ISO 8601);未完成为 null */
  completedAt: string | null
  /** 是否为该版本组当前采用版本 */
  isCurrent: boolean
  /** 被设为当前版本的时间(ISO 8601);从未 promote 为 null */
  promotedAt: string | null
}

/** GET /v1/aigc/assets 查询选项(按 prompt 块 hash 查该版本组全部资产版本) */
export interface AigcAssetListParams {
  /** prompt 块的 sha256(64 位 hex,^[a-f0-9]{64}$),必填 */
  promptBlockHash: string
}

/**
 * GET /v1/aigc/assets/{id}/status 轮询结果(对应 spec components.schemas.AigcAssetStatus)。
 */
export interface AigcAssetStatusInfo {
  /** 资产 ID(nanoid 21 字符) */
  assetId: string
  /** 生成状态(轮询终态为 ready / failed) */
  status: 'pending' | 'generating' | 'ready' | 'failed'
  /** 本次生成扣费(分);失败已退款 */
  costCents: number
  /** 扣费后 Credit 余额(分) */
  balanceAfter: number
  /** 生成成功后的图片外链 URL(status=ready 时) */
  imageUrl?: string | null
  /** 失败原因(status=failed 时) */
  failureReason?: string | null
}

/** POST /v1/aigc/generate 入参(Credit 预扣 + 失败自动 refund) */
export interface GenerateAigcAssetInput {
  /** prompt 块(YAML,v0.38 prompt code-block 协议;1~8192 字符,含 model / prompt / aspect_ratio / seed) */
  promptYaml: string
  /** 可选:关联到 content(nanoid 21 字符),自动累加 asset_count */
  contentId?: string
}

/** generate 双形态结果的公共字段 */
export interface GenerateAigcAssetResultBase {
  /** 本次生成创建的资产 ID(nanoid 21 字符) */
  assetId: string
  /** 本次生成消耗积分(Credit cents,预扣) */
  costCents: number
  /** 扣费后 Credit 余额(cents) */
  balanceAfter: number
}

/** 同步模型(flux-schnell / dall-e-3 / sdxl-lightning)一次返回完成态,imageUrl 立即可用 */
export interface GenerateAigcAssetSyncResult extends GenerateAigcAssetResultBase {
  status: 'ready'
  /** 生成图片外链 URL(同步形态立即可用) */
  imageUrl: string
}

/** 异步模型(flux-1.1-pro / sd3)返回受理态,须轮询 GET /v1/aigc/assets/{assetId}/status 直到终态 */
export interface GenerateAigcAssetAsyncResult extends GenerateAigcAssetResultBase {
  status: 'pending' | 'generating'
}

/** 同步形态下的生成失败(Credit 已自动 refund) */
export interface GenerateAigcAssetFailedResult extends GenerateAigcAssetResultBase {
  status: 'failed'
  /** 失败原因(服务端可能缺省) */
  failureReason?: string
}

/**
 * POST /v1/aigc/generate 结果(HTTP 固定 202,同步/异步双形态由 data.status 区分):
 *   - status='ready'              → 同步模型已完成,imageUrl 可直接使用
 *   - status='pending'/'generating' → 异步模型受理中,轮询 aigc.assets.status(assetId)
 *   - status='failed'             → 生成失败,Credit 已 refund
 */
export type GenerateAigcAssetResult =
  | GenerateAigcAssetSyncResult
  | GenerateAigcAssetAsyncResult
  | GenerateAigcAssetFailedResult

/** 批量生成子任务(一个 prompt × count 张) */
export interface AigcBatchJobItemInput {
  /** prompt 块(YAML,v0.38 prompt code-block 协议;1~8000 字符) */
  promptYaml: string
  /** 本 prompt 生成张数(1~8,受 model.maxOutputCount 上限约束) */
  count: number
  /** v0.45 image-to-image:参考图 URL(≤500 字符) */
  referenceImageUrl?: string
}

/** POST /v1/aigc/generate-batch 入参(单批最多 50 张;同一用户同时仅允许 1 个进行中 batch) */
export interface GenerateAigcBatchInput {
  /** 子任务列表(1~50 项;各项 count 之和为本批总张数) */
  jobs: AigcBatchJobItemInput[]
  /** 可选:关联到 AIGC project(nanoid 21 字符) */
  projectId?: string
  /** 可选:关联到 episode > content(nanoid 21 字符),自动累加 asset_count */
  contentId?: string
}

/** POST /v1/aigc/generate-batch 202 受理结果(轮询 aigc.batchJobs.get(id) 看进度) */
export interface GenerateAigcBatchAccepted {
  /** 批量任务 ID(nanoid 21 字符) */
  id: string
  /** 受理时状态 */
  status: 'pending' | 'running'
  /** 本批总张数(各 prompt count 之和) */
  total: number
  /** 预扣总价(Credit cents) */
  totalCostCents: number
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/** AIGC 批量任务状态 */
export type AigcBatchJobStatus = 'pending' | 'running' | 'completed' | 'partial' | 'cancelled' | 'failed'

/** AIGC 批量生成任务(GET /v1/aigc/batch-jobs/{id} 进度对象) */
export interface AigcBatchJob {
  /** 批量任务 ID(nanoid 21 字符) */
  id: string
  /** 总张数 */
  total: number
  /** 已完成张数 */
  completed: number
  /** 失败张数 */
  failed: number
  /** 已取消张数 */
  cancelled?: number
  /** 预扣总价(Credit cents) */
  totalCostCents?: number
  /** 实际结算价(Credit cents;失败/取消部分已退款) */
  actualCostCents?: number
  /** 任务状态 */
  status: AigcBatchJobStatus
  /** 本批产生的资产 ID 列表 */
  assetIds?: string[]
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 完成时间(ISO 8601);未完成为 null */
  completedAt?: string | null
}

/**
 * AIGC 起手模板(GET /v1/aigc/templates 条目 / GET /v1/aigc/templates/{id} 详情,
 * 对应 spec components.schemas.AigcTemplate)。未知扩展字段经索引签名透出;
 * detail 相比列表额外含完整 spec(creatorKb / outputKb / starterDocs / episodes 骨架)。
 */
export interface AigcTemplate {
  /** 模板 ID */
  id: string
  /** 模板名 */
  name?: string
  /** 模板品类(与项目类型同枚举) */
  category?: AigcProjectType
  /** 描述 */
  description?: string
  /** 是否 featured 内置模板 */
  featured?: boolean
  /** 被使用次数(fromTemplate 成功后自动累加) */
  useCount?: number
  /** 服务端扩展字段(spec 未定型,如 detail 的 specJson 骨架) */
  [key: string]: unknown
}

/** GET /v1/aigc/templates 查询选项 */
export interface AigcTemplateListParams {
  /** 按品类过滤 */
  category?: AigcProjectType
  /** true 时只返回 featured 内置模板 */
  featuredOnly?: boolean
}

/** 项目树中的内容节点(content + 其资产) */
export interface AigcContentTreeNode extends AigcContent {
  /** 该内容下的资产(spec 未定型,服务端可能缺省) */
  assets?: AigcAsset[]
}

/** 项目树中的剧集节点(episode + 其内容) */
export interface AigcEpisodeTreeNode extends AigcEpisode {
  /** 该剧集下的内容(spec 未定型,服务端可能缺省) */
  contents?: AigcContentTreeNode[]
}

/**
 * GET /v1/aigc/projects/{id}/tree 结果:project → episodes → contents → assets
 * 4 层嵌套结构(前端渲染左侧导航树用),对应 spec components.schemas.AigcProjectTree;嵌套字段做防御性可选。
 */
export interface AigcProjectTree extends AigcProject {
  /** 项目下的剧集树(spec 未定型,服务端可能缺省) */
  episodes?: AigcEpisodeTreeNode[]
}
