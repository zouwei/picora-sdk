/**
 * API Key 域类型(v0.3.0 账户域批次)。
 *
 * 安全语义:服务端仅存 Key 哈希,明文只在创建响应中出现一次;
 * 列表响应一律不含明文(仅 keyPrefix 前 12 字符展示用)。
 */

import type { KeyScopeV2 } from './common.js'

/** GET /v1/api-keys 列表项(不含明文) */
export interface ApiKey {
  /** API Key 记录 ID,nanoid 21 字符(用于删除 / 查询工具配置) */
  id: string
  /** 用户为此 Key 设置的名称,方便区分不同工具 */
  name: string
  /** Key 前 12 字符(展示用,形如 sk_live_xxxx) */
  keyPrefix: string
  /** v1 单值权限:read | read_write | read_write_delete(旧 UI 消费) */
  scope: 'read' | 'read_write' | 'read_write_delete'
  /** v2 细粒度权限集合(dot-notation,见 KeyScopeV2);scopeVersion=1 时为空数组 */
  scopesV2: KeyScopeV2[]
  /** 权限模型版本:1 = 仅 v1 scope;2 = 细粒度 scopesV2 生效 */
  scopeVersion: 1 | 2
  /** 最后一次使用时间(ISO 8601);null 表示从未使用 */
  lastUsedAt?: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/** POST /v1/api-keys 入参 */
export interface CreateApiKeyInput {
  /** Key 名称(1~50 字符),方便区分不同工具或设备 */
  name: string
}

/** PATCH /v1/api-keys/{id} 入参(至少提供一个字段) */
export interface UpdateApiKeyInput {
  /** 新名称(≤64 字符) */
  name?: string
  /** 新描述(≤200 字符);传空串清空描述 */
  description?: string
  /** 新的 v2 细粒度权限集合(至少 1 个),覆盖式替换 */
  scopes?: KeyScopeV2[]
}

/**
 * PATCH /v1/api-keys/{id} 响应数据(更新后的 Key 元数据)。
 * 与列表项 ApiKey 的区别:含 description、不含 keyPrefix。
 */
export interface UpdatedApiKey {
  /** API Key 记录 ID,nanoid 21 字符 */
  id: string
  /** Key 名称 */
  name: string
  /** Key 描述;null 表示无描述 */
  description: string | null
  /** v1 单值权限:read | read_write | read_write_delete */
  scope: 'read' | 'read_write' | 'read_write_delete'
  /** v2 细粒度权限集合 */
  scopesV2: KeyScopeV2[]
  /** 权限模型版本:1 = 仅 v1 scope;2 = 细粒度 scopesV2 生效 */
  scopeVersion: 1 | 2
  /** 最后一次使用时间(ISO 8601);null 表示从未使用 */
  lastUsedAt: string | null
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/**
 * POST /v1/api-keys 响应数据。
 *
 * **`key` 字段为明文,仅此一次返回**,服务端只存哈希 —— 请立即持久化保存。
 */
export interface CreatedApiKey {
  /** API Key 记录 ID,nanoid 21 字符 */
  id: string
  name: string
  /** API Key 明文,格式 sk_live_ + nanoid(32),共 40 字符;之后无法再次获取 */
  key: string
  /** 创建时间(ISO 8601) */
  createdAt: string
}

/**
 * GET /v1/api-keys/{id}/tool-configs 响应数据(工具配置模板,v0.4.0+)。
 * 各字段为对应工具的预填充配置 JSON,用户填入完整 Key 即可使用。
 */
export interface ApiKeyToolConfigs {
  /** PicGo 配置 JSON */
  picgo?: Record<string, unknown>
  /** Moraya 配置 JSON */
  moraya?: Record<string, unknown>
  /** Typora 上传配置 */
  typora?: Record<string, unknown>
}
