/**
 * aigc.projects 子命名空间 —— AIGC 项目 CRUD + 项目树 + 模板创建 + 产出同步 +
 * 剧集列表/创建(剧集以 project 为父资源的两个端点也登记在本文件)。
 *
 * 注意:spec 已声明 `/v1/aigc/projects/*` 前缀为废弃(响应带 Deprecation 头,
 * 新集成建议迁移到 `/v1/collections?type=aigc`);SDK 按契约现状完整覆盖。
 */

import type { HttpCore } from '../../core/http.js'
import type { CoveredOperation } from '../../coverage/types.js'
import { normalizePage } from '../../core/pagination.js'
import type {
  AigcEpisode,
  AigcProject,
  AigcProjectListParams,
  AigcProjectTree,
  AigcSyncToOutputResult,
  CreateAigcEpisodeInput,
  CreateAigcProjectFromTemplateInput,
  CreateAigcProjectInput,
  PaginatedResponse,
  UpdateAigcProjectInput,
} from '../../types/index.js'

export interface AigcProjectsNamespace {
  /** 游标分页列出当前用户的 AIGC 项目(可按 type / status 过滤,按 created_at DESC 排序)。 */
  list(params?: AigcProjectListParams): Promise<PaginatedResponse<AigcProject>>
  /**
   * 创建空项目(不附 KB / episodes;需要 starter docs + KB 一并创建用 fromTemplate)。
   * 项目数受套餐配额限制,超限 403 AIGC_PROJECT_LIMIT_REACHED。
   */
  create(input: CreateAigcProjectInput): Promise<AigcProject>
  /** 获取单个项目详情。 */
  get(id: string): Promise<AigcProject>
  /** 更新项目(name / description / status=active|archived;type 创建后不可修改)。 */
  update(id: string, patch: UpdateAigcProjectInput): Promise<void>
  /**
   * 软删除项目(status=deleted;关联 KB / docs / episodes / assets 保留,彻底清理由 cron 异步处理)。
   * 需 read_write_delete scope。
   */
  delete(id: string): Promise<void>
  /** 获取项目树:project → episodes → contents → assets 4 层嵌套结构(渲染导航树用)。 */
  tree(id: string): Promise<AigcProjectTree>
  /**
   * 用模板事务创建项目:项目 + 2 KB(creator + output)+ starter docs + episodes 骨架,
   * 模板 useCount 自动累加。模板不存在或非 active 状态 404;项目配额耗尽 403。
   */
  fromTemplate(input: CreateAigcProjectFromTemplateInput): Promise<AigcProject>
  /**
   * 把创作 KB 中的全部 prompt 块同步到产出 KB 并注入图片引用。
   * 前置条件:project 必须已绑定 creatorKbId 与 outputKbId,否则 422。
   * 返回受影响的产出文档数(docsUpdated)与注入的图片引用数(assetsLinked);
   * 个别 prompt 块无当前版本资产等非致命问题经 warnings 透出,不阻断同步。
   */
  syncToOutput(id: string): Promise<AigcSyncToOutputResult>
  /** 列出项目下全部剧集(不含 contents 明细;不分页,直接返回数组)。 */
  listEpisodes(id: string): Promise<AigcEpisode[]>
  /** 在项目内创建剧集。省略 sequenceNo 时追加到末尾(project.episodeCount + 1)。 */
  createEpisode(id: string, input: CreateAigcEpisodeInput): Promise<AigcEpisode>
}

export function createAigcProjectsNamespace(http: HttpCore): AigcProjectsNamespace {
  return {
    list: async (params) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      if (params?.cursor !== undefined) query['cursor'] = params.cursor
      if (params?.limit !== undefined) query['limit'] = params.limit
      if (params?.type !== undefined) query['type'] = params.type
      if (params?.status !== undefined) query['status'] = params.status
      const raw = await http.request<unknown>({ method: 'GET', path: '/v1/aigc/projects', query })
      return normalizePage<AigcProject>(raw, 'items')
    },
    create: (input) =>
      http.request<AigcProject>({
        method: 'POST',
        path: '/v1/aigc/projects',
        body: {
          name: input.name,
          type: input.type,
          ...(input.description !== undefined ? { description: input.description } : {}),
        },
      }),
    get: (id) =>
      http.request<AigcProject>({
        method: 'GET',
        path: `/v1/aigc/projects/${encodeURIComponent(id)}`,
      }),
    update: async (id, patch) => {
      await http.request<void>({
        method: 'PATCH',
        path: `/v1/aigc/projects/${encodeURIComponent(id)}`,
        body: {
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.status !== undefined ? { status: patch.status } : {}),
        },
        response: 'none',
      })
    },
    delete: async (id) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/aigc/projects/${encodeURIComponent(id)}`,
        response: 'none',
      })
    },
    tree: (id) =>
      http.request<AigcProjectTree>({
        method: 'GET',
        path: `/v1/aigc/projects/${encodeURIComponent(id)}/tree`,
      }),
    fromTemplate: (input) =>
      http.request<AigcProject>({
        method: 'POST',
        path: '/v1/aigc/projects/from-template',
        body: { templateId: input.templateId, projectName: input.projectName },
      }),
    syncToOutput: (id) =>
      http.request<AigcSyncToOutputResult>({
        method: 'POST',
        path: `/v1/aigc/projects/${encodeURIComponent(id)}/sync-to-output`,
      }),
    listEpisodes: async (id) => {
      const raw = await http.request<{ items?: AigcEpisode[] }>({
        method: 'GET',
        path: `/v1/aigc/projects/${encodeURIComponent(id)}/episodes`,
      })
      return raw.items ?? []
    },
    createEpisode: (id, input) =>
      http.request<AigcEpisode>({
        method: 'POST',
        path: `/v1/aigc/projects/${encodeURIComponent(id)}/episodes`,
        body: {
          title: input.title,
          ...(input.sequenceNo !== undefined ? { sequenceNo: input.sequenceNo } : {}),
        },
      }),
  }
}

export const AIGC_PROJECTS_COVERAGE = [
  { method: 'GET', path: '/v1/aigc/projects', client: 'aigc.projects.list' },
  { method: 'POST', path: '/v1/aigc/projects', client: 'aigc.projects.create' },
  { method: 'GET', path: '/v1/aigc/projects/{id}', client: 'aigc.projects.get' },
  { method: 'PATCH', path: '/v1/aigc/projects/{id}', client: 'aigc.projects.update' },
  { method: 'DELETE', path: '/v1/aigc/projects/{id}', client: 'aigc.projects.delete' },
  { method: 'GET', path: '/v1/aigc/projects/{id}/tree', client: 'aigc.projects.tree' },
  { method: 'POST', path: '/v1/aigc/projects/from-template', client: 'aigc.projects.fromTemplate' },
  { method: 'POST', path: '/v1/aigc/projects/{id}/sync-to-output', client: 'aigc.projects.syncToOutput' },
  { method: 'GET', path: '/v1/aigc/projects/{id}/episodes', client: 'aigc.projects.listEpisodes' },
  { method: 'POST', path: '/v1/aigc/projects/{id}/episodes', client: 'aigc.projects.createEpisode' },
] as const satisfies readonly CoveredOperation[]
