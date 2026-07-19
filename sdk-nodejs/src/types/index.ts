/**
 * `@picora/sdk` 公开类型 barrel(子路径 `@picora/sdk/types` 的入口)。
 *
 * v0.3.0 起类型按域拆分为多文件(原单文件 types.ts),对消费者的导入路径与
 * 符号名保持完全兼容。新增域类型(docs / kbs / aigc / billing 等)随分批补齐追加。
 */

export type { Plan, KeyScopeV2, PaginatedResponse, RateLimitInfo } from './common.js'
export type { User, Subscription, AuthorizedApp } from './account.js'
export type { Image, ImageListParams } from './media.js'
// v0.3.0 媒体域批次:图片扩展 + 增量同步 + 统一媒体
export type {
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
  MediaType,
  MediaItem,
  MediaListParams,
  MediaRef,
  MediaBatchDeleteResult,
} from './media.js'
export type {
  Video,
  VideoStatus,
  VideoListParams,
  UploadVideoInput,
  UploadVideoAccepted,
  UpdateVideoInput,
  VideoStatusInfo,
  VideoPublicMeta,
} from './videos.js'
export type { Audio, UploadAudioInput, UpdateAudioInput } from './audio.js'
export type {
  TusCreateInput,
  TusUploadSession,
  TusUploadProgress,
  TusAppendResult,
  TusCapabilities,
} from './uploads.js'
export type {
  WatermarkType,
  WatermarkPosition,
  WatermarkTemplate,
  WatermarkTemplateInput,
} from './watermark.js'
export type {
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
} from './storage-tier.js'
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
} from './oauth.js'
export type {
  CollectionType,
  CollectionResourceType,
  Collection,
  CollectionListParams,
  CreateCollectionInput,
  UpdateCollectionInput,
  CollectionType_Item,
  CreateCollectionTypeInput,
  EpisodeStatus,
  Episode,
  EpisodeListParams,
  CreateEpisodeInput,
  UpdateEpisodeInput,
  EpisodeSyncAssetRef,
  EpisodeSyncInput,
  EpisodeSyncApplied,
  EpisodeSyncResult,
} from './collections.js'
// v0.3.0 docs/KB 域批次:合集 v3 多资源清单
export type {
  CollectionManifestParams,
  CollectionManifestItem,
  CollectionManifestCounts,
  CollectionManifest,
} from './collections.js'
// v0.3.0 docs/KB 域批次:Markdown 文档 + 历史版本
export type {
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
} from './docs.js'
// v0.3.0 docs/KB 域批次:知识库(KB)+ 同步协议 + 冲突分支
export type {
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
} from './kbs.js'
// v0.3.0 AIGC 域批次:项目/剧集/内容/资产/批量任务/模板/生成
export type {
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
} from './aigc.js'
// v0.3.0 AIGC 域批次:Credit 钱包 + AIGC 协议
export type {
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
} from './credit.js'
// v0.3.0 AIGC 域批次:AI 工具箱
export type {
  AiToolKey,
  AiToolOutputType,
  AiToolSpec,
  InvokeAiToolInput,
  AiToolOutput,
  AiToolResult,
  AiToolLogItem,
  AiToolLogsParams,
} from './ai-tools.js'
// v0.3.0 账户/平台域批次:认证流(无状态端点)
export type {
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
} from './auth.js'
// v0.3.0 账户/平台域批次:用户资料 / 用量 / 身份 / 头像
export type {
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
} from './user.js'
// v0.3.0 账户/平台域批次:API Key 管理
export type {
  ApiKey,
  CreateApiKeyInput,
  CreatedApiKey,
  UpdateApiKeyInput,
  UpdatedApiKey,
  ApiKeyToolConfigs,
} from './api-keys.js'
// v0.80.0:教学画板(.boardraw,Excalidraw 兼容场景 JSON)
export type {
  Board,
  BoardListResult,
  BoardListParams,
  CreateBoardInput,
  UpdateBoardInput,
  BoardBatchDeleteResult,
} from './boards.js'
// v0.3.0 账户/平台域批次:自定义域名
export type {
  CustomDomain,
  CreateDomainInput,
  CreateDomainResult,
  DomainVerifyResult,
} from './domains.js'
// v0.3.0 账户/平台域批次:系统健康检查
export type { HealthStatus } from './system.js'
// v0.3.0 平台域批次:billing(套餐定价 / checkout / 邀请码激活 / 订阅 / 订单 / 历史)
export type {
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
} from './billing.js'
// v0.3.0 平台域批次:campaigns / notifications / tickets / insights
export type {
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
} from './platform.js'
// v0.3.0 平台域批次:orgs(Teams 组织 / 成员 / 邀请 / 订阅)
export type {
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
} from './orgs.js'
// v0.3.0 平台域批次:migration(一键迁入)+ backup(备份导出)
export type {
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
} from './migration-backup.js'
// v0.3.0 平台域批次:publish(多平台发布)+ published-pages(发布页)+ mcp
export type {
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
} from './publish.js'
