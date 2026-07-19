/**
 * user 命名空间(v0.3.0 账户域批次)—— 当前用户资料 / 用量 / 身份 / 密码 / 头像。
 *
 * GET /v1/user/me 的规范 COVERAGE 登记在本模块(user.get);
 * auth.me 是同一端点的历史别名(0.2.x 兼容),不重复登记。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import { toFormData } from '../core/multipart.js'
import type {
  AvatarUploadResult,
  ClearDocRevisionsResult,
  Identity,
  UpdateUserInput,
  UploadAvatarInput,
  UsageStats,
  User,
  UserRateLimits,
} from '../types/index.js'

export interface UserNamespace {
  /** 获取当前登录用户信息(服务端优先从缓存 `user:{userId}` 读取)。 */
  get(): Promise<User>
  /** 更新 Profile(昵称 / 头像 URL / 语言偏好;仅上送提供的字段)。成功后服务端自动清用户缓存。 */
  update(patch: UpdateUserInput): Promise<User>
  /**
   * **永久注销当前账号(不可逆!)**:删除账号及所有关联数据 —— 图片记录、视频记录、
   * API Key、OAuth 授权、文档等。文档存储文件 best-effort 清理,图片文件由异步孤儿
   * 对账任务处理。执行后 refresh token 立即失效,客户端须清除本地 token。
   * 调用前请务必获得用户显式确认。
   */
  deleteAccount(): Promise<void>
  /** 修改密码(须验证旧密码)。三方登录用户(无密码)请用 setPassword。 */
  changePassword(input: { oldPassword: string; newPassword: string }): Promise<void>
  /**
   * 为三方登录账号(Google/Apple/微信/手机)设置初始密码(≥ 8 字符),
   * 以支持邮箱+密码登录。已有密码的账号会 422,应改用 changePassword。
   */
  setPassword(input: { newPassword: string }): Promise<void>
  /** 获取资源用量统计(图片存储 / 上传计数 / 视频存储 / 当月 CDN 带宽;视频数据每小时同步,有轻微延迟)。 */
  usage(): Promise<UsageStats>
  /**
   * 清空当前用户全部文档历史版本,回收存储空间(不可逆)。
   * 单批最多 200 条,hasMore=true 时继续调用直到 false;不受套餐门禁限制。
   */
  clearDocRevisions(): Promise<ClearDocRevisionsResult>
  /**
   * 获取实时限流状态(read / upload / mutation 分钟桶 + hourly 合计)。
   * 本端点不消耗限流额度;同样数据也在各响应的 RateLimit-* 头中提供。
   */
  rateLimits(): Promise<UserRateLimits>
  /** 已绑定登录身份管理(邮箱 / Google / Apple / 微信 / 手机号)。 */
  readonly identities: {
    /** 列出全部已绑定身份(providerIdMasked 已脱敏,不含完整值)。 */
    list(): Promise<Identity[]>
    /**
     * 解绑指定登录身份。不能解绑最后一个登录方式(服务端 422,防账号锁死);
     * 解绑后该方式立即无法登录此账号。
     */
    unlink(identityId: string): Promise<void>
  }
  /**
   * 上传用户头像(multipart;JPEG/PNG/WebP/GIF,≤ 2 MB,超限 413)。
   * 返回带 cache-bust 参数的新头像 URL。非幂等上传,SDK 关闭 429/5xx 自动重试。
   */
  uploadAvatar(input: UploadAvatarInput): Promise<AvatarUploadResult>
  /**
   * 读取任意用户头像(公开端点,无需认证;头像不存在时抛 404)。
   * 返回 Response 本体:二进制内容用 `await res.arrayBuffer()` 读取,
   * 图片格式看 `res.headers.get('Content-Type')`(image/jpeg | image/png | image/webp,
   * 依上传格式而定);浏览器端缓存 1 小时(Cache-Control: public, max-age=3600)。
   */
  avatarOf(userId: string): Promise<Response>
}

export function createUserNamespace(http: HttpCore): UserNamespace {
  return {
    get: () => http.request<User>({ method: 'GET', path: '/v1/user/me' }),
    update: (patch) =>
      http.request<User>({
        method: 'PATCH',
        path: '/v1/user/me',
        body: {
          ...(patch.nickname !== undefined ? { nickname: patch.nickname } : {}),
          ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
          ...(patch.locale !== undefined ? { locale: patch.locale } : {}),
        },
      }),
    deleteAccount: async () => {
      await http.request<void>({ method: 'DELETE', path: '/v1/user/me', response: 'none' })
    },
    changePassword: async (input) => {
      await http.request<void>({
        method: 'POST',
        path: '/v1/user/me/change-password',
        body: { oldPassword: input.oldPassword, newPassword: input.newPassword },
        response: 'none',
      })
    },
    setPassword: async (input) => {
      await http.request<void>({
        method: 'POST',
        path: '/v1/user/me/set-password',
        body: { newPassword: input.newPassword },
        response: 'none',
      })
    },
    usage: () => http.request<UsageStats>({ method: 'GET', path: '/v1/user/me/usage' }),
    clearDocRevisions: () =>
      http.request<ClearDocRevisionsResult>({
        method: 'DELETE',
        path: '/v1/user/me/doc-revisions',
      }),
    rateLimits: () =>
      http.request<UserRateLimits>({ method: 'GET', path: '/v1/user/me/rate-limits' }),
    identities: {
      list: () => http.request<Identity[]>({ method: 'GET', path: '/v1/user/me/identities' }),
      unlink: async (identityId) => {
        await http.request<void>({
          method: 'DELETE',
          path: `/v1/user/me/identities/${encodeURIComponent(identityId)}`,
          response: 'none',
        })
      },
    },
    uploadAvatar: (input) => {
      const form = toFormData('file', {
        file: input.file,
        filename: input.filename,
        ...(input.contentType !== undefined ? { contentType: input.contentType } : {}),
      })
      return http.request<AvatarUploadResult>({
        method: 'POST',
        path: '/v1/user/me/avatar',
        body: form,
        retry: false,
      })
    },
    avatarOf: (userId) =>
      http.request<Response>({
        method: 'GET',
        path: `/v1/user/avatar/${encodeURIComponent(userId)}`,
        response: 'raw',
      }),
  }
}

/** GET /v1/user/me 的规范登记在此(auth.me 为别名,不重复登记)。 */
export const USER_COVERAGE = [
  { method: 'GET', path: '/v1/user/me', client: 'user.get' },
  { method: 'PATCH', path: '/v1/user/me', client: 'user.update' },
  { method: 'DELETE', path: '/v1/user/me', client: 'user.deleteAccount' },
  { method: 'POST', path: '/v1/user/me/change-password', client: 'user.changePassword' },
  { method: 'POST', path: '/v1/user/me/set-password', client: 'user.setPassword' },
  { method: 'GET', path: '/v1/user/me/usage', client: 'user.usage' },
  { method: 'DELETE', path: '/v1/user/me/doc-revisions', client: 'user.clearDocRevisions' },
  { method: 'GET', path: '/v1/user/me/rate-limits', client: 'user.rateLimits' },
  { method: 'GET', path: '/v1/user/me/identities', client: 'user.identities.list' },
  { method: 'DELETE', path: '/v1/user/me/identities/{identityId}', client: 'user.identities.unlink' },
  { method: 'POST', path: '/v1/user/me/avatar', client: 'user.uploadAvatar' },
  { method: 'GET', path: '/v1/user/avatar/{userId}', client: 'user.avatarOf' },
] as const satisfies readonly CoveredOperation[]
