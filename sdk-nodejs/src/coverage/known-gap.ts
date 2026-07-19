/**
 * OpenAPI 覆盖率 ratchet 台账 —— **已清零**。
 *
 * v0.82.0 迭代全量补齐完成,台账清零(2026-07-19)。
 * bootstrap 基线 229 个公开 operation,分 5 批补齐:
 *   第 1 批 媒体域(36 op)→ 第 2 批 docs/KB 域(26 op)→ 第 3 批 AIGC 域(39 op)
 *   → 第 4 批 账户/平台域(36 op)→ 第 5 批 平台域(57 op:billing / campaigns /
 *   notifications / tickets / orgs / insights / migration / backup / publish /
 *   published-pages / mcp),欠账归零。
 *
 * ratchet 规则(门禁断言③强制,永久生效):
 *   - **只减不增**:后续新增公开端点必须直接实现并登记 *_COVERAGE,
 *     **禁止复活台账**(新增条目即门禁红);
 *   - 若确属 SDK 不适用的端点,走 excluded.ts(带理由)而非本台账;
 *   - 条目格式(历史约定,备用):'METHOD /spec/原始/路径/{参数名}'
 *     (与 spec key 一致;比对时 {xxx} 归一为 {})。
 */

export const KNOWN_GAP: readonly string[] = []
