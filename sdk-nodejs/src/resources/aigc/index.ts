/**
 * aigc 命名空间装配器 —— AIGC 域 30 个 operation 的统一入口。
 *
 * 域太大,实现按资源层级拆为三个子文件(单文件会破 500 行 Service 软限):
 *   - projects.ts  项目 CRUD / tree / from-template / sync-to-output / 剧集列表与创建(10 op)
 *   - content.ts   剧集 + 内容的直接寻址端点(9 op)
 *   - assets.ts    资产 / 批量任务 / 模板 / generate 生成入口(11 op)
 * 本文件仅做命名空间组装与 AIGC_COVERAGE 聚合(manifest.ts 只 spread 总量)。
 *
 * 层级模型:project → episode → content → asset;生成计费走 Credit 钱包
 * (见 credit 命名空间),生成前须已同意 AIGC 服务条款(见 agreements 命名空间)。
 */

import type { HttpCore } from '../../core/http.js'
import type { CoveredOperation } from '../../coverage/types.js'
import {
  AIGC_PROJECTS_COVERAGE,
  createAigcProjectsNamespace,
  type AigcProjectsNamespace,
} from './projects.js'
import {
  AIGC_CONTENT_COVERAGE,
  createAigcContentsNamespace,
  createAigcEpisodesNamespace,
  type AigcContentsNamespace,
  type AigcEpisodesNamespace,
} from './content.js'
import {
  AIGC_ASSETS_COVERAGE,
  createAigcAssetsNamespace,
  createAigcBatchJobsNamespace,
  createAigcGenerationMethods,
  createAigcTemplatesNamespace,
  type AigcAssetsNamespace,
  type AigcBatchJobsNamespace,
  type AigcGenerationMethods,
  type AigcTemplatesNamespace,
} from './assets.js'

export type {
  AigcProjectsNamespace,
  AigcEpisodesNamespace,
  AigcContentsNamespace,
  AigcAssetsNamespace,
  AigcBatchJobsNamespace,
  AigcTemplatesNamespace,
  AigcGenerationMethods,
}

/** AIGC 域命名空间(project → episode → content → asset 四层 + 批量任务 / 模板 / 生成入口) */
export interface AigcNamespace extends AigcGenerationMethods {
  /** AIGC 项目(CRUD / 项目树 / 模板创建 / 产出同步 / 剧集列表与创建)。 */
  readonly projects: AigcProjectsNamespace
  /** AIGC 剧集(以剧集 id 直接寻址;列表/创建以 project 为父,见 projects)。 */
  readonly episodes: AigcEpisodesNamespace
  /** AIGC 内容(以内容 id 直接寻址;列表/创建以 episode 为父,见 episodes)。 */
  readonly contents: AigcContentsNamespace
  /** AIGC 资产(版本组查询 / 软删恢复 / promote 采用 / 生成状态轮询)。 */
  readonly assets: AigcAssetsNamespace
  /** 批量生成任务(进度轮询 / 取消退款)。 */
  readonly batchJobs: AigcBatchJobsNamespace
  /** 起手模板(列表 / 详情;配合 projects.fromTemplate 使用)。 */
  readonly templates: AigcTemplatesNamespace
}

export function createAigcNamespace(http: HttpCore): AigcNamespace {
  return {
    projects: createAigcProjectsNamespace(http),
    episodes: createAigcEpisodesNamespace(http),
    contents: createAigcContentsNamespace(http),
    assets: createAigcAssetsNamespace(http),
    batchJobs: createAigcBatchJobsNamespace(http),
    templates: createAigcTemplatesNamespace(http),
    ...createAigcGenerationMethods(http),
  }
}

/** AIGC 域覆盖声明聚合(30 op;manifest.ts 仅 spread 本常量)。 */
export const AIGC_COVERAGE: readonly CoveredOperation[] = [
  ...AIGC_PROJECTS_COVERAGE,
  ...AIGC_CONTENT_COVERAGE,
  ...AIGC_ASSETS_COVERAGE,
]
