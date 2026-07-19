/**
 * insights 命名空间(v0.3.0 平台域批次,v0.53 访问统计)—— 按天聚合查询 +
 * 手工触发日聚合。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  InsightsDaily,
  InsightsDailyParams,
  RollupDayInput,
  RollupDayResult,
} from '../types/index.js'

export interface InsightsNamespace {
  /**
   * 按天聚合访问统计(浏览量 / Referer / 国家 / 设备 / 来源页;pro+ / org 可见)。
   * 最大窗口 90 天,超出按 7 天聚合。
   */
  daily(params: InsightsDailyParams): Promise<InsightsDaily>
  /**
   * 手工触发某日聚合(admin/dev;平时 cron 每天 02:00 UTC 自动执行)。
   * 用于补救对账或开发调试;force=true 时已聚合过的日期覆盖重算。
   */
  rollupDay(input: RollupDayInput): Promise<RollupDayResult>
}

export function createInsightsNamespace(http: HttpCore): InsightsNamespace {
  return {
    daily: (params) => {
      const query: Record<string, string | number | boolean | undefined> = {
        from: params.from,
        to: params.to,
      }
      if (params.scope !== undefined) query['scope'] = params.scope
      return http.request<InsightsDaily>({ method: 'GET', path: '/v1/insights/daily', query })
    },
    rollupDay: (input) =>
      http.request<RollupDayResult>({
        method: 'POST',
        path: '/v1/insights/rollup/day',
        body: {
          date: input.date,
          ...(input.force !== undefined ? { force: input.force } : {}),
        },
      }),
  }
}

export const INSIGHTS_COVERAGE = [
  { method: 'GET', path: '/v1/insights/daily', client: 'insights.daily' },
  { method: 'POST', path: '/v1/insights/rollup/day', client: 'insights.rollupDay' },
] as const satisfies readonly CoveredOperation[]
