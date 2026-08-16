/**
 * devices 命名空间 —— 自部署客户端设备激活注册表（v0.86.0）。
 *
 * 典型用法（自部署服务侧，如飞雁）：进程启动与之后每 12 小时调一次 `heartbeat`，
 * 按返回的 `active` / `evicted` 决定继续服务还是停机；用户重新登录后的第一次心跳
 * 带 `reclaim: true` 把授权夺回来。
 */

import type { HttpCore } from '../core/http.js'
import type { CoveredOperation } from '../coverage/types.js'
import type {
  DeviceHeartbeatInput,
  DeviceHeartbeatResult,
  DeviceListResult,
} from '../types/index.js'

export interface DevicesNamespace {
  /**
   * 激活心跳：**注册与复验合一**——首次见到的 `deviceId` 即注册，之后每次调用是复验。
   * 建议每 12 小时一次（服务端限流 10 次/分钟）。
   *
   * 返回的两个信号必须分开处理：
   * - `active:false` → 套餐失效且体验期已过，应停机并引导续费
   * - `evicted:true` → 套餐仍有效，但这台被其他设备顶替，应停机并提示「重新登录以夺回」
   *
   * 副作用：可用时会登记/刷新本设备；若登记后超出额度，按激活时间保留最新的若干台，
   * 其余被标记淘汰（各自下次心跳时得知）。已过期用户同样可调用（不会 403）。
   */
  heartbeat(input: DeviceHeartbeatInput): Promise<DeviceHeartbeatResult>
  /**
   * 列出当前账号已登记的设备，按激活时间倒序。
   * @param opts `includeEvicted: true` 时一并返回已淘汰设备（供用户查看何时被顶掉）
   */
  list(opts?: { includeEvicted?: boolean }): Promise<DeviceListResult>
  /**
   * 主动踢出一台设备（设备数满时的自助出路）。幂等：重复踢已淘汰设备同样成功。
   *
   * 注意**不会吊销该设备的 token**——被踢实例最迟在下次心跳（12 小时）得知并停机。
   */
  revoke(deviceId: string): Promise<void>
}

export function createDevicesNamespace(http: HttpCore): DevicesNamespace {
  return {
    heartbeat: (input) =>
      http.request<DeviceHeartbeatResult>({
        method: 'POST',
        path: '/v1/me/devices/heartbeat',
        body: input,
      }),
    list: (opts) => {
      const query: Record<string, string | number | boolean | undefined> = {}
      // 服务端按字符串 'true' 判定，显式传字符串避免布尔序列化差异
      if (opts?.includeEvicted) query['includeEvicted'] = 'true'
      return http.request<DeviceListResult>({ method: 'GET', path: '/v1/me/devices', query })
    },
    revoke: async (deviceId) => {
      await http.request<void>({
        method: 'DELETE',
        path: `/v1/me/devices/${encodeURIComponent(deviceId)}`,
        response: 'none',
      })
    },
  }
}

export const DEVICES_COVERAGE = [
  { method: 'POST', path: '/v1/me/devices/heartbeat', client: 'devices.heartbeat' },
  { method: 'GET', path: '/v1/me/devices', client: 'devices.list' },
  { method: 'DELETE', path: '/v1/me/devices/{deviceId}', client: 'devices.revoke' },
] as const satisfies readonly CoveredOperation[]
