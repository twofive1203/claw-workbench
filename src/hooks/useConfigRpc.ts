import JSON5 from 'json5'
import { useCallback } from 'react'
import type { ConfigValidationIssue } from '../lib/configSchema'
import { isRecord, toText } from '../lib/parsers'
import { normalizeRootConfig, type OpenClawConfig } from '../types/config'

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
 * @param valid 服务端校验结果。
 * @param issues 服务端校验问题。
 * @param warnings 服务端告警。
 * @param legacyIssues 服务端遗留问题。
 */
interface ConfigGetPayload {
  path?: unknown
  raw?: unknown
  hash?: unknown
  valid?: unknown
  issues?: unknown
  warnings?: unknown
  legacyIssues?: unknown
  config?: unknown
  parsed?: unknown
  resolved?: unknown
  [key: string]: unknown
}

/**
 * config.schema 响应结构。
 * @param schema 最新配置 JSON Schema。
 * @param uiHints 配置 UI 提示。
 * @param version Schema 版本。
 * @param generatedAt Schema 生成时间。
 */
interface ConfigSchemaPayload {
  schema?: unknown
  uiHints?: unknown
  version?: unknown
  generatedAt?: unknown
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
 * @param path 配置文件路径。
 * @param valid 服务端校验结果。
 * @param issues 服务端校验问题。
 * @param warnings 服务端告警。
 * @param legacyIssues 服务端遗留问题。
 */
export interface ConfigFetchResult {
  config: OpenClawConfig
  raw: string
  hash: string
  path: string | null
  valid: boolean | null
  issues: ConfigValidationIssue[]
  warnings: ConfigValidationIssue[]
  legacyIssues: ConfigValidationIssue[]
}

/**
 * 配置 Schema 读取结果。
 * @param schema 最新配置 JSON Schema。
 * @param uiHints Schema 对应 UI 提示。
 * @param version Schema 版本。
 * @param generatedAt Schema 生成时间。
 */
export interface ConfigSchemaFetchResult {
  schema: Record<string, unknown>
  uiHints: Record<string, unknown>
  version: string | null
  generatedAt: string | null
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
 * @param fetchConfigSchema 读取远端配置 Schema。
 * @param patchConfig 局部更新配置。
 * @param applyConfig 全量替换配置。
 */
export interface ConfigRpcResult {
  isRpcAvailable: boolean
  fetchConfig: () => Promise<ConfigFetchResult | null>
  fetchConfigSchema: () => Promise<ConfigSchemaFetchResult | null>
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
 * 将服务端问题数组转换为统一校验问题结构。
 * @param value 服务端返回的问题数组。
 */
function normalizeConfigIssues(value: unknown): ConfigValidationIssue[] {
  if (!Array.isArray(value)) return []

  return value.flatMap(item => {
    if (!isRecord(item)) return []

    const message = toText(item.message)
    if (!message) return []

    return [{
      path: toText(item.path) ?? '(root)',
      message,
    }]
  })
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
 * 解析配置原始文本。
 * @param raw 配置原始文本。
 */
export function parseConfigText(raw: string): OpenClawConfig {
  const parsed = raw.trim() ? JSON5.parse(raw) : {}
  return normalizeRootConfig(parsed)
}

/**
 * 从 config.get 响应中提取结构化配置对象。
 * @param payload config.get 响应。
 */
function resolveStructuredConfigFromPayload(payload: ConfigGetPayload): OpenClawConfig | null {
  if (payload.config !== undefined) {
    return normalizeRootConfig(payload.config)
  }

  if (payload.parsed !== undefined) {
    return normalizeRootConfig(payload.parsed)
  }

  if (payload.resolved !== undefined) {
    return normalizeRootConfig(payload.resolved)
  }

  return null
}

/**
 * 从 config.get 响应中提取配置对象。
 * @param payload config.get 响应。
 * @param raw 原始配置文本。
 */
export function resolveConfigFromPayload(payload: ConfigGetPayload, raw: string): OpenClawConfig {
  const structuredConfig = resolveStructuredConfigFromPayload(payload)
  if (structuredConfig) {
    return structuredConfig
  }

  try {
    return parseConfigText(raw)
  } catch {
    throw new Error('config.get 返回 raw 非 JSON5，且缺少 config/parsed/resolved 字段')
  }
}

/**
 * 从 config.get 响应中提取原始文本。
 * @param payload config.get 响应。
 */
export function resolveRawTextFromPayload(payload: ConfigGetPayload): string {
  if (typeof payload.raw === 'string') {
    return payload.raw
  }

  if (payload.config !== undefined) {
    return toJsonText(payload.config)
  }

  if (payload.parsed !== undefined) {
    return toJsonText(payload.parsed)
  }

  if (payload.resolved !== undefined) {
    return toJsonText(payload.resolved)
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
      path: toText(payload.path),
      valid: typeof payload.valid === 'boolean' ? payload.valid : null,
      issues: normalizeConfigIssues(payload.issues),
      warnings: normalizeConfigIssues(payload.warnings),
      legacyIssues: normalizeConfigIssues(payload.legacyIssues),
    }
  }, [callRpc, isRpcAvailable])

  /**
   * 通过 RPC 读取最新配置 Schema。
   */
  const fetchConfigSchema = useCallback(async (): Promise<ConfigSchemaFetchResult | null> => {
    if (!isRpcAvailable) return null

    const payload = await callRpc<ConfigSchemaPayload>('config.schema', {})
    if (!isRecord(payload.schema)) {
      throw new Error('config.schema 返回缺少 schema')
    }

    return {
      schema: payload.schema,
      uiHints: isRecord(payload.uiHints) ? payload.uiHints : {},
      version: toText(payload.version),
      generatedAt: toText(payload.generatedAt),
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
    fetchConfigSchema,
    patchConfig,
    applyConfig,
  }
}
