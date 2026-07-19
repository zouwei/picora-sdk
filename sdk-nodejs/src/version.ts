/**
 * SDK 版本号单一来源。
 *
 * 历史教训:v0.2.x 时 client.ts 内的 SDK_VERSION 常量('0.2.0')与 package.json
 * 版本('0.2.2')漂移,导致 User-Agent 上报错误版本。v0.3.0 起本文件为唯一定义点,
 * 并由 __tests__/version.test.ts 与 package.json 对账钉住。
 *
 * 发版流程:改 package.json version → 同步改此常量 → git tag v{version}。
 */
export const SDK_VERSION = '0.4.0'
