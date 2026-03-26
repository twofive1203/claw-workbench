import { useCallback, useEffect, useRef, useState } from 'react'
import { safeInvoke, isTauri } from '../lib/env'

/**
 * Web 服务器状态信息。
 * @author towfive
 */
export interface WebServerInfo {
  running: boolean
  port: number
  accessToken?: string
  startedAt?: number
}

/**
 * Web 服务器配置（持久化字段）。
 */
interface WebServerConfig {
  port: number
  accessToken: string
}

const DEFAULT_PORT = 18800
const DEFAULT_ACCESS_TOKEN = ''
const STORE_FILE = 'web-server.json'
const CONFIG_PORT_KEY = 'port'
const CONFIG_TOKEN_KEY = 'accessToken'

/**
 * Web 远程服务 Hook。
 * 管理内嵌 Web 服务器的启动/停止/状态查询，以及网关配置同步和端口/令牌持久化。
 * @param activeWsUrl 当前活跃的 WebSocket 地址。
 * @param activeServerName 当前活跃的服务器名称。
 * @author towfive
 */
export function useWebServer(activeWsUrl: string, activeServerName: string) {
  const [webServerInfo, setWebServerInfo] = useState<WebServerInfo | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [config, setConfig] = useState<WebServerConfig>({ port: DEFAULT_PORT, accessToken: DEFAULT_ACCESS_TOKEN })
  const [configReady, setConfigReady] = useState(false)

  // Store 引用
  const storeRef = useRef<import('@tauri-apps/plugin-store').Store | null>(null)

  /**
   * 初始化：加载持久化配置 + 拉取服务器状态。
   */
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false

    async function init() {
      // 加载持久化配置
      try {
        const { Store } = await import('@tauri-apps/plugin-store')
        const store = await Store.load(STORE_FILE, { defaults: {}, autoSave: 100 })
        if (cancelled) return
        storeRef.current = store

        const storedPort = await store.get<unknown>(CONFIG_PORT_KEY)
        const storedToken = await store.get<unknown>(CONFIG_TOKEN_KEY)

        const port = typeof storedPort === 'number' && storedPort > 0 && storedPort <= 65535
          ? storedPort
          : DEFAULT_PORT
        const accessToken = typeof storedToken === 'string' ? storedToken : DEFAULT_ACCESS_TOKEN

        if (!cancelled) {
          setConfig({ port, accessToken })
          setConfigReady(true)
        }
      } catch {
        if (!cancelled) setConfigReady(true)
      }

      // 拉取当前 Web 服务器状态
      try {
        const info = await safeInvoke<WebServerInfo>('web_server_status')
        if (!cancelled && info) {
          setWebServerInfo(info)
        }
      } catch {
        // 静默失败，命令可能尚未注册
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  /**
   * 持久化配置变更。
   */
  useEffect(() => {
    if (!configReady || !storeRef.current) return
    storeRef.current.set(CONFIG_PORT_KEY, config.port)
    storeRef.current.set(CONFIG_TOKEN_KEY, config.accessToken)
  }, [config, configReady])

  /**
   * 监听 activeWsUrl / activeServerName 变化，Web 服务器运行中时自动同步网关配置。
   */
  useEffect(() => {
    if (!webServerInfo?.running) return
    if (!activeWsUrl) return

    safeInvoke('update_web_server_gateway', {
      gatewayWsUrl: activeWsUrl,
      gatewayServerName: activeServerName,
    }).catch(() => {
      // 静默失败
    })
  }, [activeWsUrl, activeServerName, webServerInfo?.running])

  /**
   * 启动 Web 服务器。
   * @param port 监听端口。
   * @param accessToken 可选访问令牌。
   */
  const startServer = useCallback(async (port: number, accessToken?: string) => {
    setError(null)
    setIsStarting(true)
    try {
      const info = await safeInvoke<WebServerInfo>('start_web_server', {
        port,
        accessToken: accessToken || undefined,
        gatewayWsUrl: activeWsUrl,
        gatewayServerName: activeServerName,
      })
      if (info) {
        setWebServerInfo(info)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStarting(false)
    }
  }, [activeWsUrl, activeServerName])

  /**
   * 停止 Web 服务器。
   */
  const stopServer = useCallback(async () => {
    setError(null)
    setIsStopping(true)
    try {
      await safeInvoke('stop_web_server')
      setWebServerInfo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsStopping(false)
    }
  }, [])

  /**
   * 刷新 Web 服务器状态。
   */
  const refreshStatus = useCallback(async () => {
    setError(null)
    try {
      const info = await safeInvoke<WebServerInfo>('web_server_status')
      if (info) {
        setWebServerInfo(info)
      } else {
        setWebServerInfo(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  /**
   * 更新端口配置。
   * @param port 新端口号。
   */
  const setPort = useCallback((port: number) => {
    setConfig(prev => ({ ...prev, port }))
  }, [])

  /**
   * 更新访问令牌配置。
   * @param accessToken 新访问令牌。
   */
  const setAccessToken = useCallback((accessToken: string) => {
    setConfig(prev => ({ ...prev, accessToken }))
  }, [])

  return {
    webServerInfo,
    isStarting,
    isStopping,
    error,
    config,
    startServer,
    stopServer,
    refreshStatus,
    setPort,
    setAccessToken,
  } as const
}
