/**
 * auth 命名空间(0.2.x 存量:me / subscription;v0.3.0 账户域批次补齐完整认证流)。
 *
 * 定位:**无状态端点封装**,逐端点直调 —— 与 core/jwt-session.ts 互补不重复:
 *   - createJwtSession:管会话生命周期(Set-Cookie 捕获 / access token 预刷新 / 401 兜底)
 *   - 本命名空间:发验证码 / 注册登录 / 三方登录 / 忘记密码 / 凭证校验 / 导出令牌等单发调用
 *
 * 验证码类端点受服务端 4 层防刷保护:发送限流(同邮箱 60s 1 封 / 1h 5 封 / 24h 10 封,
 * 同 IP 1h 20 封)→ 人机验证(同 IP 第 3 次起)→ 验证码安全(6 位 / 5 分钟 / 单次,
 * 失败 5 次作废)→ 异常监控自动封禁。SDK 侧命中 429 时按 Retry-After 自动退避。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  AuthMessageResult,
  AuthResult,
  AuthVerifyResult,
  CreateExportTokenInput,
  ExportTokenGrant,
  ExportTokenPayload,
  LoginInput,
  LoginWithCodeInput,
  RefreshSessionResult,
  RegisterInput,
  ResetPasswordInput,
  SendCodeInput,
  Subscription,
  User,
} from '../types/index.js'

export interface AuthNamespace {
  /**
   * 获取当前用户信息(`GET /v1/user/me` 的**别名**,规范入口为 user.get)。
   *
   * 0.2.x 曾请求 `GET /v1/auth/me` —— 该路径服务端**不存在**(必 404),
   * 0.3.0 修正为真实端点 `GET /v1/user/me`(见 CHANGELOG Fixed)。
   */
  me(): Promise<User>
  /** 获取当前订阅信息(套餐、限额、features)。 */
  subscription(): Promise<Subscription>

  /**
   * 发送邮箱验证码(6 位数字,5 分钟有效,单次使用)。
   * 无论邮箱是否已注册,响应格式相同(防邮箱枚举)。受 4 层防刷限流(见模块头注释)。
   */
  sendCode(input: SendCodeInput): Promise<AuthMessageResult>
  /**
   * 邮箱 + 密码注册(须先 sendCode type='register' 获取验证码)。
   * refresh token 经 httpOnly Set-Cookie 下发,本方法只返回 body 的 data
   * (accessToken + user);需要完整会话管理请用 createJwtSession。
   */
  register(input: RegisterInput): Promise<AuthResult>
  /**
   * 邮箱 + 密码登录(连续失败 5 次锁定 15 分钟)。
   * refresh token 经 Set-Cookie 下发,本方法只返回 data;完整会话请用 createJwtSession。
   */
  login(input: LoginInput): Promise<AuthResult>
  /**
   * 邮箱验证码无密码登录(新邮箱自动注册;验证码经 sendCode type='register' 发送)。
   * refresh token 经 Set-Cookie 下发,本方法只返回 data;完整会话请用 createJwtSession。
   */
  loginWithCode(input: LoginWithCodeInput): Promise<AuthResult>
  /**
   * 刷新 access token。服务端只认 httpOnly Cookie(不收 body),
   * Node 侧需显式传 refresh token(SDK 以 `Cookie: refresh_token=...` 头带回);
   * 浏览器 / 会话场景请用 createJwtSession(自动捕获并携带 Cookie)。
   * refresh token 失效时返回 401(会话终态,须重新登录)。
   */
  refresh(opts: { refreshToken: string }): Promise<RefreshSessionResult>
  /**
   * 登出:服务端吊销 refresh token(写吊销标记)并清除 Cookie。
   * 同 refresh:Node 侧需显式传 refresh token;会话场景请用 createJwtSession 的 logout。
   */
  logout(opts: { refreshToken: string }): Promise<void>
  /**
   * 校验当前凭证(API Key / JWT)有效性 —— 第三方工具「测试连接」专用轻量端点,
   * 替代「上传占位图」反模式(不污染图库 / 不耗配额)。零 DB 开销,高频调用安全。
   * 无效凭证直接抛 401(PicoraApiError)。
   */
  verify(): Promise<AuthVerifyResult>
  /**
   * 发起密码重置:发送重置验证码到邮箱(5 分钟有效)。
   * 无论邮箱是否存在,响应相同(防枚举);受发送限流保护。
   */
  forgotPassword(input: { email: string }): Promise<AuthMessageResult>
  /**
   * 用邮箱验证码完成密码重置(验证码经 forgotPassword 发送)。
   * 重置成功后既有 refresh token **不会**自动失效(其他设备需手动登出)。
   */
  resetPassword(input: ResetPasswordInput): Promise<AuthMessageResult>
  /**
   * Firebase ID Token 登录(Google / Apple,海外版专用 v0.6.0+)。
   * 自动创建或关联本地账号;refresh token 经 Set-Cookie 下发,本方法只返回 data。
   */
  loginWithFirebase(input: { idToken: string }): Promise<AuthResult>
  /**
   * 微信授权 code 登录(国内版专用 v0.6.0+)。
   * 后端向微信 API 换取 openid 并关联本地账号;refresh token 经 Set-Cookie 下发。
   */
  loginWithWechat(input: { code: string }): Promise<AuthResult>
  /** 手机短信认证(国内版专用 v0.6.0+)。 */
  readonly sms: {
    /** 发送短信验证码(6 位,5 分钟有效);受发送限流保护。 */
    sendCode(input: { phone: string }): Promise<AuthMessageResult>
    /**
     * 短信验证码登录(新手机号自动创建账号)。
     * refresh token 经 Set-Cookie 下发,本方法只返回 data。
     */
    login(input: { phone: string; code: string }): Promise<AuthResult>
  }
  /**
   * 签发一次性导出令牌(OTT,5 分钟过期、单次使用),供 Moraya 一键导入。
   * 需已登录会话,且 keyId + apiKey 明文须属于当前用户。
   */
  createExportToken(input: CreateExportTokenInput): Promise<ExportTokenGrant>
  /**
   * 消费 OTT 换取完整导入载荷(apiUrl / **明文 apiKey** / imgDomain / user)。
   * 公开端点(OTT 自证身份),IP 限流 20/min;OTT 单次使用,换取后立即作废。
   * 载荷含 API Key 明文,请勿落日志。
   */
  exchangeExportToken(input: { ott: string }): Promise<ExportTokenPayload>
}

export function createAuthNamespace(http: HttpCore): AuthNamespace {
  return {
    me: () => http.request<User>({ method: 'GET', path: '/v1/user/me' }),
    subscription: () => http.request<Subscription>({ method: 'GET', path: '/v1/me/subscription' }),
    sendCode: (input) =>
      http.request<AuthMessageResult>({
        method: 'POST',
        path: '/v1/auth/send-code',
        body: { email: input.email, type: input.type },
      }),
    register: (input) =>
      http.request<AuthResult>({
        method: 'POST',
        path: '/v1/auth/register',
        body: { email: input.email, password: input.password, code: input.code },
      }),
    login: (input) =>
      http.request<AuthResult>({
        method: 'POST',
        path: '/v1/auth/login',
        body: { email: input.email, password: input.password },
      }),
    loginWithCode: (input) =>
      http.request<AuthResult>({
        method: 'POST',
        path: '/v1/auth/login/code',
        body: { email: input.email, code: input.code },
      }),
    refresh: (opts) =>
      http.request<RefreshSessionResult>({
        method: 'POST',
        path: '/v1/auth/refresh',
        // 服务端只从 httpOnly Cookie 读 refresh token(不收 body)
        headers: { Cookie: `refresh_token=${opts.refreshToken}` },
      }),
    logout: async (opts) => {
      await http.request<void>({
        method: 'POST',
        path: '/v1/auth/logout',
        headers: { Cookie: `refresh_token=${opts.refreshToken}` },
        response: 'none',
      })
    },
    verify: () => http.request<AuthVerifyResult>({ method: 'GET', path: '/v1/auth/verify' }),
    forgotPassword: (input) =>
      http.request<AuthMessageResult>({
        method: 'POST',
        path: '/v1/auth/forgot-password',
        body: { email: input.email },
      }),
    resetPassword: (input) =>
      http.request<AuthMessageResult>({
        method: 'POST',
        path: '/v1/auth/reset-password',
        body: { email: input.email, code: input.code, newPassword: input.newPassword },
      }),
    loginWithFirebase: (input) =>
      http.request<AuthResult>({
        method: 'POST',
        path: '/v1/auth/firebase',
        body: { idToken: input.idToken },
      }),
    loginWithWechat: (input) =>
      http.request<AuthResult>({
        method: 'POST',
        path: '/v1/auth/wechat',
        body: { code: input.code },
      }),
    sms: {
      sendCode: (input) =>
        http.request<AuthMessageResult>({
          method: 'POST',
          path: '/v1/auth/sms/send-code',
          body: { phone: input.phone },
        }),
      login: (input) =>
        http.request<AuthResult>({
          method: 'POST',
          path: '/v1/auth/sms/login',
          body: { phone: input.phone, code: input.code },
        }),
    },
    createExportToken: (input) =>
      http.request<ExportTokenGrant>({
        method: 'POST',
        path: '/v1/auth/create-export-token',
        body: { keyId: input.keyId, apiKey: input.apiKey },
      }),
    exchangeExportToken: (input) =>
      http.request<ExportTokenPayload>({
        method: 'POST',
        path: '/v1/auth/exchange-export-token',
        body: { ott: input.ott },
      }),
  }
}

/**
 * 本模块覆盖的 spec operation。
 * GET /v1/user/me 的规范登记已迁至 user.get(resources/user.ts);
 * auth.me 保留为别名方法,不在此重复登记(门禁断言⑤)。
 */
export const AUTH_COVERAGE = [
  { method: 'GET', path: '/v1/me/subscription', client: 'auth.subscription' },
  { method: 'POST', path: '/v1/auth/send-code', client: 'auth.sendCode' },
  { method: 'POST', path: '/v1/auth/register', client: 'auth.register' },
  { method: 'POST', path: '/v1/auth/login', client: 'auth.login' },
  { method: 'POST', path: '/v1/auth/login/code', client: 'auth.loginWithCode' },
  { method: 'POST', path: '/v1/auth/refresh', client: 'auth.refresh' },
  { method: 'POST', path: '/v1/auth/logout', client: 'auth.logout' },
  { method: 'GET', path: '/v1/auth/verify', client: 'auth.verify' },
  { method: 'POST', path: '/v1/auth/forgot-password', client: 'auth.forgotPassword' },
  { method: 'POST', path: '/v1/auth/reset-password', client: 'auth.resetPassword' },
  { method: 'POST', path: '/v1/auth/firebase', client: 'auth.loginWithFirebase' },
  { method: 'POST', path: '/v1/auth/wechat', client: 'auth.loginWithWechat' },
  { method: 'POST', path: '/v1/auth/sms/send-code', client: 'auth.sms.sendCode' },
  { method: 'POST', path: '/v1/auth/sms/login', client: 'auth.sms.login' },
  { method: 'POST', path: '/v1/auth/create-export-token', client: 'auth.createExportToken' },
  { method: 'POST', path: '/v1/auth/exchange-export-token', client: 'auth.exchangeExportToken' },
] as const satisfies readonly CoveredOperation[]
