/**
 * 知识库(KB)域类型(v0.3.0 docs/KB 域批次)。
 *
 * 对应 spec tag=kbs(CRUD / manifest / sync / tree / raw)与 tag=kb-conflicts
 * (冲突分支 list / create / accept / discard)共 13 个 operation。
 * 文档本体类型在 types/docs.ts。
 */

/** GET /v1/kbs 列表 / GET /v1/kbs/{id} 单条 KB 记录 */
export interface Kb {
  /** KB ID(nanoid 21 字符) */
  id: string
  /** 显示名(≤120 字符) */
  name: string
  /** 路径友好短标识,^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$;创建后不可修改 */
  slug: string
  /** 描述;null 表示未填写 */
  description: string | null
  /** 当前 KB 内活跃文档数(服务端缓存值) */
  docCount: number
  /** 当前 KB 内所有文档总字节数(服务端缓存值) */
  sizeBytes: number
  /** 是否为默认 KB(每用户至多 1 个) */
  isDefault: boolean
  /** 创建时间(ISO 8601) */
  createdAt: string
  /** 最后更新时间(ISO 8601) */
  updatedAt: string
}

/** GET /v1/kbs 查询选项 */
export interface KbListOptions {
  /** 上一页响应的 nextCursor;首页不传 */
  cursor?: string
  /** 每页数量 */
  limit?: number
  /** 排序字段,默认 updated_at DESC */
  sort?: 'updated_at' | 'name'
}

/** POST /v1/kbs 创建入参(slug 缺省由 name 自动推导;单用户 KB 上限 Trial 5 / Pro 50 / Pro+ 500) */
export interface CreateKbInput {
  /** 显示名(≤120 字符) */
  name: string
  /** 路径友好短标识(可选,不传自动推导;(userId, slug) 全局唯一) */
  slug?: string
  /** 描述(≤500 字符) */
  description?: string
}

/** PATCH /v1/kbs/{id} 入参(slug 创建后不可修改) */
export interface UpdateKbInput {
  /** 新的显示名(≤120 字符) */
  name?: string
  /** 新的描述(≤500 字符) */
  description?: string
  /** 设为默认 KB;true 时同用户其他 KB 的 isDefault 自动重置为 false */
  isDefault?: boolean
}

/** KB 同步协议版本(Picora-Sync-Version 请求头值;v1 将于 2026-12-31 弃用) */
export type KbSyncProtocolVersion = '1' | '2'

/** GET /v1/kbs/{id}/manifest 选项 */
export interface KbManifestOptions {
  /** 增量同步起点(ISO 8601):返回该时间之后有变动的条目(含软删);不传返回全量活跃文档 */
  since?: string
  /** 上一页响应的 nextCursor;首页不传(大型 KB 多页拉取) */
  cursor?: string
  /** 每页条数,最大 1000,默认 200 */
  limit?: number
  /** 协议版本(Picora-Sync-Version 头)。'2' 启用 tombstones + 增量优化;缺省走服务端 v1 兼容行为 */
  version?: KbSyncProtocolVersion
  /** 条件请求(If-None-Match 头):传上一次响应的 etag,KB 无变化时服务端 304、SDK 返回 null */
  ifNoneMatch?: string
}

/** Manifest 条目(轻量 metadata,不含文档内容) */
export interface KbManifestEntry {
  /** POSIX 相对路径(UTF-8,NFC 归一化) */
  relativePath: string
  /** 文档 SHA-256 十六进制摘要;软删项为 null */
  sourceHash: string | null
  /** 字节数;软删项为 null */
  sizeBytes: number | null
  /** 最后修改时间;软删项为 null */
  updatedAt: string | null
  /** 软删除时间;活跃文档为 null */
  deletedAt: string | null
}

/** 硬删文档墓碑(仅协议 v2 返回;保留 30 天,pro_plus 90 天,用于跨客户端删除事件同步) */
export interface KbTombstoneEntry {
  /** 文档 nanoid(21 字符) */
  docId: string
  /** 删除前的相对路径 */
  relativePath: string
  /** 删除前的内容 sha256-hex */
  sourceHash: string
  /** 删除时间戳(ISO 8601) */
  deletedAt: string
}

/**
 * GET /v1/kbs/{id}/manifest 结果(200 时;304 时 kbs.manifest 直接返回 null)。
 * etag 从响应 ETag 头提取,下次轮询经 KbManifestOptions.ifNoneMatch 回传。
 */
export interface KbManifest {
  /** KB ID */
  kbId: string
  /** Manifest 条目(按 updated_at DESC, id DESC 排序) */
  items: KbManifestEntry[]
  /** 硬删墓碑(仅 v2 协议返回;v1 及服务端缺省时 SDK 归一为空数组) */
  tombstones: KbTombstoneEntry[]
  /** 下一页游标;null 表示已是最后一页 */
  nextCursor: string | null
  /** 服务端当前时间(客户端应存为下次增量 since 起点) */
  serverTime: string
  /** 服务端确认的协议版本(与请求头 Picora-Sync-Version 对应;旧服务端可能缺失) */
  protocolVersion?: 1 | 2
  /** 响应 ETag 头(弱验证器 W/"...",与请求参数绑定);服务端未返回时为 null */
  etag: string | null
}

/** sync op:上传 / 覆盖文档内容(sourceHash 必须等于 SHA-256(content) hex,否则 LOCAL_HASH_MISMATCH) */
export interface KbSyncUpsertOp {
  op: 'upsert'
  /** POSIX 相对路径,≤1024 字符,禁止 `..` 与 `/` 开头;服务端自动 NFC 归一化 */
  relativePath: string
  /** 完整 Markdown 文本 */
  content: string
  /** SHA-256(content) 十六进制,64 字符 */
  sourceHash: string
  /** 客户端已知的服务端版本时间(乐观锁基准);不传 = 新建语义,已存在活跃文档时冲突 BASE_MISSING */
  baseUpdatedAt?: string
  /** 文档标题(可选) */
  title?: string
  /** 标签列表(可选) */
  tags?: string[]
  /** 是否公开(可选) */
  isPublic?: boolean
}

/** sync op:软删指定路径文档(不传 baseUpdatedAt 且服务端有活跃文档时冲突 BASE_MISSING) */
export interface KbSyncDeleteOp {
  op: 'delete'
  /** 要删除的相对路径 */
  relativePath: string
  /** 乐观锁基准时间 */
  baseUpdatedAt?: string
}

/**
 * sync op:重命名 / 移动路径(v0.68.0),docId 保持不变。纯路径变更,不带 content / sourceHash;
 * 服务端同时给 fromPath 写墓碑,供其他客户端删掉旧路径本地副本。
 */
export interface KbSyncMoveOp {
  op: 'move'
  /** 移动前的相对路径(源) */
  fromPath: string
  /** 移动后的相对路径(目标,须未被活跃文档占用,否则 MOVE_TARGET_EXISTS) */
  toPath: string
  /** 源文档乐观锁基准;落后于服务端 updated_at 时冲突 REMOTE_NEWER */
  baseUpdatedAt?: string
}

/** sync 操作(upsert / delete / move 三态) */
export type KbSyncOp = KbSyncUpsertOp | KbSyncDeleteOp | KbSyncMoveOp

/** POST /v1/kbs/{id}/sync 入参(单请求最多 100 op) */
export interface KbSyncInput {
  /** sync 操作列表,最多 100 个;每个 op 独立执行,部分成功部分冲突是合法响应 */
  ops: KbSyncOp[]
}

/** sync 已成功应用 / 已跳过的 op(upsert / delete / move,move 为 v0.68 起支持的重命名/移动) */
export interface KbSyncAppliedItem {
  op: 'upsert' | 'delete' | 'move'
  /** 相对路径(move op 为目标路径) */
  relativePath: string
  /** 文档 ID;delete 且原本不存在时为 null */
  id: string | null
  /** 应用后的更新时间;delete 时可能为 null */
  updatedAt: string | null
  /** 应用后的内容 hash;delete 时为 null */
  sourceHash: string | null
}

/**
 * sync 冲突原因:
 *   REMOTE_NEWER=服务端有更新版本 / REMOTE_DELETED=服务端已软删 /
 *   BASE_MISSING=缺 baseUpdatedAt / LOCAL_HASH_MISMATCH=content 与 sourceHash 不一致 /
 *   MOVE_SOURCE_MISSING=move 源路径无活跃文档 / MOVE_TARGET_EXISTS=move 目标路径已被占用
 */
export type KbSyncConflictReason =
  | 'REMOTE_NEWER'
  | 'REMOTE_DELETED'
  | 'BASE_MISSING'
  | 'LOCAL_HASH_MISMATCH'
  | 'MOVE_SOURCE_MISSING'
  | 'MOVE_TARGET_EXISTS'

/** sync 未能应用的 op(冲突,需客户端解决;remote 提供服务端快照帮助 3-way merge) */
export interface KbSyncConflictItem {
  op: 'upsert' | 'delete' | 'move'
  relativePath: string
  reason: KbSyncConflictReason
  /** 服务端当前快照;null 表示服务端无对应记录 */
  remote: {
    sourceHash: string | null
    sizeBytes: number | null
    updatedAt: string | null
    deletedAt: string | null
  } | null
}

/** POST /v1/kbs/{id}/sync 结果 */
export interface KbSyncResult {
  /** 已成功应用的 op */
  applied: KbSyncAppliedItem[]
  /** 冲突的 op(需客户端解决) */
  conflicts: KbSyncConflictItem[]
  /** 无需处理的 op(如删除不存在的路径) */
  skipped: KbSyncAppliedItem[]
  /** 服务端当前时间(ISO 8601) */
  serverTime: string
}

/** DELETE /v1/kbs/{id}/tree 结果(单批最多 200 条;hasMore=true 时应循环调用直到 false) */
export interface KbTreeDeleteResult {
  /** 本批实际删除的文档条数 */
  deleted: number
  /** 是否还有下一批 */
  hasMore: boolean
}

/** 冲突分支状态:pending=待处置 / accepted=已采纳 / discarded=已丢弃 */
export type KbConflictStatus = 'pending' | 'accepted' | 'discarded'

/** 冲突分支实体(由 sync v2 检测到 preserve_both 冲突时自动创建,或经 conflicts.create 手动创建) */
export interface KbConflictBranch {
  /** 冲突分支 ID(nanoid 21 字符) */
  id: string
  /** 所属文档 ID */
  docId: string
  /** 创建分支时客户端持有的基准内容 sha256-hex */
  baseSourceHash: string
  /** 分支内容(Markdown 原文) */
  branchContent: string
  /** 分支状态 */
  status: KbConflictStatus
  /** 产生冲突的设备/客户端标识;null = 未知 */
  clientId: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/** GET /v1/kbs/{id}/conflicts 过滤选项 */
export interface KbConflictListOptions {
  /** 按文档 ID 过滤 */
  docId?: string
  /** 按分支状态过滤;不传返回全部状态 */
  status?: KbConflictStatus
}

/** POST /v1/kbs/{id}/conflicts 入参(客户端补偿模式;通常由 sync v2 自动创建,无需直接调用) */
export interface CreateKbConflictInput {
  /** 所属文档 ID(nanoid 21 字符) */
  docId: string
  /** 客户端基准版本内容的 sha256-hex(64 字符) */
  baseSourceHash: string
  /** 分支内容(Markdown 原文),最大 50 MB */
  branchContent: string
  /** 产生冲突的设备/客户端标识(≤50 字符,用于区分多设备冲突来源) */
  clientId?: string | null
}

/** POST /v1/kbs/{id}/conflicts/{branchId}/accept 结果(分支内容已写回主文档) */
export interface AcceptKbConflictResult {
  /** 文档 ID */
  id: string
  /** 文档更新后的时间戳,调用方应据此更新本地 lastManifest */
  updatedAt: string
  /** 采纳后的内容 sha256-hex */
  sourceHash: string
}

/** DELETE /v1/kbs/{id}/conflicts/{branchId} 结果(丢弃幂等:已丢弃分支再次调用仍 200) */
export interface DiscardKbConflictResult {
  /** 分支 ID */
  id: string
  /** 更新后的分支状态 */
  status: 'discarded'
}
