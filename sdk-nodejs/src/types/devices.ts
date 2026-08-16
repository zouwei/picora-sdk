/**
 * 设备激活注册表类型（v0.86.0）。
 *
 * 面向**自部署客户端**（飞雁等）：装在用户自己服务器上、用 Picora 账号登录授权的服务。
 * 一个账号能驱动多少个实例由 Picora 侧计数——放在客户端本地做不到（每个实例各有
 * 独立数据库，装两份就是两个库各数一台，限额直接归零）。
 */

/** 支持接入设备注册的产品标识（闭合枚举，服务端同步放开才会增加） */
export type DeviceProduct = 'feiyan'

/**
 * 淘汰原因：
 * - `quota_exceeded` 超出套餐设备数，被更新的设备顶替
 * - `user_revoked`   用户在设备列表里主动踢出
 * - `admin_revoked`  管理员操作
 */
export type DeviceEvictReason = 'quota_exceeded' | 'user_revoked' | 'admin_revoked'

/** POST /v1/me/devices/heartbeat 入参 */
export interface DeviceHeartbeatInput {
  /** 客户端生成的稳定标识（UUID），跨重启不变；同一台机器在同一 product 下只占一个名额 */
  deviceId: string
  product: DeviceProduct
  /** 客户端版本，便于排障与统计 */
  version?: string
  /** 可读名（如 `huzou@192.168.3.63`），供用户在设备列表里认出是哪台机器 */
  label?: string
  /**
   * 「夺回授权」信号：应在**用户重新登录后的第一次心跳**带上。
   * 清除本机淘汰标记并把激活时间刷成当前，代价是顶掉当前最旧的一台。
   * 缺少它，被顶掉的机器将永远拿不回授权。
   */
  reclaim?: boolean
}

/** 心跳判决 */
export interface DeviceHeartbeatResult {
  /**
   * 是否可用 —— **并集**：`套餐有效 || 仍在首月体验期内`，谁宽松听谁的。
   * `false` → 客户端应停机。
   *
   * 它不等于「套餐有效」：体验期内套餐过期仍为 `true`。要区分「靠体验期撑着」，
   * 比对 `plan` 与 `graceEndsAt`。
   */
  active: boolean
  /** 解析过期后的有效套餐 */
  plan: string
  /** 套餐到期时间（ISO 8601）；null 表示不过期或无套餐 */
  planExpiresAt: string | null
  /**
   * 这台是否已被淘汰。`true` → 应停机并提示「授权已被其他设备顶替」。
   *
   * 与 `active` **刻意分开**：被淘汰时套餐仍然有效，只是这台不是被选中的那台；
   * 合成一个信号会让用户误以为套餐失效而去续费，钱花了问题还在。
   */
  evicted: boolean
  evictedReason: DeviceEvictReason | null
  /** 当前允许的同时激活数（套餐与体验期取较宽者）；-1 表示不限 */
  maxDevices: number
  /** 该产品下当前有效设备数（含本次） */
  activeDevices: number
  /**
   * 首月体验期起点 = 该账号该产品最早的激活时间（**含已淘汰设备**）；
   * 从未激活过则为本次。含已淘汰设备意味着踢光设备也不会重置体验期。
   */
  graceStartedAt: string
  /** 体验期结束时间（= 起点 + 30 天），由服务端算好下发，避免各端算出偏差 */
  graceEndsAt: string
}

/** GET /v1/me/devices 列表项 */
export interface Device {
  deviceId: string
  product: DeviceProduct
  /** 客户端自报可读名；未上报为 null */
  label: string | null
  /** 客户端版本；未上报为 null */
  version: string | null
  /** 本次激活时间（ISO 8601）；「夺回授权」会刷新它 */
  activatedAt: string
  /** 最近一次心跳（ISO 8601） */
  lastSeenAt: string
  /** 被淘汰时间（ISO 8601）；null = 当前有效 */
  evictedAt: string | null
  evictedReason: DeviceEvictReason | null
}

/** GET /v1/me/devices 响应 */
export interface DeviceListResult {
  /** 当前允许的同时激活数；-1 表示不限 */
  maxDevices: number
  /** 设备列表，按激活时间倒序 */
  devices: Device[]
}
