import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildWsUrl,
  type LocalOpenClawServerCandidate,
  type ServerConfig,
  type ServerFormValue,
  type ServerProtocol,
} from '../types/server'
import { isTauri } from '../lib/env'
import { isRecord, toText } from '../lib/parsers'

const SERVERS_KEY = 'servers'
const ACTIVE_SERVER_KEY = 'activeServerId'
const STORE_FILE = 'servers.json'

/** localStorage 旧存储键，用于数据迁移。 */
const LEGACY_SERVERS_KEY = 'openclaw-servers'
const LEGACY_ACTIVE_SERVER_KEY = 'openclaw-active-server'

/** 浏览器远程模式 - 服务器虚拟 id。 */
const WEB_REMOTE_SERVER_ID = '__web_remote__'

/** 浏览器远程模式 - 代理握手占位 token。 */
const WEB_REMOTE_PROXY_TOKEN_PLACEHOLDER = '__web_remote_proxy__'

/**
 * Web API 返回的配置结构。
 */
interface WebApiConfig {
  wsUrl: string
  serverName?: string
}

/**
 * 构建浏览器远程模式下的 WebSocket 代理地址。
 * @param accessToken Web 访问 token 或代理占位 token。
 */
function buildWebRemoteProxyWsUrl(accessToken: string): string {
  if (typeof window === 'undefined') return ''
  const trimmedToken = accessToken.trim()
  if (!trimmedToken) return ''

  const protocol: ServerProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const host = window.location.hostname.trim()
  if (!host) return ''

  const port = window.location.port.trim()
  const portPart = port ? `:${port}` : ''
  const params = new URLSearchParams({ token: trimmedToken })
  return `${protocol}://${host}${portPart}/ws?${params.toString()}`
}

/**
 * 从当前页面 URL 中读取访问 token。
 */
function readWebAccessTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const token = new URLSearchParams(window.location.search).get('token')
  const trimmed = token?.trim() ?? ''
  return trimmed || null
}

/**
 * 从 Web API 获取远程配置。
 * GET /api/config → { wsUrl, serverName }
 */
async function fetchConfigFromApi(): Promise<WebApiConfig> {
  const accessToken = readWebAccessTokenFromLocation()
  const headers = accessToken
    ? { Authorization: `Bearer ${accessToken}` }
    : undefined

  const res = await fetch('/api/config', { headers })
  if (!res.ok) throw new Error(`获取远程配置失败: ${res.status}`)
  return res.json() as Promise<WebApiConfig>
}

/**
 * 判断主机是否为回环地址。
 * @param host 主机名。
 */
function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return (
    normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]'
  )
}

/**
 * 解析 Web 远程模式下的可达网关主机。
 * 当网关地址是 localhost / 127.0.0.1 / ::1 时，自动替换为当前页面主机。
 * @param host 原始网关主机。
 */
function resolveWebRemoteGatewayHost(host: string): string {
  if (!isLoopbackHost(host)) return host
  if (typeof window === 'undefined') return host

  const pageHost = window.location.hostname.trim()
  if (!pageHost || isLoopbackHost(pageHost)) return host
  return pageHost
}

/**
 * 将 Web API 配置转换为虚拟 ServerConfig。
 * @param config Web API 配置。
 */
function buildWebRemoteServer(config: WebApiConfig): ServerConfig {
  // 解析 wsUrl 获取 host / port / protocol / token
  let protocol: ServerProtocol = 'ws'
  let host = ''
  let port: number | null = null
  const token = readWebAccessTokenFromLocation() ?? WEB_REMOTE_PROXY_TOKEN_PLACEHOLDER

  try {
    // wsUrl 格式: ws://host:port?token=xxx 或 wss://host:port?token=xxx
    const httpUrl = config.wsUrl.replace(/^ws/, 'http')
    const parsed = new URL(httpUrl)
    protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    host = typeof window === 'undefined'
      ? resolveWebRemoteGatewayHost(parsed.hostname)
      : (window.location.hostname.trim() || resolveWebRemoteGatewayHost(parsed.hostname))
    const pagePort = typeof window === 'undefined' ? '' : window.location.port.trim()
    if (pagePort) {
      const parsedPort = parseInt(pagePort, 10)
      if (!isNaN(parsedPort)) port = parsedPort
    }
  } catch {
    // 解析失败时使用原始 wsUrl 作为 host
    host = config.wsUrl
  }

  return {
    id: WEB_REMOTE_SERVER_ID,
    name: config.serverName ?? '远程服务器',
    host,
    port,
    protocol,
    token,
    createdAt: Date.now(),
  }
}

/**
 * 服务器存储状态。
 * @param servers 服务器列表。
 * @param activeServerId 当前选中服务器 id。
 */
interface ServerStoreState {
  servers: ServerConfig[]
  activeServerId: string | null
}

/**
 * 规范化协议字段。
 * @param value 协议原始值。
 */
function normalizeProtocol(value: unknown): ServerProtocol | null {
  return value === 'ws' || value === 'wss' ? value : null
}

/**
 * 规范化端口字段。
 * @param value 端口原始值。
 */
function normalizePort(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && !value.trim()) return null

  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return null
  return parsed
}

/**
 * 清理主机地址输入。
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
 * 规范化表单输入。
 * @param value 表单输入。
 */
function normalizeFormValue(value: ServerFormValue): ServerFormValue {
  const protocol = normalizeProtocol(value.protocol) ?? 'wss'
  return {
    name: value.name.trim(),
    host: normalizeHost(value.host),
    port: normalizePort(value.port),
    protocol,
    token: value.token.trim(),
  }
}

/**
 * 解析本机 OpenClaw 网关 token。
 * @param gateway 网关配置对象。
 */
function resolveLocalGatewayToken(gateway: Record<string, unknown>): string | null {
  const directToken = toText(gateway.token)
  if (directToken) return directToken

  const auth = isRecord(gateway.auth) ? gateway.auth : null
  return auth ? toText(auth.token) : null
}

/**
 * 从 OpenClaw 配置中提取本机服务器信息。
 * @param rawConfig 原始配置对象。
 * @param configPath 配置文件路径。
 */
function extractLocalOpenClawServerCandidate(
  rawConfig: unknown,
  configPath: string,
): LocalOpenClawServerCandidate | null {
  if (!isRecord(rawConfig)) return null

  const gateway = isRecord(rawConfig.gateway) ? rawConfig.gateway : null
  if (!gateway) return null

  const port = normalizePort(gateway.port)
  const token = resolveLocalGatewayToken(gateway)
  if (!port || !token) return null

  return {
    name: '本机 OpenClaw',
    host: '127.0.0.1',
    port,
    protocol: 'ws',
    token,
    configPath,
  }
}

/**
 * 从存储结构转换为服务器配置。
 * @param value 原始存储值。
 */
function normalizeServerConfig(value: unknown): ServerConfig | null {
  if (!isRecord(value)) return null

  const id = toText(value.id)
  const name = toText(value.name)
  const host = toText(value.host)
  const token = toText(value.token)
  const protocol = normalizeProtocol(value.protocol)
  if (!id || !name || !host || !token || !protocol) return null

  const rawCreatedAt = value.createdAt
  const createdAt = typeof rawCreatedAt === 'number' ? rawCreatedAt : Date.now()

  return {
    id,
    name,
    host: normalizeHost(host),
    port: normalizePort(value.port),
    protocol,
    token,
    createdAt,
  }
}

/**
 * 规范化服务器配置列表。
 * @param raw 原始数据。
 */
function normalizeServerList(raw: unknown): ServerConfig[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(item => normalizeServerConfig(item))
    .filter((item): item is ServerConfig => Boolean(item))
}

/**
 * 生成服务器 id。
 */
function generateServerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `server-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 计算有效的选中服务器 id。
 * @param servers 服务器列表。
 * @param currentId 当前选中 id。
 */
function resolveActiveServerId(servers: ServerConfig[], currentId: string | null): string | null {
  if (servers.length === 0) return null
  if (currentId && servers.some(item => item.id === currentId)) return currentId
  return servers[0].id
}

/**
 * plugin-store 实例接口（避免静态导入 @tauri-apps/plugin-store）。
 */
interface PluginStoreInstance {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<boolean>
}

/**
 * 从 localStorage 迁移旧数据到 plugin-store。
 * @param store plugin-store 实例。
 */
async function migrateFromLocalStorage(store: PluginStoreInstance): Promise<{ servers: ServerConfig[]; activeServerId: string | null } | null> {
  const raw = window.localStorage.getItem(LEGACY_SERVERS_KEY)
  if (!raw) return null

  try {
    const servers = normalizeServerList(JSON.parse(raw))
    const activeServerId = toText(window.localStorage.getItem(LEGACY_ACTIVE_SERVER_KEY))

    await store.set(SERVERS_KEY, servers)
    await store.set(ACTIVE_SERVER_KEY, activeServerId)

    // 清理旧数据
    window.localStorage.removeItem(LEGACY_SERVERS_KEY)
    window.localStorage.removeItem(LEGACY_ACTIVE_SERVER_KEY)

    return { servers, activeServerId }
  } catch {
    return null
  }
}

/**
 * 服务器存储 Hook。
 */
export function useServerStore() {
  const [store, setStore] = useState<ServerStoreState>({ servers: [], activeServerId: null })
  const [ready, setReady] = useState(false)
  /** 浏览器远程模式标记，用于禁用增删改操作。 */
  const [isWebRemote, setIsWebRemote] = useState(false)
  const storeRef = useRef<PluginStoreInstance | null>(null)

  /**
   * 异步初始化 Store 并加载数据。
   * Tauri 环境使用 plugin-store，浏览器环境通过 Web API 获取远程配置。
   */
  useEffect(() => {
    let cancelled = false

    async function initTauri() {
      const { Store: PluginStore } = await import('@tauri-apps/plugin-store')
      const pluginStore = await PluginStore.load(STORE_FILE, {
        defaults: {},
        autoSave: 100,
      })
      if (cancelled) return

      storeRef.current = pluginStore

      // 尝试从 localStorage 迁移旧数据
      const migrated = await migrateFromLocalStorage(pluginStore)

      let servers: ServerConfig[]
      let activeServerId: string | null

      if (migrated) {
        servers = migrated.servers
        activeServerId = migrated.activeServerId
      } else {
        const rawServers = await pluginStore.get<unknown>(SERVERS_KEY)
        servers = normalizeServerList(rawServers)
        activeServerId = toText(await pluginStore.get<unknown>(ACTIVE_SERVER_KEY))
      }

      if (cancelled) return

      setStore({
        servers,
        activeServerId: resolveActiveServerId(servers, activeServerId),
      })
      setReady(true)
    }

    async function initWeb() {
      const config = await fetchConfigFromApi()
      if (cancelled) return

      const server = buildWebRemoteServer(config)
      setIsWebRemote(true)
      setStore({
        servers: [server],
        activeServerId: server.id,
      })
      setReady(true)
    }

    if (isTauri()) {
      initTauri()
    } else {
      initWeb()
    }

    return () => { cancelled = true }
  }, [])

  /**
   * 持久化服务器列表。
   */
  useEffect(() => {
    if (!ready) return
    storeRef.current?.set(SERVERS_KEY, store.servers)
  }, [store.servers, ready])

  /**
   * 持久化当前选中服务器。
   */
  useEffect(() => {
    if (!ready) return
    if (store.activeServerId) {
      storeRef.current?.set(ACTIVE_SERVER_KEY, store.activeServerId)
    } else {
      storeRef.current?.delete(ACTIVE_SERVER_KEY)
    }
  }, [store.activeServerId, ready])

  /**
   * 新增服务器配置并自动选中。
   * @param value 服务器表单值。
   */
  const addServer = useCallback((value: ServerFormValue) => {
    const normalizedValue = normalizeFormValue(value)
    const id = generateServerId()
    const nextServer: ServerConfig = {
      id,
      createdAt: Date.now(),
      ...normalizedValue,
    }

    setStore(prev => ({
      servers: [nextServer, ...prev.servers],
      activeServerId: id,
    }))
  }, [])

  /**
   * 更新服务器配置。
   * @param id 服务器 id。
   * @param value 服务器表单值。
   */
  const updateServer = useCallback((id: string, value: ServerFormValue) => {
    const normalizedValue = normalizeFormValue(value)
    setStore((prev) => {
      return {
        ...prev,
        servers: prev.servers.map((item) => {
          if (item.id !== id) return item
          return { ...item, ...normalizedValue }
        }),
      }
    })
  }, [])

  /**
   * 删除服务器配置。
   * @param id 服务器 id。
   */
  const removeServer = useCallback((id: string) => {
    setStore((prev) => {
      const nextServers = prev.servers.filter(item => item.id !== id)
      const nextActiveServerId = prev.activeServerId === id
        ? resolveActiveServerId(nextServers, null)
        : resolveActiveServerId(nextServers, prev.activeServerId)

      return {
        servers: nextServers,
        activeServerId: nextActiveServerId,
      }
    })
  }, [])

  /**
   * 检测本机是否存在可直接连接的 OpenClaw 网关配置。
   */
  const detectLocalOpenClawServer = useCallback(async (): Promise<LocalOpenClawServerCandidate | null> => {
    if (!isTauri()) return null

    const { homeDir, join } = await import('@tauri-apps/api/path')
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')

    const currentHomeDir = await homeDir()
    const configPath = await join(currentHomeDir, '.openclaw', 'openclaw.json')
    const fileExists = await exists(configPath)
    if (!fileExists) return null

    const rawText = await readTextFile(configPath)
    if (!rawText.trim()) return null

    const parsedConfig = JSON.parse(rawText) as unknown
    return extractLocalOpenClawServerCandidate(parsedConfig, configPath)
  }, [])

  /**
   * 切换当前选中服务器。
   * @param id 服务器 id，null 表示清空选中。
   */
  const setActiveServerId = useCallback((id: string | null) => {
    setStore((prev) => {
      if (id === null) {
        return { ...prev, activeServerId: null }
      }

      const exists = prev.servers.some(item => item.id === id)
      if (!exists) return prev
      return { ...prev, activeServerId: id }
    })
  }, [])

  const activeServer = useMemo(
    () => store.servers.find(item => item.id === store.activeServerId) ?? null,
    [store.activeServerId, store.servers],
  )

  const activeWsUrl = useMemo(() => {
    if (!activeServer) return ''
    if (isWebRemote && activeServer.id === WEB_REMOTE_SERVER_ID) {
      return buildWebRemoteProxyWsUrl(activeServer.token)
    }
    return buildWsUrl(activeServer)
  }, [activeServer, isWebRemote])

  return {
    ready,
    isWebRemote,
    servers: store.servers,
    activeServerId: store.activeServerId,
    activeServer,
    activeWsUrl,
    addServer,
    updateServer,
    removeServer,
    detectLocalOpenClawServer,
    setActiveServerId,
  } as const
}
