/**
 * 服务器协议类型。
 */
export type ServerProtocol = 'ws' | 'wss'

/**
 * 服务器配置结构。
 * @param id 服务器唯一标识。
 * @param name 服务器名称。
 * @param host 服务器主机地址。
 * @param port 服务器端口，null 表示协议默认端口。
 * @param protocol 服务器协议。
 * @param token 网关认证 token。
 * @param createdAt 创建时间戳。
 */
export interface ServerConfig {
  id: string
  name: string
  host: string
  port: number | null
  protocol: ServerProtocol
  token: string
  createdAt: number
}

/**
 * 服务器表单结构。
 * @param name 服务器名称。
 * @param host 服务器主机地址。
 * @param port 服务器端口，null 表示协议默认端口。
 * @param protocol 服务器协议。
 * @param token 网关认证 token。
 */
export interface ServerFormValue {
  name: string
  host: string
  port: number | null
  protocol: ServerProtocol
  token: string
}

/**
 * 本机 OpenClaw 检测结果。
 * @param name 建议使用的服务器名称。
 * @param host 本机网关主机地址。
 * @param port 本机网关端口。
 * @param protocol 本机网关协议。
 * @param token 本机网关认证 token。
 * @param configPath 读取到的配置文件路径。
 */
export interface LocalOpenClawServerCandidate extends ServerFormValue {
  configPath: string
}

/**
 * 获取协议默认端口。
 * @param protocol 服务器协议。
 */
function getDefaultPort(protocol: ServerProtocol): number {
  return protocol === 'ws' ? 80 : 443
}

/**
 * 清理用户输入的主机地址。
 * @param host 原始主机地址。
 */
function normalizeHost(host: string): string {
  const trimmed = host.trim()
  if (!trimmed) return ''

  const withoutProtocol = trimmed.replace(/^(ws|wss):\/\//i, '')
  const [withoutPath] = withoutProtocol.split('/')
  const [withoutQuery] = (withoutPath ?? '').split('?')
  return (withoutQuery ?? '').trim()
}

/**
 * 判断端口是否需要拼入 URL。
 * @param protocol 服务器协议。
 * @param port 服务器端口。
 */
function shouldAttachPort(protocol: ServerProtocol, port: number | null): port is number {
  if (port === null || !Number.isInteger(port)) return false
  if (port <= 0 || port > 65535) return false
  return port !== getDefaultPort(protocol)
}

/**
 * 根据配置拼装 WebSocket URL。
 * @param config 服务器配置。
 */
export function buildWsUrl(config: ServerConfig): string {
  const protocol: ServerProtocol = config.protocol === 'ws' ? 'ws' : 'wss'
  const host = normalizeHost(config.host)
  const token = config.token.trim()

  if (!host || !token) return ''

  const portPart = shouldAttachPort(protocol, config.port) ? `:${config.port}` : ''
  const params = new URLSearchParams({ token })
  return `${protocol}://${host}${portPart}?${params.toString()}`
}
