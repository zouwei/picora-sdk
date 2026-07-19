# Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 与 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [0.4.0] — 2026-07-20

跟进 picora-service **v0.80(教学画板 `.boardraw`)** 与 **v0.81(API Key 细粒度 scopes)** 两处契约新增,补齐 SDK 覆盖。vendored 契约 `spec/openapi-public.json` 由 228 → 236 operations,OpenAPI 覆盖率硬门禁重新对齐全量(零欠账)。

### Added

- **`boards` 命名空间**(教学画板 `.boardraw`,Excalidraw 兼容场景 JSON,v0.80.0)—— 7 方法:`create`(上传,受套餐门禁)/ `list`(游标分页,支持 `q` / `tag` / `isPublic` / `sort` 过滤)/ `get`(元数据)/ `getRaw`(场景全文,text 模式直返 JSON 字符串,公开画板免鉴权)/ `update`(title / isPublic / tags)/ `delete`(单删)/ `batchDelete`(1~50 个,返回 deleted/failed);新增类型 `Board` / `BoardListResult` / `BoardListParams` / `CreateBoardInput` / `UpdateBoardInput` / `BoardBatchDeleteResult`
  - 注:boards 列表响应仅 `{ items, nextCursor }`(不含 media 端点的 `hasMore`),故用专用 `BoardListResult` 而非 `PaginatedResponse`
- **重新加入 `apiKeys.update`**(`PATCH /v1/api-keys/{id}`)—— picora-service v0.81 起该路由已存在(0.3.0 曾因当时无对应路由删除,见下);支持更新 `name` / `description` / `scopes`(v2 细粒度权限,覆盖式替换,变更后立即清鉴权缓存);新增类型 `UpdateApiKeyInput` / `UpdatedApiKey`(响应含 `description`、不含 `keyPrefix`,与列表项 `ApiKey` 区分)

### Internal

- 测试 266 → 274(新增 boards 8 case + apiKeys.update K3 case);覆盖率门禁 `openapi-coverage.test.ts` 随 236 operations 全量绿

## [0.3.0] — 2026-07-19

独立仓库首个版本(自 picora-service `packages/sdk` 迁出,git 历史保留);实现公开 Picora API **全量覆盖(228 operations)**,由 OpenAPI 覆盖率 CI 硬门禁保证(v0.82.0 迭代)。仓库为多语言容器,Node.js SDK 位于 `sdk-nodejs/` 子目录。

### Added

- **27 个新命名空间**,覆盖 openapi-public.json 全部剩余端点:`user` / `apiKeys` / `uploads`(TUS 1.0 断点续传)/ `videos` / `audio` / `media` / `docs`(含 revisions)/ `kbs`(含 conflicts、manifest ETag/304)/ `aigc`(projects / episodes / contents / assets / batchJobs / templates / generate)/ `aiTools` / `credit` / `agreements` / `billing` / `campaigns` / `notifications` / `tickets` / `domains` / `watermarkTemplates` / `storageTier` / `orgs` / `insights` / `migration` / `backup` / `publish` / `publishedPages` / `mcp` / `system`;既有 `auth` / `images` / `collections` / `oauth` 补齐全部端点
- **鉴权栈**:`createOAuthTokenProvider`(TokenStorage 驱动的 OAuth 自动刷新会话:single-flight、skew 预刷新、**旋转不变式**——新 token 对先持久化再生效)、`createJwtSession`(第一方邮箱登录会话,Node 侧 Set-Cookie 捕获)、PKCE helper(`generateCodeVerifier` / `computeCodeChallenge` S256 / `generateState`)、授权码流(`createAuthorizationRequest` / `exchangeAuthorizationCode` / `refreshAccessToken` / `revokeToken`)、发现文档(well-known ×3 + userinfo);新错误类 `PicoraReauthRequiredError`(终态,须重新授权)
- **core 层**:统一请求核心五种响应形态(data / bare / text / raw / none)、`retry:false` 非幂等逃生口、401 刷新钩子(恰重试一次);`paginateAll` 自动翻页迭代器与 `normalizePage` 键名归一;`toFormData` multipart 构造
- **契约同步与门禁**:vendored 契约快照 `spec/openapi-public.json` + `pnpm spec:sync` / `spec:check`;`openapi-coverage.test.ts` 双向覆盖率硬门禁(spec ↔ SDK 方法注册表,含 ratchet 台账机制,当前已清零);CI(PR + 发版)强制
- `client.http` 底层逃生口;`SDK_VERSION` 导出

### Fixed

- **`auth.me()` 线上 404**:0.2.x 请求不存在的 `GET /v1/auth/me`,修正为 `GET /v1/user/me`(规范入口 `user.get()`,`auth.me()` 保留为别名)
- **设备码流 URL 错误**:`startDeviceFlow` 曾 POST 到 `/oauth/device_authorization`,服务端实际挂载于 `/v1/oauth/device_authorization`
- **User-Agent 版本漂移**:SDK_VERSION 常量(0.2.0)与 package.json(0.2.2)不一致;现单一来源化到 `src/version.ts` 并有测试对账
- **`orgs.auditLogs` 恒返回空**:该端点返回裸数组,旧实现却按 `{items,nextCursor}` 分页解析(`normalizePage(raw,'items')`)导致永远返回空列表;修正为返回 `OrgAuditLogItem[]`,并暴露服务端实际支持的 `action` / `limit` 查询参数(移除被忽略的 `cursor`);同步修正 `OrgAuditLogItem` 字段名(`userId` / `resourceType` / `resourceId` / `metadata`,原 `actorUserId` / `targetType` 等与服务端不符)
- **`images.list` 页大小被忽略**:0.2.x 发送 `pageSize` / `isPublic` 查询键,但服务端 `/v1/images` 只认 `limit` / `tag` / `start_date` / `end_date`;修正为将 `pageSize` 映射到 `limit`、移除无效的 `isPublic`、新增 `startDate` / `endDate`
- **`publishedPages.update` 丢弃返回值**:改为返回更新后的 `PublishedPage`(服务端本就返回)
- **移除死方法 `apiKeys.update`**:`PATCH /v1/api-keys/{id}` 在当前 API 无对应路由;`ApiKey` 类型对齐服务端实际返回(`scope` / `scopesV2` / `scopeVersion`);`User` 类型补 `isActive` 并将 `locale` 改为必填

### Changed

- **仓库迁移**:代码自 picora-service monorepo `packages/sdk` 迁出为独立开源仓库 picora-sdk(git 历史经 subtree split 保留);发版 workflow 随迁,tag 约定由 `sdk-v*` 改为 `v*`
- **打包修正(潜在 breaking)**:`main` / `exports` 由 TS 源码(`./src/*.ts`)切换为编译产物(`./dist/*.js` + d.ts,NodeNext ESM)——纯 Node 消费者首次可直接 import;经 bundler 消费的场景透明;**deep-import `@picora/sdk/src/...` 内部路径的用法会失效**(npm 上无已知此类消费者)
- 子路径导出 `./types` 现指向 `dist/types/index.js`(类型按域拆分多文件,符号名与导入路径保持兼容)
- `PicoraClientOptions` 新增 `session`(注入自定义 AuthProvider);`apiKey` / `oauthToken` 语义与互斥行为不变

### Internal

- 测试 82 → 266(vitest,mock fetch,零网络);tsconfig 迁移至 NodeNext(相对导入带 `.js` 扩展名);中文 JSDoc 全量覆盖导出符号

## [0.2.2] 及更早 — 2026-05 ~ 2026-07(picora-service `packages/sdk` 时期)

- **0.2.x**(v0.61 迭代):collections / collectionTypes / episodes 命名空间(含 `episodes.sync` 第三方资产同步主入口);设备码流 helper(RFC 8628)+ `TokenStorage` 抽象;`@picora/sdk/node` 子路径(FileTokenStorage / KeychainTokenStorage,v0.65)
- **0.1.0**(v0.31 迭代首发):fluent client(`createPicoraClient`)、错误类层级(PicoraApiError / PicoraNetworkError / PicoraRateLimitError)、429/5xx 重试矩阵、auth / images / apps 高频端点
