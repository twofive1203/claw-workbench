/**
 * OpenClaw 网关协议与基础解析工具。
 * @author towfive
 */

import { isRecord, toText } from '../../lib/parsers'
import { detectPlatform } from './deviceIdentity'

/**
 * 网关请求帧。
 * @param id 请求 id。
 * @param method RPC 方法名。
 * @param params RPC 参数。
 */
export interface GatewayReqFrame {
  type: 'req'
  id: string
  method: string
  params: Record<string, unknown>
}

/**
 * 网关错误结构。
 * @param code 错误码。
 * @param message 错误信息。
 */
export interface GatewayError {
  code?: string
  message?: string
  retryAfterMs?: number
  [key: string]: unknown
}

/**
 * 网关响应帧。
 * @param id 对应请求 id。
 * @param ok 是否成功。
 * @param payload 成功时返回数据。
 * @param error 失败时错误结构。
 */
export interface GatewayResFrame {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: GatewayError
}

/**
 * 网关事件帧。
 * @param event 事件名。
 * @param payload 事件载荷。
 */
export interface GatewayEventFrame {
  type: 'event'
  event: string
  payload?: unknown
}

/** 网关帧联合类型。 */
export type GatewayFrame = GatewayReqFrame | GatewayResFrame | GatewayEventFrame

/** 默认 WebSocket 地址。 */
export const DEFAULT_WS_URL = 'ws://localhost:18789'

const PROTOCOL_VERSION = 3
const DEFAULT_FALLBACK_AGENT_ID = 'main'
export const DEFAULT_MAIN_KEY = 'main'
export const CLIENT_ID = 'openclaw-control-ui'
export const CLIENT_MODE = 'ui'
const CLIENT_VERSION = __APP_VERSION__
export const CLIENT_ROLE = 'operator'
export const CLIENT_SCOPES = ['operator.read', 'operator.write', 'operator.admin'] as const
const CLIENT_CAPS = ['tool-events'] as const

/**
 * 生成随机请求 id。
 */
export function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 从候选值中读取首个非空文本。
 * @param values 候选值列表。
 */
function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    const next = toText(value)
    if (next) return next
  }
  return undefined
}

/**
 * 聊天消息说话人元信息。
 * @param speakerName 说话人名称。
 * @param speakerAgentId 说话人 agent id。
 */
export interface MessageSpeakerMeta {
  speakerName?: string
  speakerAgentId?: string
}

/**
 * 从消息对象提取说话人信息（网关字段兼容兜底）。
 * @param value 原始消息对象。
 */
export function extractMessageSpeakerMeta(value: unknown): MessageSpeakerMeta {
  if (!isRecord(value)) return {}

  const author = isRecord(value.author) ? value.author : null
  const identity = isRecord(value.identity) ? value.identity : null

  return {
    speakerName: firstText(
      value.speakerName,
      value.speaker,
      value.name,
      value.agentName,
      value.displayName,
      value.label,
      author?.name,
      author?.displayName,
      author?.label,
      identity?.name,
    ),
    speakerAgentId: firstText(
      value.speakerAgentId,
      value.agentId,
      value.agent_id,
      author?.agentId,
      author?.agent_id,
    ),
  }
}

/**
 * 从 unknown 读取数字。
 * @param value 原始值。
 */
export function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 将 unknown 数组转换为字符串数组。
 * @param value 原始值。
 */
export function toTextArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const next = value
    .map(item => toText(item))
    .filter((item): item is string => Boolean(item))
  return next.length > 0 ? next : undefined
}

/**
 * 将 unknown 数组转换为日志行数组。
 * @param value 原始值。
 */
export function toLogLines(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const next: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      next.push(item)
      continue
    }
    if (typeof item === 'number' || typeof item === 'boolean') {
      next.push(String(item))
      continue
    }
    if (item === null || item === undefined) {
      next.push('')
      continue
    }
    if (typeof item === 'object') {
      next.push(JSON.stringify(item))
      continue
    }
    next.push(String(item))
  }

  return next
}

/**
 * 判断是否是会话 key。
 * @param key 会话 key。
 */
export function isAgentSessionKey(key: string): boolean {
  return key.startsWith('agent:')
}

/**
 * 从 sessionKey 解析 agentId。
 * @param sessionKey 会话 key。
 */
export function parseAgentIdFromSessionKey(sessionKey: string): string | null {
  const match = sessionKey.match(/^agent:([^:]+):/)
  return match?.[1] ?? null
}

/**
 * 构造 agent 主会话 key。
 * @param agentId agent id。
 * @param mainKey main key。
 */
export function buildAgentMainSessionKey(agentId: string, mainKey: string): string {
  const safeAgentId = toText(agentId) ?? DEFAULT_FALLBACK_AGENT_ID
  const safeMainKey = toText(mainKey)?.toLowerCase() ?? DEFAULT_MAIN_KEY
  return `agent:${safeAgentId}:${safeMainKey}`
}

/**
 * 构造新的会话 key。
 * @param agentId agent id。
 */
export function buildNewSessionKey(agentId: string): string {
  const safeAgentId = toText(agentId) ?? DEFAULT_FALLBACK_AGENT_ID
  const uniqueId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  return `agent:${safeAgentId}:chat-${uniqueId}`
}

/**
 * 从 URL 提取 token。
 * @param wsUrl WebSocket URL。
 */
export function extractWsToken(wsUrl: string): string | null {
  try {
    return new URL(wsUrl).searchParams.get('token')
  } catch {
    return null
  }
}

/**
 * 解析 WebSocket 文本帧。
 * @param raw 原始文本。
 */
export function parseFrame(raw: string): GatewayFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isRecord(parsed)) return null
  const frameType = parsed.type
  if (frameType !== 'req' && frameType !== 'res' && frameType !== 'event') return null
  return parsed as unknown as GatewayFrame
}

/**
 * connect 帧中的设备身份信息。
 */
export interface DeviceConnectInfo {
  /** SHA-256(publicKey).hex */
  id: string
  /** base64url 编码的公钥 */
  publicKey: string
  /** base64url 编码的签名 */
  signature: string
  /** 签名时间戳（毫秒） */
  signedAt: number
  /** 服务端下发的 nonce */
  nonce: string
}

/**
 * connect 帧中的客户端元信息。
 * @param platform 平台标识（例如 windows/macos/linux/web）。
 * @param deviceFamily 设备族（例如 desktop/web）。
 */
export interface ConnectClientMeta {
  platform?: string
  deviceFamily?: string
}

/**
 * 构造 connect 帧。
 * @param wsUrl WebSocket URL。
 * @param requestId 请求 id。
 * @param device 设备身份信息（可选，启用设备认证时必填）。
 * @param deviceToken 已配对的设备令牌（可选，后续重连使用）。
 * @param clientMeta 客户端元信息（平台、设备族）。
 */
export function buildConnectFrame(
  wsUrl: string,
  requestId: string,
  device?: DeviceConnectInfo,
  deviceToken?: string,
  clientMeta?: ConnectClientMeta,
): GatewayReqFrame | null {
  const token = extractWsToken(wsUrl)
  if (!token) return null

  const auth: Record<string, unknown> = { token }
  if (deviceToken) auth.deviceToken = deviceToken

  const platform = toText(clientMeta?.platform) ?? detectPlatform()
  const deviceFamily = toText(clientMeta?.deviceFamily) ?? undefined

  const client: Record<string, unknown> = {
    id: CLIENT_ID,
    version: CLIENT_VERSION,
    platform,
    mode: CLIENT_MODE,
  }
  if (deviceFamily) client.deviceFamily = deviceFamily

  const params: Record<string, unknown> = {
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    client,
    role: CLIENT_ROLE,
    scopes: [...CLIENT_SCOPES],
    caps: [...CLIENT_CAPS],
    auth,
  }

  if (device) {
    params.device = {
      id: device.id,
      publicKey: device.publicKey,
      signature: device.signature,
      signedAt: device.signedAt,
      nonce: device.nonce,
    }
  }

  return {
    type: 'req',
    id: requestId,
    method: 'connect',
    params,
  }
}
