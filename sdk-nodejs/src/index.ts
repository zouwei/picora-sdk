/**
 * `@picora/sdk` 主入口。
 *
 * 设计文档:
 *   - v0.1.0:picora-assets/iterations/v0.31.0-openapi-public-openapi-developer-portal.md §4.7
 *   - v0.2.0:picora-assets/iterations/v0.61.0-service-collections.md PR4-A
 *   - v0.3.0:picora-assets/iterations/v0.82.0-sdk-full-coverage.md(独立仓库 + 全量开放 API 覆盖)
 *
 * v0.3.0:独立仓库化;core 抽取(http / 鉴权栈 / 分页 / multipart);
 *          覆盖 openapi-public.json 全量 operation;OpenAPI 覆盖率 CI 硬门禁。
 *
 * @example
 *   import { createPicoraClient } from '@picora/sdk'
 *
 *   const picora = createPicoraClient({ apiKey: process.env.PICORA_API_KEY })
 *   const me = await picora.auth.me()
 *
 *   // 合集 + 剧集 + 资产同步主流程
 *   const collection = await picora.collections.create({
 *     name: '我的剧集',
 *     collectionType: 'tv_series',
 *     allowedResourceTypes: ['video', 'audio', 'doc'],
 *   })
 *   const ep = await picora.episodes.create(collection.id, { sequenceNo: 1, title: 'EP01' })
 *   const result = await picora.episodes.sync(collection.id, ep.id, {
 *     idempotencyKey: 'ai-batch-001',
 *     assets: [
 *       { resourceType: 'video', resourceId: 'vid_xxx' },
 *       { resourceType: 'doc', resourceId: 'doc_yyy' },
 *     ],
 *   })
 *   console.log(`Applied ${result.appliedCount}/${result.totalCount} assets`)
 */

export { createPicoraClient } from './client.js'
export type { PicoraClient, PicoraClientOptions } from './client.js'

export {
  PicoraApiError,
  PicoraNetworkError,
  PicoraRateLimitError,
  PicoraReauthRequiredError,
  isRetryable,
} from './errors.js'
export type { OAuthReauthReason } from './errors.js'

export { SDK_VERSION } from './version.js'

// v0.3.0:core 公开面(自定义鉴权 / 自动翻页 / multipart 构造)
export { StaticTokenProvider } from './core/auth-provider.js'
export type { AuthProvider } from './core/auth-provider.js'
export { paginateAll, normalizePage } from './core/pagination.js'
export { toFormData } from './core/multipart.js'
export type { FilePart, UploadSource } from './core/multipart.js'
export type { HttpCore, RequestArgs, ResponseMode, HttpMethod } from './core/http.js'

// v0.3.0:鉴权栈(OAuth 自动刷新会话 / 第一方 JWT 会话 / PKCE / 授权码流 / 发现文档)
export { createOAuthTokenProvider, OAuthTokenProvider } from './core/oauth-session.js'
export type { OAuthSessionOptions } from './core/oauth-session.js'
export { createJwtSession } from './core/jwt-session.js'
export type { JwtSession, JwtSessionOptions } from './core/jwt-session.js'
export { generateCodeVerifier, computeCodeChallenge, generateState } from './core/pkce.js'
export {
  createAuthorizationRequest,
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeToken,
} from './oauth/authorization.js'
export type {
  CreateAuthorizationRequestOptions,
  AuthorizationRequest,
  BuildAuthorizationUrlParams,
  ExchangeCodeOptions,
  RefreshTokenOptions,
  RevokeTokenOptions,
  OAuthHttpOptions,
} from './oauth/authorization.js'
export {
  fetchAuthorizationServerMetadata,
  fetchOidcConfiguration,
  fetchJwks,
  fetchUserinfo,
} from './oauth/discovery.js'
export type {
  AuthorizationServerMetadata,
  OidcConfiguration,
  Jwks,
} from './oauth/discovery.js'
export type {
  OAuthTokenSet,
  RegisterClientInput,
  RegisteredClient,
  ConsentInput,
  ConsentResult,
  OAuthClientInfo,
  DeviceVerifyInput,
  DeviceVerifyResult,
  RevokeAllResult,
  OidcUserinfo,
} from './types/index.js'

// v0.61.10 PR4-B-α:Device Flow helper(CLI / 桌面 / 嵌入式接入用)
// v0.65 PR-J:Node 端文件持久化通过子路径 `@picora/sdk/node` 导出 `FileTokenStorage`
//             —— 主入口保持 zero-fs,浏览器 / CF Workers 等环境无需打包 node:fs。
export { startDeviceFlow, MemoryTokenStorage } from './device-flow.js'
export type {
  DeviceFlowStartOptions,
  DeviceFlowSession,
  DeviceFlowToken,
  TokenStorage,
} from './device-flow.js'

export type {
  Plan,
  KeyScopeV2,
  User,
  Subscription,
  AuthorizedApp,
  Image,
  ImageListParams,
  PaginatedResponse,
  RateLimitInfo,
  // v0.61.0 Collections
  Collection,
  CollectionType,
  CollectionResourceType,
  CollectionListParams,
  CreateCollectionInput,
  UpdateCollectionInput,
  CollectionType_Item,
  CreateCollectionTypeInput,
  // v0.61.1 Episodes
  Episode,
  EpisodeStatus,
  EpisodeListParams,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  // v0.61.2 episode.sync
  EpisodeSyncAssetRef,
  EpisodeSyncInput,
  EpisodeSyncApplied,
  EpisodeSyncResult,
  // v0.3.0 媒体域批次:图片扩展 + 增量同步
  UploadImageInput,
  UpdateImageInput,
  ImageBatchDeleteResult,
  ImageBatchMoveInput,
  ImageBatchMoveResult,
  ImageExistsResult,
  SignImageResult,
  ImagePublicMeta,
  SyncStateParams,
  SyncUpsertChange,
  SyncDeleteChange,
  SyncChange,
  SyncStateResult,
  // v0.3.0 媒体域批次:统一媒体
  MediaType,
  MediaItem,
  MediaListParams,
  MediaRef,
  MediaBatchDeleteResult,
  // v0.3.0 媒体域批次:视频
  Video,
  VideoStatus,
  VideoListParams,
  UploadVideoInput,
  UploadVideoAccepted,
  UpdateVideoInput,
  VideoStatusInfo,
  VideoPublicMeta,
  // v0.3.0 媒体域批次:音频
  Audio,
  UploadAudioInput,
  UpdateAudioInput,
  // v0.3.0 媒体域批次:TUS 断点续传
  TusCreateInput,
  TusUploadSession,
  TusUploadProgress,
  TusAppendResult,
  TusCapabilities,
  // v0.3.0 媒体域批次:水印模板
  WatermarkType,
  WatermarkPosition,
  WatermarkTemplate,
  WatermarkTemplateInput,
  // v0.3.0 媒体域批次:存储分层 + 两步批量删除
  StorageTierStat,
  StorageTierStats,
  TierResourceType,
  PromoteStorageTierInput,
  PromoteStorageTierResult,
  BulkDeleteFilters,
  BulkDeletePreviewInput,
  BulkDeletePreviewResult,
  BulkDeleteExecuteInput,
  BulkDeleteExecuteResult,
  // v0.3.0 docs/KB 域批次:合集 v3 多资源清单
  CollectionManifestParams,
  CollectionManifestItem,
  CollectionManifestCounts,
  CollectionManifest,
  // v0.3.0 docs/KB 域批次:Markdown 文档 + 历史版本
  DocItem,
  CreateDocInput,
  DocUploadResult,
  DocListParams,
  UpdateDocInput,
  DocsBatchDeleteInput,
  DocsBatchDeleteResult,
  DocRawBatchItem,
  DocRawBatchFailure,
  DocsRawBatchResult,
  DocsBatchMoveInput,
  DocsBatchMoveResult,
  DocRevisionOrigin,
  DocRevision,
  DocRevisionList,
  DocRevisionDetail,
  RestoreDocRevisionResult,
  // v0.3.0 docs/KB 域批次:知识库(KB)+ 同步协议 + 冲突分支
  Kb,
  KbListOptions,
  CreateKbInput,
  UpdateKbInput,
  KbSyncProtocolVersion,
  KbManifestOptions,
  KbManifestEntry,
  KbTombstoneEntry,
  KbManifest,
  KbSyncUpsertOp,
  KbSyncDeleteOp,
  KbSyncMoveOp,
  KbSyncOp,
  KbSyncInput,
  KbSyncAppliedItem,
  KbSyncConflictReason,
  KbSyncConflictItem,
  KbSyncResult,
  KbTreeDeleteResult,
  KbConflictStatus,
  KbConflictBranch,
  KbConflictListOptions,
  CreateKbConflictInput,
  AcceptKbConflictResult,
  DiscardKbConflictResult,
  // v0.3.0 AIGC 域批次:项目/剧集/内容/资产/批量任务/模板/生成
  AigcProjectType,
  AigcProjectStatus,
  AigcProject,
  AigcProjectListParams,
  CreateAigcProjectInput,
  UpdateAigcProjectInput,
  CreateAigcProjectFromTemplateInput,
  AigcSyncToOutputResult,
  AigcEpisodeStatus,
  AigcEpisode,
  CreateAigcEpisodeInput,
  UpdateAigcEpisodeInput,
  AigcContent,
  CreateAigcContentInput,
  UpdateAigcContentInput,
  AigcAssetStatus,
  AigcAsset,
  AigcAssetListParams,
  AigcAssetStatusInfo,
  GenerateAigcAssetInput,
  GenerateAigcAssetSyncResult,
  GenerateAigcAssetAsyncResult,
  GenerateAigcAssetFailedResult,
  GenerateAigcAssetResult,
  AigcBatchJobItemInput,
  GenerateAigcBatchInput,
  GenerateAigcBatchAccepted,
  AigcBatchJobStatus,
  AigcBatchJob,
  AigcTemplate,
  AigcTemplateListParams,
  AigcContentTreeNode,
  AigcEpisodeTreeNode,
  AigcProjectTree,
  // v0.3.0 AIGC 域批次:Credit 钱包 + AIGC 协议
  CreditBalance,
  CreditLedgerReason,
  CreditLedgerItem,
  CreditLedgerParams,
  CreditTopupPackageKey,
  CreditTopupInput,
  CreditTopupCheckout,
  AgreementType,
  AgreementVersionInfo,
  AgreementStatus,
  AcceptAgreementInput,
  // v0.3.0 AIGC 域批次:AI 工具箱
  AiToolKey,
  AiToolOutputType,
  AiToolSpec,
  InvokeAiToolInput,
  AiToolOutput,
  AiToolResult,
  AiToolLogItem,
  AiToolLogsParams,
  // v0.3.0 账户/平台域批次:认证流(无状态端点)
  VerificationCodeType,
  SendCodeInput,
  AuthMessageResult,
  RegisterInput,
  LoginInput,
  LoginWithCodeInput,
  AuthResult,
  RefreshSessionResult,
  AuthVerifyResult,
  ResetPasswordInput,
  CreateExportTokenInput,
  ExportTokenGrant,
  ExportTokenPayload,
  // v0.3.0 账户/平台域批次:用户资料 / 用量 / 身份 / 头像
  UpdateUserInput,
  ImageUsage,
  VideoUsage,
  UsageStats,
  ClearDocRevisionsResult,
  RateLimitTierStatus,
  UserRateLimits,
  IdentityProvider,
  Identity,
  UploadAvatarInput,
  AvatarUploadResult,
  // v0.3.0 账户/平台域批次:API Key 管理
  ApiKey,
  CreateApiKeyInput,
  CreatedApiKey,
  UpdateApiKeyInput,
  UpdatedApiKey,
  ApiKeyToolConfigs,
  // v0.80.0:教学画板(.boardraw)
  Board,
  BoardListResult,
  BoardListParams,
  CreateBoardInput,
  UpdateBoardInput,
  BoardBatchDeleteResult,
  // v0.3.0 账户/平台域批次:自定义域名
  CustomDomain,
  CreateDomainInput,
  CreateDomainResult,
  DomainVerifyResult,
  // v0.3.0 账户/平台域批次:系统健康检查
  HealthStatus,
  // v0.3.0 平台域批次:billing
  PlanPricing,
  BillingPlans,
  CreateCheckoutInput,
  CheckoutSession,
  ActivateCheckoutProvider,
  ActivateCheckoutInput,
  ActivateCheckoutSession,
  ActivateInviteCodeInput,
  ActivateInviteCodeResult,
  BillingSubscription,
  BillingOrder,
  BillingHistoryItem,
  // v0.3.0 平台域批次:campaigns / notifications / tickets / insights
  CampaignBanner,
  ActiveCampaign,
  ActiveCampaignResult,
  ClaimCouponResult,
  ValidateCouponInput,
  CouponValidation,
  NotificationItem,
  NotificationListParams,
  MarkNotificationsReadInput,
  MarkReadResult,
  UnreadCountResult,
  TicketStatus,
  TicketPriority,
  Ticket,
  TicketMessage,
  CreateTicketInput,
  TicketListParams,
  TicketDetail,
  ReplyTicketInput,
  InsightsDailyParams,
  InsightRefererStat,
  InsightCountryStat,
  InsightDailyItem,
  InsightsSummary,
  InsightsDaily,
  RollupDayInput,
  RollupDayResult,
  // v0.3.0 平台域批次:orgs(Teams)
  OrgPlan,
  OrgRole,
  Org,
  OrgWithRole,
  OrgDetail,
  CreateOrgInput,
  OrgMember,
  OrgAuditLogItem,
  OrgAuditLogParams,
  UpdateOrgMemberRoleInput,
  InviteOrgMemberInput,
  InviteOrgMemberResult,
  AcceptOrgInviteInput,
  AcceptOrgInviteResult,
  OrgCheckoutInput,
  OrgCheckoutResult,
  ChangeOrgSeatsInput,
  ChangeOrgSeatsResult,
  // v0.3.0 平台域批次:migration + backup
  MigrationSource,
  MigrationPackageType,
  MigrationJobStatus,
  MigrationJob,
  CreateMigrationJobInput,
  CreateApplePhotosJobInput,
  ApplePhotosJobCreated,
  ApplePhotosZipStatus,
  ApplePhotosZipUpload,
  ApplePhotosJobStatus,
  ApplePhotosFinalizeResult,
  BackupTarget,
  BackupSchedule,
  BackupSubscription,
  CreateBackupSubscriptionInput,
  CreatedBackupSubscription,
  BackupJobStatus,
  BackupJob,
  CreateOnetimeBackupInput,
  OnetimeBackupAccepted,
  BackupJobListParams,
  // v0.3.0 平台域批次:publish + published-pages + mcp
  PublishPlatformKey,
  PublishPlatformBinding,
  ConnectPlatformInput,
  PublishJobStatus,
  PublishJob,
  CreatePublishJobInput,
  PublishedPageLayout,
  PublishedPageStatus,
  PublishedPage,
  CreatePublishedPageInput,
  UpdatePublishedPageInput,
  WechatExportResult,
  McpToolInfo,
  McpToolsCatalog,
  McpToolUsage,
  McpUsage,
} from './types/index.js'

// v0.3.0 媒体域批次:新命名空间接口类型
export type { ImagesNamespace } from './resources/images.js'
export type { UploadsNamespace } from './resources/uploads-tus.js'
export type { VideosNamespace } from './resources/videos.js'
export type { AudioNamespace } from './resources/audio.js'
export type { MediaNamespace } from './resources/media.js'
export type { WatermarkTemplatesNamespace } from './resources/watermark.js'
export type { StorageTierNamespace } from './resources/storage-tier.js'

// v0.3.0 docs/KB 域批次:新命名空间接口类型
export type { DocsNamespace } from './resources/docs.js'
export type { KbsNamespace } from './resources/kbs.js'

// v0.3.0 AIGC 域批次:新命名空间接口类型
export type {
  AigcNamespace,
  AigcProjectsNamespace,
  AigcEpisodesNamespace,
  AigcContentsNamespace,
  AigcAssetsNamespace,
  AigcBatchJobsNamespace,
  AigcTemplatesNamespace,
  AigcGenerationMethods,
} from './resources/aigc/index.js'
export type { AiToolsNamespace } from './resources/ai-tools.js'
export type { CreditNamespace } from './resources/credit.js'
export type { AgreementsNamespace } from './resources/agreements.js'

// v0.3.0 账户/平台域批次:新命名空间接口类型(AuthNamespace 为既有命名空间,一并补导出)
export type { AuthNamespace } from './resources/auth.js'
export type { UserNamespace } from './resources/user.js'
export type { ApiKeysNamespace } from './resources/api-keys.js'
export type { BoardsNamespace } from './resources/boards.js'
export type { DomainsNamespace } from './resources/domains.js'
export type { SystemNamespace } from './resources/system.js'

// v0.3.0 平台域批次(第 5 批,台账清零):新命名空间接口类型
export type { BillingNamespace } from './resources/billing.js'
export type { CampaignsNamespace } from './resources/campaigns.js'
export type { NotificationsNamespace } from './resources/notifications.js'
export type { TicketsNamespace } from './resources/tickets.js'
export type { OrgsNamespace } from './resources/orgs.js'
export type { InsightsNamespace } from './resources/insights.js'
export type { MigrationNamespace } from './resources/migration.js'
export type { BackupNamespace } from './resources/backup.js'
export type { PublishNamespace } from './resources/publish.js'
export type { PublishedPagesNamespace } from './resources/published-pages.js'
export type { McpNamespace } from './resources/mcp.js'
