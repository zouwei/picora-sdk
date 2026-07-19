/**
 * kbs 命名空间 —— 知识库(KB)CRUD + 同步协议(manifest / sync / raw / tree)+
 * 冲突分支子命名空间 conflicts(v0.38+,同步协议 v2 见 v0.68.0)。
 *
 * **签名约定(前瞻约束,勿破坏)**:本命名空间全部方法除首位的 KB id 外,
 * 其余入参一律收敛为单一 options 对象,绝不追加位置参数。原因:manifest / sync / raw
 * 等方法未来会支持**按文件后缀格式过滤加载**(如 extensions: ['.boardraw'],服务端参数
 * 尚未上线)——教学画板等第三方工具只需拉取特定格式文件;届时仅向 options 对象追加
 * 可选字段即可,所有既有调用零破坏。新增方法时必须沿用同一约定。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { normalizePage } from '../core/pagination.js'
import type {
  AcceptKbConflictResult,
  CreateKbConflictInput,
  CreateKbInput,
  DiscardKbConflictResult,
  Kb,
  KbConflictBranch,
  KbConflictListOptions,
  KbListOptions,
  KbManifest,
  KbManifestEntry,
  KbManifestOptions,
  KbSyncInput,
  KbSyncResult,
  KbTombstoneEntry,
  KbTreeDeleteResult,
  PaginatedResponse,
  UpdateKbInput,
} from '../types/index.js'

/** manifest 200 响应 data 的 wire 形态(内部解析用,字段以 spec 为准做防御性可选) */
interface KbManifestWireData {
  kbId?: string
  items?: KbManifestEntry[]
  nextCursor?: string | null
  serverTime?: string
  protocolVersion?: 1 | 2
  tombstones?: KbTombstoneEntry[]
}

export interface KbsNamespace {
  /** 游标分页列出当前用户的 KB(默认 updated_at DESC,可按 name 排序)。 */
  list(opts?: KbListOptions): Promise<PaginatedResponse<Kb>>
  /** 创建 KB。slug 缺省由 name 自动推导;数量上限 Trial 5 / Pro 50 / Pro+ 500,超限 403。 */
  create(input: CreateKbInput): Promise<Kb>
  /** 获取单个 KB 详情。 */
  get(id: string): Promise<Kb>
  /** 更新 KB 元数据(name / description / isDefault;slug 创建后不可修改)。 */
  update(id: string, opts: UpdateKbInput): Promise<Kb>
  /**
   * 删除 KB。默认非级联:KB 内有活跃文档时 409 KB_NOT_EMPTY;
   * cascade:true 级联软删所有文档并清理 R2 文件、释放 doc_count 配额。
   */
  delete(id: string, opts?: { cascade?: boolean }): Promise<void>
  /**
   * 拉取 KB 同步清单(轻量 metadata,不含文档内容)。
   *
   * - 全量模式(不传 since):返回全部活跃文档条目,软删不含
   * - 增量模式(传 since):返回该时间之后有变动的条目(含软删 deletedAt != null)
   * - opts.version(Picora-Sync-Version 头)传 '2' 启用 tombstones + 增量优化
   *
   * **304 语义**:传 opts.ifNoneMatch(上一次响应的 etag)做条件请求;KB 水位线 +
   * 请求参数未变化时服务端返回 304 Not Modified,**本方法返回 null**(无变化轮询
   * 近乎零成本)。200 时返回 KbManifest,其 etag 字段取自响应 ETag 头(弱验证器,
   * 与 since / cursor / limit / 协议版本绑定),客户端应存下供下次轮询回传。
   *
   * 未来将支持按文件后缀过滤(extensions 选项,见命名空间头部说明)。
   */
  manifest(id: string, opts?: KbManifestOptions): Promise<KbManifest | null>
  /**
   * 批量同步文档进 KB(upsert / delete / move 三种 op)。
   *
   * - **单请求最多 100 op**;每个 op 独立执行,部分成功部分冲突是合法响应(HTTP 仍 200)
   * - 走**独立 sync 限流档**(x-rate-limit-tier: sync,与 read / upload / mutation 分桶,
   *   v0.70 起挂载),高频批量同步不挤占其他 API 配额
   * - upsert 的 sourceHash 必须等于 SHA-256(content) hex;baseUpdatedAt 为乐观锁基准,
   *   不传代表「新建」语义
   *
   * 未来将支持按文件后缀过滤(extensions 选项,见命名空间头部说明)。
   */
  sync(id: string, opts: KbSyncInput): Promise<KbSyncResult>
  /**
   * 按目录前缀批量**硬删** KB 内文档(AI 记忆「一键清空」某工具目录,如 '.claude/')。
   * prefix 服务端自动规整为以 '/' 结尾(避免 '.cla' 误删 '.claude-x/');
   * 单批最多 200 条,hasMore=true 时应循环调用直到 false。活跃文档补写删除墓碑。
   */
  deleteTree(id: string, opts: { prefix: string }): Promise<KbTreeDeleteResult>
  /**
   * 按相对路径直读文档原始 Markdown 内容(text/markdown 纯文本 string,非 JSON 包络)。
   * 主要用于拉到 manifest 后,针对有变化的路径逐一拉取最新内容(pull-then-diff)。
   *
   * 未来将支持按文件后缀过滤(extensions 选项,见命名空间头部说明)。
   */
  raw(id: string, opts: { path: string }): Promise<string>
  /** 冲突分支(sync v2 preserve_both 冲突时自动创建;处置走 accept / discard)。 */
  readonly conflicts: {
    /** 列出 KB 内冲突分支(可按 docId / status 过滤;不分页,直接返回数组)。 */
    list(kbId: string, opts?: KbConflictListOptions): Promise<KbConflictBranch[]>
    /** 显式创建冲突分支(客户端补偿模式;通常 sync v2 会自动创建,无需直接调用)。 */
    create(kbId: string, input: CreateKbConflictInput): Promise<KbConflictBranch>
    /**
     * 采纳分支为主版本:分支内容写回主文档,分支状态变为 accepted;
     * 调用方应据响应 updatedAt 更新本地 lastManifest。
     */
    accept(kbId: string, opts: { branchId: string }): Promise<AcceptKbConflictResult>
    /** 丢弃分支(保留服务端版本,不写回主文档)。幂等:已丢弃分支再次调用仍 200。 */
    discard(kbId: string, opts: { branchId: string }): Promise<DiscardKbConflictResult>
  }
}

export function createKbsNamespace(http: HttpCore): KbsNamespace {
  return {
    list: async (opts) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (opts?.cursor !== undefined) query['cursor'] = opts.cursor
      if (opts?.limit !== undefined) query['limit'] = opts.limit
      if (opts?.sort !== undefined) query['sort'] = opts.sort
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/kbs', query })
      return normalizePage<Kb>(raw, 'items')
    },
    create: (input) =>
      http.request<Kb>({
        method: 'POST',
        path: '/v1/kbs',
        body: {
          name: input.name,
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      }),
    get: (id) => http.request<Kb>({ method: 'GET', path: `/v1/kbs/${encodeURIComponent(id)}` }),
    update: (id, opts) =>
      http.request<Kb>({
        method: 'PATCH',
        path: `/v1/kbs/${encodeURIComponent(id)}`,
        body: {
          ...(opts.name !== undefined ? { name: opts.name } : {}),
          ...(opts.description !== undefined ? { description: opts.description } : {}),
          ...(opts.isDefault !== undefined ? { isDefault: opts.isDefault } : {}),
        },
      }),
    delete: async (id, opts) => {
      const baseArgs = {
        method: 'DELETE' as const,
        path: `/v1/kbs/${encodeURIComponent(id)}`,
        response: 'none' as const,
      }
      await http.request<void>(
        opts?.cascade === true ? { ...baseArgs, query: { cascade: 'true' } } : baseArgs,
      )
    },
    manifest: async (id, opts) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (opts?.since !== undefined) query['since'] = opts.since
      if (opts?.cursor !== undefined) query['cursor'] = opts.cursor
      if (opts?.limit !== undefined) query['limit'] = opts.limit
      const headers: Record<string, string> = {}
      if (opts?.version !== undefined) headers['Picora-Sync-Version'] = opts.version
      if (opts?.ifNoneMatch !== undefined) headers['If-None-Match'] = opts.ifNoneMatch
      // raw 模式:2xx/3xx 不消费 body,由这里区分 304(null)与 200(解析 JSON + 读 ETag 头)
      const res = await http.request<Response>({
        method: 'GET',
        path: `/v1/kbs/${encodeURIComponent(id)}/manifest`,
        query,
        headers,
        response: 'raw',
      })
      if (res.status === 304) return null
      const etag = res.headers.get('ETag')
      const body = (await res.json()) as { data?: KbManifestWireData }
      const data = body.data ?? {}
      return {
        kbId: data.kbId ?? id,
        items: data.items ?? [],
        // v1 协议 / 旧服务端可能缺省 tombstones 字段,SDK 归一为空数组
        tombstones: data.tombstones ?? [],
        nextCursor: data.nextCursor ?? null,
        serverTime: data.serverTime ?? '',
        ...(data.protocolVersion !== undefined ? { protocolVersion: data.protocolVersion } : {}),
        etag,
      }
    },
    sync: (id, opts) =>
      http.request<KbSyncResult>({
        method: 'POST',
        path: `/v1/kbs/${encodeURIComponent(id)}/sync`,
        body: { ops: opts.ops },
      }),
    deleteTree: (id, opts) =>
      http.request<KbTreeDeleteResult>({
        method: 'DELETE',
        path: `/v1/kbs/${encodeURIComponent(id)}/tree`,
        query: { prefix: opts.prefix },
      }),
    raw: (id, opts) =>
      http.request<string>({
        method: 'GET',
        path: `/v1/kbs/${encodeURIComponent(id)}/raw`,
        query: { path: opts.path },
        response: 'text',
      }),
    conflicts: {
      list: async (kbId, opts) => {
        const query: Record<string, string | number | boolean | undefined> = {}
        if (opts?.docId !== undefined) query['docId'] = opts.docId
        if (opts?.status !== undefined) query['status'] = opts.status
        const raw = await http.request<{ items?: KbConflictBranch[] }>({
          method: 'GET',
          path: `/v1/kbs/${encodeURIComponent(kbId)}/conflicts`,
          query,
        })
        return raw.items ?? []
      },
      create: (kbId, input) =>
        http.request<KbConflictBranch>({
          method: 'POST',
          path: `/v1/kbs/${encodeURIComponent(kbId)}/conflicts`,
          body: {
            docId: input.docId,
            baseSourceHash: input.baseSourceHash,
            branchContent: input.branchContent,
            ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
          },
        }),
      accept: (kbId, opts) =>
        http.request<AcceptKbConflictResult>({
          method: 'POST',
          path: `/v1/kbs/${encodeURIComponent(kbId)}/conflicts/${encodeURIComponent(opts.branchId)}/accept`,
        }),
      discard: (kbId, opts) =>
        http.request<DiscardKbConflictResult>({
          method: 'DELETE',
          path: `/v1/kbs/${encodeURIComponent(kbId)}/conflicts/${encodeURIComponent(opts.branchId)}`,
        }),
    },
  }
}

/** kbs(9)+ kb-conflicts(4)覆盖声明统一登记在本文件。 */
export const KBS_COVERAGE = [
  { method: 'GET', path: '/v1/kbs', client: 'kbs.list' },
  { method: 'POST', path: '/v1/kbs', client: 'kbs.create' },
  { method: 'GET', path: '/v1/kbs/{id}', client: 'kbs.get' },
  { method: 'PATCH', path: '/v1/kbs/{id}', client: 'kbs.update' },
  { method: 'DELETE', path: '/v1/kbs/{id}', client: 'kbs.delete' },
  { method: 'GET', path: '/v1/kbs/{id}/manifest', client: 'kbs.manifest' },
  { method: 'POST', path: '/v1/kbs/{id}/sync', client: 'kbs.sync' },
  { method: 'DELETE', path: '/v1/kbs/{id}/tree', client: 'kbs.deleteTree' },
  { method: 'GET', path: '/v1/kbs/{id}/raw', client: 'kbs.raw' },
  { method: 'GET', path: '/v1/kbs/{id}/conflicts', client: 'kbs.conflicts.list' },
  { method: 'POST', path: '/v1/kbs/{id}/conflicts', client: 'kbs.conflicts.create' },
  { method: 'POST', path: '/v1/kbs/{id}/conflicts/{branchId}/accept', client: 'kbs.conflicts.accept' },
  { method: 'DELETE', path: '/v1/kbs/{id}/conflicts/{branchId}', client: 'kbs.conflicts.discard' },
] as const satisfies readonly CoveredOperation[]
