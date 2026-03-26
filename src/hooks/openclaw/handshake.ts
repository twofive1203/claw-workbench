/**
 * 连接握手、设备签名、错误增强逻辑。
 *
 * @author towfive
 */

import { isRecord, toText } from '../../lib/parsers'
import {
  type GatewayError,
  type GatewayReqFrame,
  extractWsToken,
  buildConnectFrame,
  CLIENT_ID,
  CLIENT_MODE,
  CLIENT_ROLE,
  CLIENT_SCOPES,
} from './protocol'
import {
  loadOrCreateDeviceIdentity,
  buildDeviceAuthPayload,
  signDevicePayload,
  loadDeviceToken,
  detectPlatform,
  toBase64Url,
} from './deviceIdentity'

// ===================== 类型 =====================

/**
 * RPC 调用错误（保留错误码与扩展字段）。
 * @param code 错误码。
 * @param retryAfterMs 建议重试等待毫秒。
 * @param details 额外错误信息。
 */
export interface RpcCallError extends Error {
  code?: string
  retryAfterMs?: number
  details?: Record<string, unknown>
}

/** buildSignedConnectFrame 成功返回值。 */
export interface SignedConnectResult {
  frame: GatewayReqFrame
  deviceId: string
}

// ===================== 工具函数 =====================

/**
 * 构建 RPC 错误对象（保留错误码与扩展字段）。
 * @param message 错误信息。
 * @param meta 网关返回的错误元数据。
 */
export function buildRpcError(message: string, meta?: GatewayError): RpcCallError {
  const rpcError = new Error(message) as RpcCallError
  const code = toText(meta?.code)
  if (code) rpcError.code = code

  if (typeof meta?.retryAfterMs === 'number') {
    rpcError.retryAfterMs = meta.retryAfterMs
  }

  if (meta) {
    const details = Object.entries(meta).reduce<Record<string, unknown>>((result, [key, value]) => {
      if (key === 'code' || key === 'message' || key === 'retryAfterMs') return result
      result[key] = value
      return result
    }, {})
    if (Object.keys(details).length > 0) {
      rpcError.details = details
    }
  }

  return rpcError
}

/**
 * 获取当前页面 origin。
 */
export function getCurrentOrigin(): string | null {
  if (typeof window === 'undefined') return null
  return toText(window.location.origin)
}

/**
 * 压缩展示长 ID，避免错误提示块过长影响阅读。
 * @param value 原始 ID。
 * @param head 保留前缀长度。
 * @param tail 保留后缀长度。
 */
export function shortenId(value: string, head = 8, tail = 6): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length <= head + tail + 1) return trimmed
  return `${trimmed.slice(0, head)}…${trimmed.slice(-tail)}`
}

/**
 * 构造设备 ID 提示行（短格式），用于错误提示块展示。
 * @param deviceId 设备 ID（SHA-256(publicKey).hex）。
 */
export function buildDeviceIdHint(deviceId?: string | null): string | null {
  const trimmed = toText(deviceId)?.trim() ?? ''
  if (!trimmed) return null
  const lengthHint = trimmed.length > 20 ? `（共${trimmed.length}位）` : ''
  return `设备 ID: ${shortenId(trimmed)}${lengthHint}`
}

/**
 * 判断是否为桌面端内嵌 Web 服务的 /ws 代理地址。
 * 该场景下浏览器侧 token 并非网关 token（会被代理层重写），设备签名通常需要禁用 token 绑定。
 * @param wsUrl WebSocket URL。
 */
export function isWebRemoteProxyWsUrl(wsUrl: string): boolean {
  try {
    return new URL(wsUrl).pathname === '/ws'
  } catch {
    return false
  }
}

/**
 * 推断当前客户端的 deviceFamily。
 * - Tauri 桌面端：desktop
 * - 浏览器（含远程代理模式）：web
 * @param wsUrl WebSocket URL（用于识别 /ws 代理）。
 */
export function resolveDeviceFamily(wsUrl: string): string {
  if (isWebRemoteProxyWsUrl(wsUrl)) return 'web'

  if (
    typeof window !== 'undefined'
    && ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)
  ) return 'desktop'

  return 'web'
}

/**
 * 从网关错误对象中提取配对请求 ID。
 * @param meta 网关返回的错误对象。
 */
export function extractPairingRequestId(meta?: GatewayError): string | null {
  const requestId = toText((meta as Record<string, unknown> | undefined)?.requestId)
    ?? toText((meta as Record<string, unknown> | undefined)?.request_id)
    ?? toText((meta as Record<string, unknown> | undefined)?.pairingRequestId)
    ?? toText((meta as Record<string, unknown> | undefined)?.pairing_request_id)

  if (requestId) return requestId

  const details = (meta as Record<string, unknown> | undefined)?.details
  if (!isRecord(details)) return null

  return toText(details.requestId)
    ?? toText(details.request_id)
    ?? toText(details.pairingRequestId)
    ?? toText(details.pairing_request_id)
    ?? null
}

/**
 * 异步构造含设备签名的 connect 帧。
 * @param wsUrl WebSocket URL。
 * @param requestId 请求 id。
 * @param nonce 服务端下发的挑战 nonce。
 */
export async function buildSignedConnectFrame(
  wsUrl: string,
  requestId: string,
  nonce: string,
): Promise<SignedConnectResult | null> {
  const token = extractWsToken(wsUrl)
  if (!token) return null

  const isProxy = isWebRemoteProxyWsUrl(wsUrl)
  const identity = await loadOrCreateDeviceIdentity()
  const storedToken = await loadDeviceToken(identity.deviceId, CLIENT_ROLE)
  const signedAtMs = Date.now()
  const platform = detectPlatform()
  const deviceFamily = resolveDeviceFamily(wsUrl)

  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: CLIENT_ID,
    clientMode: CLIENT_MODE,
    role: CLIENT_ROLE,
    scopes: CLIENT_SCOPES,
    signedAtMs,
    token: isProxy ? null : token,
    nonce,
    platform,
    deviceFamily,
  })

  const signature = await signDevicePayload(identity.privateKey, payload)

  const frame = buildConnectFrame(wsUrl, requestId, {
    id: identity.deviceId,
    publicKey: toBase64Url(identity.publicKey),
    signature,
    signedAt: signedAtMs,
    nonce,
  }, storedToken ?? undefined, { platform, deviceFamily })

  if (!frame) return null
  return { frame, deviceId: identity.deviceId }
}

/**
 * 为握手错误补充可执行的排查提示。
 * @param errorText 原始错误文本。
 * @param deviceId 当前设备 ID（可选，用于辅助排查）。
 * @param wsUrl WebSocket URL（用于识别是否为 /ws 代理模式）。
 * @param meta 网关错误对象（用于提取 requestId、错误码等）。
 */
export function enhanceHandshakeError(
  errorText: string,
  deviceId?: string | null,
  wsUrl?: string,
  meta?: GatewayError,
): string {
  const lower = errorText.toLowerCase()
  const deviceHint = buildDeviceIdHint(deviceId)
  const isProxy = wsUrl ? isWebRemoteProxyWsUrl(wsUrl) : false
  const requestId = extractPairingRequestId(meta)

  if (lower.includes('device identity required')) {
    const suffix = deviceHint ? `\n${deviceHint}` : ''
    return `${errorText} | 网关已启用设备认证，客户端需要携带 device 身份信息（需处理 connect.challenge 并发送带签名的 connect 请求）${suffix}`
  }
  if (lower.includes('device signature invalid')) {
    const proxyHint = isProxy
      ? '\n提示：当前为 Web 代理模式（/ws），若网关开启了 gateway.controlUi.deviceAuth.requireTokenBinding，需要在网关侧设置为 false（关闭 token 绑定）后才能签名通过'
      : ''
    const suffix = deviceHint ? `\n${deviceHint}` : ''
    return `${errorText} | 设备签名验证失败，可尝试重置设备身份后重新连接${proxyHint}${suffix}`
  }
  if (lower.includes('pairing required') || lower.includes('pairing_required')) {
    const lines: string[] = [`${errorText} | 设备需要在服务端审批：`]
    if (requestId) {
      lines.push(`requestId: ${requestId}`)
      lines.push(`执行：openclaw devices approve ${requestId}`)
      lines.push('（如只有 1 个待审批设备，也可执行：openclaw devices approve --latest）')
    } else {
      lines.push('执行：openclaw devices list（获取 requestId）')
      lines.push('再执行：openclaw devices approve <requestId>')
    }
    lines.push('若提示 unknown requestId：重新连接生成新的 requestId 再审批')
    if (deviceHint) lines.push(deviceHint)
    return lines.join('\n')
  }
  if (lower.includes('device token mismatch')) {
    const suffix = deviceHint ? `\n${deviceHint}` : ''
    return `${errorText} | 设备令牌不匹配，将自动清除旧令牌并重试${suffix}`
  }
  if (lower.includes('unknown requestid')) {
    return [
      `${errorText} | approve 参数需要 requestId（不是 deviceId）`,
      '可执行 openclaw devices list 获取 requestId；若列表为空请重新发起连接生成新的 requestId',
      deviceHint,
    ].filter(Boolean).join('\n')
  }

  if (!lower.includes('origin not allowed')) return errorText

  const currentOrigin = getCurrentOrigin()
    ?? 'unknown（可在控制台执行 window.location.origin 查看）'

  return [
    errorText,
    `当前应用 Origin: ${currentOrigin}`,
    '请将该 Origin 添加到 gateway.controlUi.allowedOrigins',
  ].join(' | ')
}
