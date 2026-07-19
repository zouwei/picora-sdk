/**
 * OpenAPI 覆盖率注册表类型(v0.3.0)。
 *
 * 每个 resource 模块在文件尾部导出 `XXX_COVERAGE` 常量,声明自己覆盖的
 * spec operation;coverage/manifest.ts 聚合全部声明,__tests__/openapi-coverage.test.ts
 * 与 spec/openapi-public.json 双向对账(spec 有而 SDK 无 → 红;SDK 有而 spec 无 → 红)。
 *
 * 声明与实现同文件是有意设计:code review 时「加方法必带声明」一目了然。
 */

export type CoveredMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export interface CoveredOperation {
  method: CoveredMethod
  /**
   * OpenAPI 风格路径模板,与 spec 中的 key 完全一致
   * (如 '/v1/collections/{collectionId}/episodes/{id}';参数名不同不影响比对,
   * 门禁测试会把 {xxx} 归一为 {} 后比较)。
   */
  path: string
  /**
   * 对应的 client 调用面(如 'episodes.update' / 'oauth.exchangeAuthorizationCode'),
   * 用于门禁报错提示与文档生成。同一 operation 有多个别名方法时只登记规范入口。
   */
  client: string
}
