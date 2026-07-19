/**
 * OpenAPI 覆盖率**永久排除**清单(v0.3.0)。
 *
 * 语义与 known-gap.ts 严格区分:
 *   - EXCLUDED  = 永久不进 SDK 的 operation,**每条必须写排除理由**;
 *                 条目必须仍存在于 spec 且未被覆盖(门禁断言④防腐化)
 *   - KNOWN_GAP = 临时欠账,目标清零,不写理由
 *
 * 纪律:「实现难」不是排除理由 —— 难做的留在 KNOWN_GAP 排后批。
 * 合法的排除理由示例:纯浏览器交互端点(SDK 无 UI)、与 Node SDK 形态天然不符的端点。
 *
 * 当前为空:229 个公开 operation 全部可由 Node SDK 以合适形态覆盖
 * (浏览器跳转端点 /oauth/authorize 以 URL 构造器覆盖;HTML/二进制端点以 text/raw 模式覆盖)。
 */

export interface ExcludedOperation {
  /** 'METHOD /path'(spec 原始路径模板) */
  op: string
  /** 排除理由(必填,一句话说明为何永久不进 SDK) */
  reason: string
}

export const EXCLUDED_OPERATIONS: readonly ExcludedOperation[] = []
