/**
 * OpenAPI 覆盖率聚合注册表(v0.3.0)。
 *
 * 每个 resource / helper 模块在自己文件尾部导出 `XXX_COVERAGE` 声明,本文件仅做聚合;
 * __tests__/openapi-coverage.test.ts 用聚合结果与 spec/openapi-public.json 双向对账。
 *
 * 新增命名空间时:实现文件导出 COVERAGE 常量 → 在此追加一行 spread →
 * 从 known-gap.ts 删除对应条目 → pnpm test 验证门禁绿。
 */

import type { CoveredOperation } from './types.js'
import { AUTH_COVERAGE } from '../resources/auth.js'
import { APPS_COVERAGE } from '../resources/apps.js'
import { IMAGES_COVERAGE } from '../resources/images.js'
import { COLLECTIONS_COVERAGE } from '../resources/collections.js'
import { COLLECTION_TYPES_COVERAGE } from '../resources/collection-types.js'
import { EPISODES_COVERAGE } from '../resources/episodes.js'
import { OAUTH_MGMT_COVERAGE } from '../resources/oauth-mgmt.js'
import { UPLOADS_COVERAGE } from '../resources/uploads-tus.js'
import { VIDEOS_COVERAGE } from '../resources/videos.js'
import { AUDIO_COVERAGE } from '../resources/audio.js'
import { MEDIA_COVERAGE } from '../resources/media.js'
import { WATERMARK_COVERAGE } from '../resources/watermark.js'
import { STORAGE_TIER_COVERAGE } from '../resources/storage-tier.js'
import { DOCS_COVERAGE } from '../resources/docs.js'
import { KBS_COVERAGE } from '../resources/kbs.js'
import { AIGC_COVERAGE } from '../resources/aigc/index.js'
import { AI_TOOLS_COVERAGE } from '../resources/ai-tools.js'
import { CREDIT_COVERAGE } from '../resources/credit.js'
import { AGREEMENTS_COVERAGE } from '../resources/agreements.js'
import { USER_COVERAGE } from '../resources/user.js'
import { API_KEYS_COVERAGE } from '../resources/api-keys.js'
import { BOARDS_COVERAGE } from '../resources/boards.js'
import { DOMAINS_COVERAGE } from '../resources/domains.js'
import { SYSTEM_COVERAGE } from '../resources/system.js'
import { BILLING_COVERAGE } from '../resources/billing.js'
import { CAMPAIGNS_COVERAGE } from '../resources/campaigns.js'
import { NOTIFICATIONS_COVERAGE } from '../resources/notifications.js'
import { TICKETS_COVERAGE } from '../resources/tickets.js'
import { ORGS_COVERAGE } from '../resources/orgs.js'
import { INSIGHTS_COVERAGE } from '../resources/insights.js'
import { MIGRATION_COVERAGE } from '../resources/migration.js'
import { BACKUP_COVERAGE } from '../resources/backup.js'
import { PUBLISH_COVERAGE } from '../resources/publish.js'
import { PUBLISHED_PAGES_COVERAGE } from '../resources/published-pages.js'
import { MCP_COVERAGE } from '../resources/mcp.js'
import { OAUTH_AUTHORIZATION_COVERAGE } from '../oauth/authorization.js'
import { OAUTH_DISCOVERY_COVERAGE } from '../oauth/discovery.js'
import { DEVICE_FLOW_COVERAGE } from '../device-flow.js'

export const COVERAGE_MANIFEST: readonly CoveredOperation[] = [
  ...AUTH_COVERAGE,
  ...APPS_COVERAGE,
  ...IMAGES_COVERAGE,
  ...COLLECTIONS_COVERAGE,
  ...COLLECTION_TYPES_COVERAGE,
  ...EPISODES_COVERAGE,
  ...OAUTH_MGMT_COVERAGE,
  ...OAUTH_AUTHORIZATION_COVERAGE,
  ...OAUTH_DISCOVERY_COVERAGE,
  ...DEVICE_FLOW_COVERAGE,
  // v0.3.0 媒体域批次
  ...UPLOADS_COVERAGE,
  ...VIDEOS_COVERAGE,
  ...AUDIO_COVERAGE,
  ...MEDIA_COVERAGE,
  ...WATERMARK_COVERAGE,
  ...STORAGE_TIER_COVERAGE,
  // v0.3.0 docs/KB 域批次(collections.manifest 已并入 COLLECTIONS_COVERAGE)
  ...DOCS_COVERAGE,
  ...KBS_COVERAGE,
  // v0.80.0:教学画板(.boardraw)
  ...BOARDS_COVERAGE,
  // v0.3.0 AIGC 域批次(AIGC_COVERAGE 已聚合 projects / content / assets 三个子文件)
  ...AIGC_COVERAGE,
  ...AI_TOOLS_COVERAGE,
  ...CREDIT_COVERAGE,
  ...AGREEMENTS_COVERAGE,
  // v0.3.0 账户/平台域批次(AUTH_COVERAGE 已扩展;GET /v1/user/me 规范登记迁至 user.get)
  ...USER_COVERAGE,
  ...API_KEYS_COVERAGE,
  ...DOMAINS_COVERAGE,
  ...SYSTEM_COVERAGE,
  // v0.3.0 平台域批次(第 5 批,台账清零)
  ...BILLING_COVERAGE,
  ...CAMPAIGNS_COVERAGE,
  ...NOTIFICATIONS_COVERAGE,
  ...TICKETS_COVERAGE,
  ...ORGS_COVERAGE,
  ...INSIGHTS_COVERAGE,
  ...MIGRATION_COVERAGE,
  ...BACKUP_COVERAGE,
  ...PUBLISH_COVERAGE,
  ...PUBLISHED_PAGES_COVERAGE,
  ...MCP_COVERAGE,
]
