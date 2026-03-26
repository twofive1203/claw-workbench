import { useCallback } from 'react'
import { normalizeRootConfig, type OpenClawConfig } from '../types/config'
import { toText } from '../lib/parsers'

/**
 * 通用 RPC 调用签名。
 * @param method RPC 方法名。
 * @param params RPC 参数对象。
 */
export type RpcCaller = <T>(method: string, params: Record<string, unknown>) => Promise<T>

/**
 * useConfigRpc 入参。
 * @param callRpc 通用 RPC 调用器。
 * @param isConnected WebSocket 连接状态。
 */
interface UseConfigRpcOptions {
  callRpc: RpcCaller
  isConnected: boolean
}

/**
 * config.get 响应结构。
 * @param raw 配置原文（JSON5 字符串）。
 * @param hash 并发保护 hash。
 */
interface ConfigGetPayload {
  raw?: unknown
  hash?: unknown
  config?: unknown
  parsed?: unknown
  [key: string]: unknown
}

/**
 * config.patch/config.apply 响应结构。
 * @param hash 写入成功后的新 hash（可选）。
 */
interface ConfigWritePayload {
  hash?: unknown
  [key: string]: unknown
}

/**
 * 配置读取结果。
 * @param config 解析后的配置对象。
 * @param raw 配置原始文本。
 * @param hash 当前配置 hash。
 */
export interface ConfigFetchResult {
  config: OpenClawConfig
  raw: string
  hash: string
}

/**
 * 配置写入结果。
 * @param hash 写入后的新 hash（服务端可能不返回）。
 */
export interface ConfigWriteResult {
  hash: string | null
}

/**
 * 配置 RPC 封装返回结构。
 * @param isRpcAvailable 当前是否可走 RPC。
 * @param fetchConfig 读取配置。
 * @param patchConfig 局部更新配置。
 * @param applyConfig 全量替换配置。
 */
export interface ConfigRpcResult {
  isRpcAvailable: boolean
  fetchConfig: () => Promise<ConfigFetchResult | null>
  patchConfig: (raw: string, baseHash: string) => Promise<ConfigWriteResult>
  applyConfig: (raw: string, baseHash: string) => Promise<ConfigWriteResult>
}

/**
 * RPC 不可用错误对象。
 * @param code 错误码。
 */
interface RpcUnavailableError extends Error {
  code?: string
}

/**
 * 将任意值序列化为 JSON 文本。
 * @param value 任意值。
 */
function toJsonText(value: unknown): string {
  try {
    const text = JSON.stringify(value, null, 2)
    return typeof text === 'string' ? text : ''
  } catch {
    return ''
  }
}

/**
 * 构建 RPC 不可用错误。
 */
function buildUnavailableError(): RpcUnavailableError {
  const error = new Error('WebSocket 未连接，RPC 暂不可用') as RpcUnavailableError
  error.code = 'UNAVAILABLE'
  return error
}

/**
 * 解析 config.get 返回的 raw 文本。
 * @param raw 配置原始文本。
 */
function parseRawConfig(raw: string): OpenClawConfig {
  const parsed = raw.trim() ? JSON.parse(raw) : {}
  return normalizeRootConfig(parsed)
}

/**
 * 从 config.get 响应中提取配置对象。
 * @param payload config.get 响应。
 * @param raw 原始配置文本。
 */
function resolveConfigFromPayload(payload: ConfigGetPayload, raw: string): OpenClawConfig {
  // 新版 Gateway 会直接返回结构化 config，优先使用。
  if (payload.config !== undefined) {
    return normalizeRootConfig(payload.config)
  }

  // 部分返回可能仅带 parsed 字段，作为兜底。
  if (payload.parsed !== undefined) {
    return normalizeRootConfig(payload.parsed)
  }

  try {
    return parseRawConfig(raw)
  } catch {
    throw new Error('config.get 返回 raw 非 JSON，且缺少 config/parsed 字段')
  }
}

/**
 * 从 config.get 响应中提取原始文本。
 * @param payload config.get 响应。
 */
function resolveRawTextFromPayload(payload: ConfigGetPayload): string {
  if (typeof payload.raw === 'string') {
    return payload.raw
  }

  if (payload.config !== undefined) {
    return toJsonText(payload.config)
  }

  if (payload.parsed !== undefined) {
    return toJsonText(payload.parsed)
  }

  return ''
}

/**
 * 配置 RPC Hook。
 * @param options Hook 入参。
 */
export function useConfigRpc(options: UseConfigRpcOptions): ConfigRpcResult {
  const { callRpc, isConnected } = options
  const isRpcAvailable = isConnected

  /**
   * 通过 RPC 读取配置。
   */
  const fetchConfig = useCallback(async (): Promise<ConfigFetchResult | null> => {
    if (!isRpcAvailable) return null

    const payload = await callRpc<ConfigGetPayload>('config.get', {})
    const raw = resolveRawTextFromPayload(payload)
    const hash = toText(payload.hash)
    if (!hash) {
      throw new Error('config.get 返回缺少 hash')
    }

    return {
      config: resolveConfigFromPayload(payload, raw),
      raw,
      hash,
    }
  }, [callRpc, isRpcAvailable])

  /**
   * 通过 RPC 执行 config.patch。
   * @param raw JSON5 字符串。
   * @param baseHash 写入基线 hash。
   */
  const patchConfig = useCallback(async (
    raw: string,
    baseHash: string,
  ): Promise<ConfigWriteResult> => {
    if (!isRpcAvailable) {
      throw buildUnavailableError()
    }

    const payload = await callRpc<ConfigWritePayload>('config.patch', {
      raw,
      baseHash,
    })
    return {
      hash: toText(payload.hash),
    }
  }, [callRpc, isRpcAvailable])

  /**
   * 通过 RPC 执行 config.apply。
   * @param raw JSON5 字符串。
   * @param baseHash 写入基线 hash。
   */
  const applyConfig = useCallback(async (
    raw: string,
    baseHash: string,
  ): Promise<ConfigWriteResult> => {
    if (!isRpcAvailable) {
      throw buildUnavailableError()
    }

    const payload = await callRpc<ConfigWritePayload>('config.apply', {
      raw,
      baseHash,
    })
    return {
      hash: toText(payload.hash),
    }
  }, [callRpc, isRpcAvailable])

  return {
    isRpcAvailable,
    fetchConfig,
    patchConfig,
    applyConfig,
  }
}
