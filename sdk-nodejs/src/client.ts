/**
 * `@picora/sdk` fluent client 装配器(v0.3.0 重构)。
 *
 * 0.2.x 的 client.ts 同时承担请求核心 + 全部命名空间实现;v0.3.0 起职责拆分:
 *   - core/http.ts        请求调度(重试矩阵 / 响应解码 / 401 刷新钩子)
 *   - core/auth-provider  鉴权抽象(静态 token / OAuth 会话 / 自定义)
 *   - resources/*.ts      各资源命名空间实现(每文件尾部带 COVERAGE 覆盖声明)
 *   - 本文件              仅做配置规范化与命名空间装配
 *
 * 向后兼容硬约束(npm 已有消费者):createPicoraClient 签名、0.2.x 六个命名空间
 * (auth / images / apps / collections / collectionTypes / episodes)的方法签名与
 * 返回类型、配置错误消息措辞均保持不变。
 */

import { StaticTokenProvider, type AuthProvider } from './core/auth-provider.js'
import { createHttpCore, type HttpConfig, type HttpCore } from './core/http.js'
import { createAuthNamespace, type AuthNamespace } from './resources/auth.js'
import { createAppsNamespace, type AppsNamespace } from './resources/apps.js'
import { createImagesNamespace, type ImagesNamespace } from './resources/images.js'
import { createCollectionsNamespace, type CollectionsNamespace } from './resources/collections.js'
import {
  createCollectionTypesNamespace,
  type CollectionTypesNamespace,
} from './resources/collection-types.js'
import { createEpisodesNamespace, type EpisodesNamespace } from './resources/episodes.js'
import { createOAuthMgmtNamespace, type OAuthMgmtNamespace } from './resources/oauth-mgmt.js'
import { createUploadsNamespace, type UploadsNamespace } from './resources/uploads-tus.js'
import { createVideosNamespace, type VideosNamespace } from './resources/videos.js'
import { createAudioNamespace, type AudioNamespace } from './resources/audio.js'
import { createMediaNamespace, type MediaNamespace } from './resources/media.js'
import {
  createWatermarkTemplatesNamespace,
  type WatermarkTemplatesNamespace,
} from './resources/watermark.js'
import { createStorageTierNamespace, type StorageTierNamespace } from './resources/storage-tier.js'
import { createDocsNamespace, type DocsNamespace } from './resources/docs.js'
import { createKbsNamespace, type KbsNamespace } from './resources/kbs.js'
import { createAigcNamespace, type AigcNamespace } from './resources/aigc/index.js'
import { createAiToolsNamespace, type AiToolsNamespace } from './resources/ai-tools.js'
import { createCreditNamespace, type CreditNamespace } from './resources/credit.js'
import { createAgreementsNamespace, type AgreementsNamespace } from './resources/agreements.js'
import { createUserNamespace, type UserNamespace } from './resources/user.js'
import { createApiKeysNamespace, type ApiKeysNamespace } from './resources/api-keys.js'
import { createDomainsNamespace, type DomainsNamespace } from './resources/domains.js'
import { createSystemNamespace, type SystemNamespace } from './resources/system.js'
import { createBillingNamespace, type BillingNamespace } from './resources/billing.js'
import { createCampaignsNamespace, type CampaignsNamespace } from './resources/campaigns.js'
import {
  createNotificationsNamespace,
  type NotificationsNamespace,
} from './resources/notifications.js'
import { createTicketsNamespace, type TicketsNamespace } from './resources/tickets.js'
import { createOrgsNamespace, type OrgsNamespace } from './resources/orgs.js'
import { createInsightsNamespace, type InsightsNamespace } from './resources/insights.js'
import { createMigrationNamespace, type MigrationNamespace } from './resources/migration.js'
import { createBackupNamespace, type BackupNamespace } from './resources/backup.js'
import { createPublishNamespace, type PublishNamespace } from './resources/publish.js'
import {
  createPublishedPagesNamespace,
  type PublishedPagesNamespace,
} from './resources/published-pages.js'
import { createMcpNamespace, type McpNamespace } from './resources/mcp.js'
import { SDK_VERSION } from './version.js'

/**
 * createPicoraClient 配置。
 * 鉴权模式字段(apiKey / oauthToken / session)三者互斥,须且仅须提供一个,否则装配时抛错。
 */
export interface PicoraClientOptions {
  /** Bearer token:API Key(sk_live_ 前缀)。与 oauthToken / session 互斥。 */
  apiKey?: string
  /** Bearer token:静态 OAuth access_token(无自动刷新)。与 apiKey / session 互斥。 */
  oauthToken?: string
  /**
   * 完全自定义鉴权提供者(高级逃生口;OAuth 自动刷新会话 / 第一方 JWT 会话
   * 分别经 createOAuthTokenProvider / createJwtSession 构造后从这里注入)。
   * 与 apiKey / oauthToken 互斥。
   */
  session?: AuthProvider

  /** API 基地址。默认 https://api.picora.me */
  baseUrl?: string

  /** 请求超时(ms)。默认 30_000。 */
  timeout?: number

  /** 自定义 fetch 实现(用于 SSR / 测试 mock)。默认 globalThis.fetch。 */
  fetch?: typeof fetch

  /** 自动重试 429。默认 true。 */
  retryOnRateLimit?: boolean

  /** 自动重试 5xx / 网络错误。默认 true。 */
  retryOnServerError?: boolean

  /** 用户代理;SDK 自动追加版本号,最终如 `MyApp/1.2 @picora/sdk/0.3.0`。 */
  userAgent?: string

  /** debug 日志;默认 false。 */
  debug?: boolean
}

const DEFAULT_BASE_URL = 'https://api.picora.me'
const DEFAULT_TIMEOUT_MS = 30_000

interface NormalizedParts {
  config: HttpConfig
  auth: AuthProvider
}

function normalize(opts: PicoraClientOptions): NormalizedParts {
  const modes = [opts.apiKey, opts.oauthToken, opts.session].filter((m) => m !== undefined)
  if (modes.length > 1) {
    throw new Error('PicoraClient: apiKey and oauthToken are mutually exclusive (as is session)')
  }
  if (modes.length === 0) {
    throw new Error('PicoraClient: either apiKey or oauthToken (or session) must be provided')
  }
  const userAgent = opts.userAgent
    ? `${opts.userAgent} @picora/sdk/${SDK_VERSION}`
    : `@picora/sdk/${SDK_VERSION}`
  const fetchImpl = opts.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error('PicoraClient: fetch is not available; pass options.fetch on Node < 18')
  }

  const auth: AuthProvider = opts.session
    ?? new StaticTokenProvider(opts.apiKey ?? opts.oauthToken ?? '')

  return {
    config: {
      baseUrl: (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, ''),
      timeout: opts.timeout ?? DEFAULT_TIMEOUT_MS,
      fetch: fetchImpl,
      retryOnRateLimit: opts.retryOnRateLimit !== false,
      retryOnServerError: opts.retryOnServerError !== false,
      userAgent,
      debug: opts.debug === true,
    },
    auth,
  }
}

export interface PicoraClient {
  readonly auth: AuthNamespace
  readonly images: ImagesNamespace
  readonly apps: AppsNamespace
  /** v0.61.0:合集(Collections)— 多媒体内容容器。 */
  readonly collections: CollectionsNamespace
  /** v0.61.0:合集类型字典(内置 + 用户自定义)。 */
  readonly collectionTypes: CollectionTypesNamespace
  /** v0.61.1:剧集 CRUD + episode.sync 第三方接入主链路。 */
  readonly episodes: EpisodesNamespace
  /** v0.14/v0.57:OAuth 管理(动态注册 / 同意页 / 设备码确认 / 客户端管理)。 */
  readonly oauth: OAuthMgmtNamespace
  /** v0.37:TUS 1.0 断点续传(create / append / status / capabilities / abort)。 */
  readonly uploads: UploadsNamespace
  /** 视频托管(上传 202 异步转码,轮询 status 直到 ready)。 */
  readonly videos: VideosNamespace
  /** v0.12:音频托管(同步上传,201 即可播放)。 */
  readonly audio: AudioNamespace
  /** v0.12:统一媒体端点(图片 + 视频 + 音频混合 list / get / 批量删除)。 */
  readonly media: MediaNamespace
  /** 水印模板 CRUD(创建 / 更新需 pro_plus 套餐)。 */
  readonly watermarkTemplates: WatermarkTemplatesNamespace
  /** 存储冷热分层统计 / 回热 + 两步批量删除。 */
  readonly storageTier: StorageTierNamespace
  /** v0.15/v0.74:Markdown 文档托管(上传 / 列表 / 全文 / 批量迁移 / 历史版本 revisions)。 */
  readonly docs: DocsNamespace
  /** v0.38+:知识库(KB)+ 同步协议(manifest / sync / raw / tree)+ 冲突分支 conflicts。 */
  readonly kbs: KbsNamespace
  /** v0.39+:AIGC 域(项目→剧集→内容→资产四层 + 批量任务 / 模板 / generate 生成入口)。 */
  readonly aigc: AigcNamespace
  /** v0.48:AI 工具箱(5 个图片 AI 工具,Credit 计费 + 失败自动 refund)。 */
  readonly aiTools: AiToolsNamespace
  /** v0.40:Credit 钱包(余额 / 流水 / Creem 充值 checkout)。 */
  readonly credit: CreditNamespace
  /** v0.46:AIGC 服务条款同意管理(版本查询 / 同意状态 / 接受)。 */
  readonly agreements: AgreementsNamespace
  /** v0.3.0 账户域批次:当前用户资料 / 用量 / 身份 / 密码 / 头像。 */
  readonly user: UserNamespace
  /** v0.3.0 账户域批次:API Key 管理(明文仅创建时返回一次)。 */
  readonly apiKeys: ApiKeysNamespace
  /** v0.3.0 账户域批次:自定义外链域名(Pro+;create → CNAME → verify)。 */
  readonly domains: DomainsNamespace
  /** v0.3.0 账户域批次:系统健康检查(公开端点)。 */
  readonly system: SystemNamespace
  /** v0.3.0 平台域批次:套餐定价 / checkout / 邀请码激活 / 订阅 / 订单 / 支付历史。 */
  readonly billing: BillingNamespace
  /** v0.3.0 平台域批次(v0.66):促销活动查询 / 私有券领取 / 促销码校验。 */
  readonly campaigns: CampaignsNamespace
  /** v0.3.0 平台域批次(v0.66):站内信(列表 / 未读计数 / 批量已读)。 */
  readonly notifications: NotificationsNamespace
  /** v0.3.0 平台域批次:客服工单(创建 / 列表 / 详情 / 回复 / 未读计数)。 */
  readonly tickets: TicketsNamespace
  /** v0.3.0 平台域批次(v0.50~v0.52):Teams 组织(成员 / 邀请 / 订阅子命名空间)。 */
  readonly orgs: OrgsNamespace
  /** v0.3.0 平台域批次(v0.53):访问统计(按天聚合 + 手工触发聚合)。 */
  readonly insights: InsightsNamespace
  /** v0.3.0 平台域批次(v0.49/v0.58):一键迁入(202 异步任务 + Apple Photos zip 流程)。 */
  readonly migration: MigrationNamespace
  /** v0.3.0 平台域批次(v0.55):备份导出(周期订阅 + 一次性任务子命名空间)。 */
  readonly backup: BackupNamespace
  /** v0.3.0 平台域批次(v0.54):多平台一键发布(平台绑定 + 202 异步发布任务)。 */
  readonly publish: PublishNamespace
  /** v0.3.0 平台域批次(v0.43):发布页 CRUD + 公众号导出 + 公开页读取(/p/{slug})。 */
  readonly publishedPages: PublishedPagesNamespace
  /** v0.3.0 平台域批次:MCP 工具 catalog(公开)+ 当月调用用量。 */
  readonly mcp: McpNamespace
  /** 底层请求核心(高级用法:调用 SDK 尚未封装的端点;正常业务请优先用命名空间方法)。 */
  readonly http: HttpCore
}

/**
 * 装配 fluent Picora 客户端:按选定鉴权模式构造 http core,再挂载全部资源命名空间。
 *
 * 鉴权模式四选一(互斥;多选或全缺均抛错):
 *   - apiKey:工具端 API Key(sk_live_ 前缀),Bearer 静态注入
 *   - oauthToken:静态 OAuth access_token,不自动刷新(适合短生命周期脚本)
 *   - session + createOAuthTokenProvider:OAuth 自动刷新会话(预刷新 + 401 兜底 + 强制旋转)
 *   - session + createJwtSession:第一方邮箱/验证码 JWT 会话(httpOnly cookie 续期)
 *
 * @param options 客户端配置,见 PicoraClientOptions
 * @returns       fluent 客户端,含各资源命名空间与底层 http(逃生口)
 * @throws {Error} 同时提供多个鉴权模式,或一个都没提供;或运行时无可用 fetch(Node < 18 须传 options.fetch)
 */
export function createPicoraClient(options: PicoraClientOptions): PicoraClient {
  const { config, auth } = normalize(options)
  const http = createHttpCore(config, auth)

  return {
    auth: createAuthNamespace(http),
    images: createImagesNamespace(http),
    apps: createAppsNamespace(http),
    collections: createCollectionsNamespace(http),
    collectionTypes: createCollectionTypesNamespace(http),
    episodes: createEpisodesNamespace(http),
    oauth: createOAuthMgmtNamespace(http),
    uploads: createUploadsNamespace(http),
    videos: createVideosNamespace(http),
    audio: createAudioNamespace(http),
    media: createMediaNamespace(http),
    watermarkTemplates: createWatermarkTemplatesNamespace(http),
    storageTier: createStorageTierNamespace(http),
    docs: createDocsNamespace(http),
    kbs: createKbsNamespace(http),
    aigc: createAigcNamespace(http),
    aiTools: createAiToolsNamespace(http),
    credit: createCreditNamespace(http),
    agreements: createAgreementsNamespace(http),
    user: createUserNamespace(http),
    apiKeys: createApiKeysNamespace(http),
    domains: createDomainsNamespace(http),
    system: createSystemNamespace(http),
    billing: createBillingNamespace(http),
    campaigns: createCampaignsNamespace(http),
    notifications: createNotificationsNamespace(http),
    tickets: createTicketsNamespace(http),
    orgs: createOrgsNamespace(http),
    insights: createInsightsNamespace(http),
    migration: createMigrationNamespace(http),
    backup: createBackupNamespace(http),
    publish: createPublishNamespace(http),
    publishedPages: createPublishedPagesNamespace(http),
    mcp: createMcpNamespace(http),
    http,
  }
}
