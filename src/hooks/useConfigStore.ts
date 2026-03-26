import JSON5 from 'json5'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createEmptyConfig,
  ensureProviderUserAgentHeader,
  isRecord,
  normalizeRootConfig,
  type ConfigRpcState,
  type OpenClawConfig,
  type ProviderConfig,
} from '../types/config'
import { loadConfigSchema, validateOpenClawConfig, type ConfigValidationIssue } from '../lib/configSchema'
import { toErrorText, toText } from '../lib/parsers'
import { useConfigRpc, type RpcCaller } from './useConfigRpc'
import {
  resolveConfigLoadStrategy,
  resolveRpcAvailabilityTransition,
  shouldPreferRpcAfterServerSwitch,
} from './config/configModeMachine'
import { isTauri } from '../lib/env'

const STORE_FILE = 'config-editor.json'
const CONFIG_PATH_MAP_KEY = 'configPathByServer'
const DEFAULT_SERVER_KEY = '__default__'
const RPC_PRIORITY_WAIT_MS = 4000
const RPC_DEMOTE_TO_LOCAL_MS = 10000
const RPC_PRIORITY_POLL_MS = 100

/**
 * 配置路径映射结构。
 * @param [serverId] serverId 对应的配置路径。
 */
type ConfigPathMap = Record<string, string>

/**
 * 保存写入模式。
 * @param patch 使用 config.patch（局部更新）。
 * @param apply 使用 config.apply（全量替换）。
 */
export type ConfigWriteMode = 'patch' | 'apply'

/**
 * 保存配置可选参数。
 * @param writeMode 写入模式，默认 patch。
 */
export interface SaveConfigOptions {
  writeMode?: ConfigWriteMode
}

/**
 * 配置存储 Hook 入参。
 * @param activeServerId 当前选中服务器 ID。
 * @param isConnected WebSocket 连接状态。
 * @param callRpc 通用 RPC 调用器。
 */
interface UseConfigStoreOptions {
  activeServerId: string | null
  isConnected: boolean
  callRpc: RpcCaller
}

/**
 * 配置存储 Hook 返回值。
 * @param ready 是否初始化完成。
 * @param mode 当前读写模式（rpc/local）。
 * @param config 当前配置对象。
 * @param configPath 当前配置文件路径。
 * @param defaultConfigPath 默认配置文件路径。
 * @param validationIssues 校验问题列表。
 * @param isLoading 是否加载中。
 * @param isSaving 是否保存中。
 * @param isDirty 是否有未保存修改。
 * @param error 错误信息。
 * @param setConfig 直接替换配置对象。
 * @param updateConfig 函数式更新配置对象。
 * @param loadConfig 重新读取配置文件。
 * @param saveConfig 保存配置（支持 patch/apply）。
 * @param revertConfig 还原为最近一次加载/保存的配置快照。
 * @param pickConfigFile 通过文件选择器选择配置文件。
 * @param setConfigPathForCurrentServer 设置当前 server 的配置路径。
 */
interface UseConfigStoreResult {
  ready: boolean
  mode: ConfigRpcState
  config: OpenClawConfig
  configPath: string
  defaultConfigPath: string
  validationIssues: ConfigValidationIssue[]
  isLoading: boolean
  isSaving: boolean
  isDirty: boolean
  error: string | null
  setConfig: (nextConfig: OpenClawConfig) => void
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
  loadConfig: (targetPath?: string) => Promise<boolean>
  saveConfig: (options?: SaveConfigOptions) => Promise<boolean>
  revertConfig: () => void
  pickConfigFile: () => Promise<string | null>
  setConfigPathForCurrentServer: (path: string, options?: { load?: boolean }) => Promise<boolean>
  pendingReloadMessage: string | null
  confirmReload: () => Promise<void>
  dismissReload: () => void
}

/**
 * RPC 错误结构。
 * @param code 错误码。
 * @param retryAfterMs 建议重试等待毫秒。
 */
interface RpcErrorLike extends Error {
  code?: string
  retryAfterMs?: number
}

/**
 * 将 RPC 读取错误转换为更易排查的提示文案。
 * @param error 错误对象。
 */
function formatRpcLoadError(error: unknown): string {
  const rawMessage = toErrorText(error)
  const lowerMessage = rawMessage.toLowerCase()
  const code = getRpcErrorCode(error)

  let hint: string | null = null

  if (code === 'UNAVAILABLE') {
    if (lowerMessage.includes('握手未完成')) {
      hint = '网关握手未完成，请等待连接完成后重试'
    } else {
      hint = '网关未连接或暂不可用，请检查 WebSocket 地址与 token'
    }
  } else if (code === 'INVALID_REQUEST') {
    if (lowerMessage.includes('unknown method') && lowerMessage.includes('config.get')) {
      hint = '当前 Gateway 不支持 config.get，网关与客户端可能版本不匹配'
    } else if (lowerMessage.includes('missing scope')) {
      hint = '当前连接缺少读取配置权限（需要 operator.read 或 operator.admin）'
    } else if (lowerMessage.includes('unauthorized role')) {
      hint = '当前连接角色无权读取配置（需要 operator 角色）'
    }
  }

  if (!hint) {
    if (rawMessage.includes('config.get 返回缺少 hash')) {
      hint = 'Gateway 返回缺少 hash，无法安全读取配置，请升级网关或客户端'
    } else if (
      rawMessage.includes('config.get 返回 raw 非 JSON')
      || rawMessage.includes('config.get 返回 raw 非 JSON5')
      || lowerMessage.includes('unexpected token')
      || lowerMessage.includes('json parse')
    ) {
      hint = 'Gateway 返回格式与当前客户端不兼容，请升级客户端'
    }
  }

  if (!hint || hint === rawMessage) return rawMessage
  return `${hint}（原始错误: ${rawMessage}）`
}

/**
 * 读取 RPC 错误码。
 * @param error 错误对象。
 */
function getRpcErrorCode(error: unknown): string | null {
  if (error instanceof Error && typeof (error as RpcErrorLike).code === 'string') {
    return (error as RpcErrorLike).code ?? null
  }
  if (isRecord(error)) {
    return toText(error.code)
  }
  return null
}

/**
 * 读取 RPC 建议重试时间（毫秒）。
 * @param error 错误对象。
 */
function getRetryAfterMs(error: unknown): number | null {
  if (error instanceof Error && typeof (error as RpcErrorLike).retryAfterMs === 'number') {
    return (error as RpcErrorLike).retryAfterMs ?? null
  }
  if (isRecord(error) && typeof error.retryAfterMs === 'number') {
    return error.retryAfterMs
  }
  return null
}

/**
 * 解析当前应使用的配置校验 Schema。
 * @param schema 远端返回的 Schema。
 */
function resolveValidationSchema(schema: Record<string, unknown> | null): Record<string, unknown> | undefined {
  return schema ?? undefined
}

/**
 * 判断是否属于配置 hash 冲突，需要重新加载。
 * @param error RPC 保存错误。
 */
function isConfigHashConflict(error: unknown): boolean {
  const code = getRpcErrorCode(error)
  if (code === 'CONFLICT') return true
  if (code !== 'INVALID_REQUEST') return false

  const message = toErrorText(error).toLowerCase()
  return (
    message.includes('config changed since last load')
    || message.includes('config base hash required')
    || message.includes('config base hash unavailable')
  )
}

/**
 * 规范化配置路径映射。
 * @param raw 原始映射对象。
 */
function normalizeConfigPathMap(raw: unknown): ConfigPathMap {
  if (!isRecord(raw)) return {}

  const nextMap: ConfigPathMap = {}
  for (const [key, value] of Object.entries(raw)) {
    const path = toText(value)
    if (!path) continue
    nextMap[key] = path
  }
  return nextMap
}

/**
 * 将配置对象转换为快照字符串，用于脏数据比较。
 * @param value 配置对象。
 */
function toSnapshot(value: OpenClawConfig): string {
  return JSON.stringify(value)
}

/**
 * 从快照字符串恢复配置对象。
 * @param snapshot 快照字符串。
 */
function parseSnapshot(snapshot: string): OpenClawConfig {
  if (!snapshot.trim()) return createEmptyConfig()

  try {
    const parsed = JSON.parse(snapshot)
    return normalizeRootConfig(parsed)
  } catch {
    return createEmptyConfig()
  }
}

/**
 * 判断是否为纯对象（非数组）。
 * @param value 任意值。
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && !Array.isArray(value)
}

/**
 * 判断对象是否包含指定 key。
 * @param target 目标对象。
 * @param key 目标 key。
 */
function hasOwnKey(target: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key)
}

/**
 * 深度比较两个值是否一致。
 * @param left 左侧值。
 * @param right 右侧值。
 */
function isDeepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false
    return left.every((item, index) => isDeepEqual(item, right[index]))
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left)
    const rightKeys = Object.keys(right)
    if (leftKeys.length !== rightKeys.length) return false

    for (const key of leftKeys) {
      if (!hasOwnKey(right, key)) return false
      if (!isDeepEqual(left[key], right[key])) return false
    }
    return true
  }

  return false
}

/**
 * 为新增或已修改的 Provider 补齐默认 User-Agent。
 * @param baseConfig 保存前基线配置。
 * @param nextConfig 待保存配置。
 */
export function applyProviderUserAgentOverride(
  baseConfig: OpenClawConfig,
  nextConfig: OpenClawConfig,
): OpenClawConfig {
  const nextModels = isRecord(nextConfig.models) ? nextConfig.models : null
  const nextProviders = nextModels && isRecord(nextModels.providers)
    ? nextModels.providers
    : null
  if (!nextProviders) return nextConfig

  const baseModels = isRecord(baseConfig.models) ? baseConfig.models : null
  const baseProviders = baseModels && isRecord(baseModels.providers)
    ? baseModels.providers
    : null

  let changed = false
  const normalizedProviders: Record<string, ProviderConfig> = {}

  Object.entries(nextProviders).forEach(([providerId, provider]) => {
    const nextProvider = (isRecord(provider) ? provider : {}) as ProviderConfig
    const baseProvider = baseProviders && isRecord(baseProviders[providerId])
      ? (baseProviders[providerId] as ProviderConfig)
      : null
    const shouldApplyOverride = !baseProvider || !isDeepEqual(baseProvider, nextProvider)

    normalizedProviders[providerId] = shouldApplyOverride
      ? ensureProviderUserAgentHeader(nextProvider)
      : nextProvider

    if (shouldApplyOverride) {
      changed = true
    }
  })

  if (!changed) return nextConfig

  return {
    ...nextConfig,
    models: {
      ...nextModels,
      providers: normalizedProviders,
    },
  }
}

/**
 * 生成 JSON Merge Patch 对象（RFC 7396）。
 * @param base 基线配置。
 * @param next 目标配置。
 */
export function createJsonMergePatch(base: unknown, next: unknown): unknown | undefined {
  if (isDeepEqual(base, next)) return undefined

  if (!isPlainObject(base) || !isPlainObject(next)) {
    return next
  }

  const patch: Record<string, unknown> = {}
  const keys = new Set<string>([
    ...Object.keys(base),
    ...Object.keys(next),
  ])

  for (const key of keys) {
    const hasBaseKey = hasOwnKey(base, key)
    const hasNextKey = hasOwnKey(next, key)

    if (!hasNextKey) {
      patch[key] = null
      continue
    }

    if (!hasBaseKey) {
      patch[key] = next[key]
      continue
    }

    const childPatch = createJsonMergePatch(base[key], next[key])
    if (childPatch !== undefined) {
      patch[key] = childPatch
    }
  }

  return Object.keys(patch).length > 0 ? patch : undefined
}

/**
 * 计算默认配置路径。
 */
async function resolveDefaultConfigPath(): Promise<string> {
  try {
    const { homeDir, join } = await import('@tauri-apps/api/path')
    const currentHomeDir = await homeDir()
    return await join(currentHomeDir, '.openclaw', 'openclaw.json')
  } catch {
    return '~/.openclaw/openclaw.json'
  }
}

/**
 * 配置文件存储 Hook。
 * @param options Hook 入参。
 */
export function useConfigStore(options: UseConfigStoreOptions): UseConfigStoreResult {
  const { activeServerId, isConnected, callRpc } = options

  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState<ConfigRpcState>('local')
  const [defaultConfigPath, setDefaultConfigPath] = useState('')
  const [configPathMap, setConfigPathMap] = useState<ConfigPathMap>({})
  const [configPath, setConfigPath] = useState('')
  const [config, setConfigState] = useState<OpenClawConfig>(createEmptyConfig())
  const [savedSnapshot, setSavedSnapshot] = useState(toSnapshot(createEmptyConfig()))
  const [validationIssues, setValidationIssues] = useState<ConfigValidationIssue[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configHash, setConfigHash] = useState<string | null>(null)
  const [pendingReloadMessage, setPendingReloadMessage] = useState<string | null>(null)
  const [remoteSchema, setRemoteSchema] = useState<Record<string, unknown> | null>(null)

  const storeRef = useRef<{ get<T>(key: string): Promise<T | undefined>; set(key: string, value: unknown): Promise<void> } | null>(null)
  const configPathRef = useRef('')
  const modeRef = useRef<ConfigRpcState>('local')
  const configRef = useRef<OpenClawConfig>(createEmptyConfig())
  const savedSnapshotRef = useRef(toSnapshot(createEmptyConfig()))
  const configHashRef = useRef<string | null>(null)
  const remoteSchemaRef = useRef<Record<string, unknown> | null>(null)
  const activeServerKeyRef = useRef(activeServerId ?? DEFAULT_SERVER_KEY)
  const previousServerKeyRef = useRef(activeServerId ?? DEFAULT_SERVER_KEY)
  const preferRpcOnNextLoadRef = useRef(false)
  const loadTaskIdRef = useRef(0)
  const rpcReadyRef = useRef(isConnected)

  const { isRpcAvailable, fetchConfig, fetchConfigSchema, patchConfig, applyConfig } = useConfigRpc({
    callRpc,
    isConnected,
  })
  const isRpcAvailableRef = useRef(isRpcAvailable)

  const currentServerKey = useMemo(
    () => activeServerId ?? DEFAULT_SERVER_KEY,
    [activeServerId],
  )

  /**
   * 同步配置路径到 ref。
   * @param nextPath 最新路径。
   */
  useEffect(() => {
    configPathRef.current = configPath
  }, [configPath])

  /**
   * 同步当前读写模式到 ref。
   * @param nextMode 最新读写模式。
   */
  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  /**
   * 同步 RPC 可用状态到 ref。
   * @param nextRpcAvailable RPC 是否可用。
   */
  useEffect(() => {
    isRpcAvailableRef.current = isRpcAvailable
  }, [isRpcAvailable])

  /**
   * 同步配置对象到 ref。
   * @param nextConfig 最新配置。
   */
  useEffect(() => {
    configRef.current = config
  }, [config])

  /**
   * 同步快照到 ref。
   * @param nextSnapshot 最新快照。
   */
  useEffect(() => {
    savedSnapshotRef.current = savedSnapshot
  }, [savedSnapshot])

  /**
   * 同步 hash 到 ref。
   * @param nextHash 最新 hash。
   */
  useEffect(() => {
    configHashRef.current = configHash
  }, [configHash])

  /**
   * 同步远端 Schema 到 ref。
   * @param nextSchema 最新远端 Schema。
   */
  useEffect(() => {
    remoteSchemaRef.current = remoteSchema
  }, [remoteSchema])

  /**
   * 同步当前服务器 key 到 ref。
   * @param key 当前服务器 key。
   */
  useEffect(() => {
    activeServerKeyRef.current = currentServerKey
  }, [currentServerKey])

  /**
   * 记录 server 切换，下一次加载优先等待 RPC。
   * @param key 当前 server key。
   */
  useEffect(() => {
    if (!shouldPreferRpcAfterServerSwitch(previousServerKeyRef.current, currentServerKey)) return
    previousServerKeyRef.current = currentServerKey
    preferRpcOnNextLoadRef.current = true
  }, [currentServerKey])

  /**
   * 初始化 Store、Schema 与默认路径。
   */
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        await loadConfigSchema()

        if (isTauri()) {
          const { Store } = await import('@tauri-apps/plugin-store')
          const pluginStore = await Store.load(STORE_FILE, {
            defaults: {},
            autoSave: 100,
          })
          const pathMap = normalizeConfigPathMap(
            await pluginStore.get<unknown>(CONFIG_PATH_MAP_KEY),
          )
          const defaultPath = await resolveDefaultConfigPath()

          if (cancelled) return

          storeRef.current = pluginStore
          setConfigPathMap(pathMap)
          setDefaultConfigPath(defaultPath)
        } else {
          if (cancelled) return
          // 浏览器模式：仅通过 RPC 加载配置，不使用本地文件
          setDefaultConfigPath('')
        }

        setReady(true)
      } catch (initError) {
        if (cancelled) return
        setError(`初始化配置编辑器失败: ${toErrorText(initError)}`)
      }
    }

    void init()

    return () => {
      cancelled = true
    }
  }, [])

  /**
   * 持久化配置路径映射。
   */
  useEffect(() => {
    if (!ready) return
    void storeRef.current?.set(CONFIG_PATH_MAP_KEY, configPathMap)
  }, [configPathMap, ready])

  /**
   * 切换 server 后同步当前路径并自动加载。
   * @param key 当前服务器 key。
   * @param mapping 路径映射。
   * @param defaultPath 默认路径。
   */
  useEffect(() => {
    if (!ready || !defaultConfigPath) return

    const nextPath = configPathMap[currentServerKey] ?? defaultConfigPath
    setConfigPath(nextPath)
  }, [configPathMap, currentServerKey, defaultConfigPath, ready])

  /**
   * 读取本地配置文件。
   * @param path 配置文件路径。
   */
  const loadLocalConfig = useCallback(async (path: string): Promise<OpenClawConfig> => {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs')
    const fileExists = await exists(path)
    if (!fileExists) return createEmptyConfig()

    const rawText = await readTextFile(path)
    const parsedConfig = rawText.trim() ? JSON5.parse(rawText) : createEmptyConfig()
    return normalizeRootConfig(parsedConfig)
  }, [])

  /**
   * 在超时时间内等待 RPC 可用。
   * @param taskId 当前加载任务 id。
   * @param timeoutMs 超时时间（毫秒）。
   */
  const waitForRpcAvailable = useCallback(async (taskId: number, timeoutMs: number): Promise<boolean> => {
    const startedAt = Date.now()

    while (Date.now() - startedAt < timeoutMs) {
      if (loadTaskIdRef.current !== taskId) return false
      if (isRpcAvailableRef.current) return true
      await new Promise(resolve => setTimeout(resolve, RPC_PRIORITY_POLL_MS))
    }

    return isRpcAvailableRef.current
  }, [])

  /**
   * 加载配置（优先 RPC，失败后降级本地文件）。
   * @param targetPath 可选目标路径，未传时使用当前路径。
   */
  const loadConfig = useCallback(async (targetPath?: string): Promise<boolean> => {
    const path = (targetPath ?? configPathRef.current).trim()

    const taskId = loadTaskIdRef.current + 1
    loadTaskIdRef.current = taskId
    setIsLoading(true)
    setError(null)

    let rpcLoadError: string | null = null

    try {
      const loadStrategy = resolveConfigLoadStrategy({
        mode: modeRef.current,
        preferRpcOnNextLoad: preferRpcOnNextLoadRef.current,
        isRpcAvailable: isRpcAvailableRef.current,
      })
      let shouldTryRpc = loadStrategy.shouldTryRpcImmediately

      if (loadStrategy.shouldWaitForRpc) {
        shouldTryRpc = await waitForRpcAvailable(taskId, RPC_PRIORITY_WAIT_MS)
      }

      if (shouldTryRpc) {
        try {
          const rpcResult = await fetchConfig()
          if (rpcResult) {
            let nextSchema: Record<string, unknown> | null = null
            try {
              const schemaResult = await fetchConfigSchema()
              nextSchema = schemaResult?.schema ?? null
            } catch {
              nextSchema = null
            }

            const validation = validateOpenClawConfig(
              rpcResult.config,
              resolveValidationSchema(nextSchema),
            )
            if (loadTaskIdRef.current !== taskId) return false

            setConfigState(rpcResult.config)
            setSavedSnapshot(toSnapshot(rpcResult.config))
            setValidationIssues(rpcResult.issues.length > 0 ? rpcResult.issues : validation.issues)
            setConfigHash(rpcResult.hash)
            setRemoteSchema(nextSchema)
            setMode('rpc')
            preferRpcOnNextLoadRef.current = false
            return true
          }
        } catch (rpcError) {
          rpcLoadError = formatRpcLoadError(rpcError)
        }
      }

      if (!path) {
        if (loadTaskIdRef.current !== taskId) return false

        setRemoteSchema(null)
        setConfigHash(null)
        setMode('local')
        preferRpcOnNextLoadRef.current = false
        setError(rpcLoadError ? `RPC 加载失败，且未配置本地文件: ${rpcLoadError}` : '配置文件路径为空')
        return false
      }

      const nextConfig = await loadLocalConfig(path)
      const validation = validateOpenClawConfig(nextConfig)

      if (loadTaskIdRef.current !== taskId) return false

      setConfigState(nextConfig)
      setSavedSnapshot(toSnapshot(nextConfig))
      setValidationIssues(validation.issues)
      setConfigHash(null)
      setRemoteSchema(null)
      const shouldKeepRpcMode = loadStrategy.shouldKeepRpcModeAfterLocalFallback

      if (!shouldKeepRpcMode) {
        setMode('local')
        preferRpcOnNextLoadRef.current = false
        if (rpcLoadError) {
          setError(`RPC 加载失败，已降级本地文件: ${rpcLoadError}`)
        }
      }
      return true
    } catch (loadError) {
      if (loadTaskIdRef.current !== taskId) return false
      setError(`加载配置失败: ${toErrorText(loadError)}`)
      return false
    } finally {
      if (loadTaskIdRef.current === taskId) {
        setIsLoading(false)
      }
    }
  }, [fetchConfig, fetchConfigSchema, loadLocalConfig, waitForRpcAvailable])

  /**
   * 当路径变化时自动读取配置。
   * @param path 当前路径。
   */
  useEffect(() => {
    if (!ready) return
    if (!configPath && !isRpcAvailable) return
    void loadConfig(configPath)
  }, [configPath, isRpcAvailable, loadConfig, ready])

  /**
   * 监听 RPC 可用性变化，断连延迟切本地、重连切回 RPC。
   */
  useEffect(() => {
    const previousRpcReady = rpcReadyRef.current
    rpcReadyRef.current = isRpcAvailable
    const transition = resolveRpcAvailabilityTransition({
      ready,
      hasConfigPath: Boolean(configPathRef.current),
      previousRpcReady,
      isRpcAvailable,
    })

    if (transition.shouldScheduleLocalDemotion) {
      setConfigHash(null)
      const fallbackTimer = setTimeout(() => {
        if (!rpcReadyRef.current) {
          setMode('local')
          preferRpcOnNextLoadRef.current = false
        }
      }, RPC_DEMOTE_TO_LOCAL_MS)
      return () => {
        clearTimeout(fallbackTimer)
      }
    }

    if (transition.shouldReloadFromRpc) {
      void loadConfig(configPathRef.current)
    }
  }, [isRpcAvailable, loadConfig, ready])

  /**
   * 设置当前 server 绑定的配置路径。
   * @param path 目标路径。
   * @param options 额外参数。
   */
  const setConfigPathForCurrentServer = useCallback(async (
    path: string,
    options: { load?: boolean } = { load: true },
  ): Promise<boolean> => {
    const nextPath = path.trim()
    if (!nextPath) {
      setError('配置文件路径不能为空')
      return false
    }

    setError(null)
    setConfigPath(nextPath)
    setConfigPathMap(prev => ({
      ...prev,
      [activeServerKeyRef.current]: nextPath,
    }))

    if (options.load === false) return true
    return loadConfig(nextPath)
  }, [loadConfig])

  /**
   * 打开文件选择器并设置配置路径。
   */
  const pickConfigFile = useCallback(async (): Promise<string | null> => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        title: '选择 openclaw 配置文件',
        defaultPath: configPathRef.current || defaultConfigPath || undefined,
        filters: [{ name: 'JSON/JSON5', extensions: ['json', 'json5'] }],
        multiple: false,
        directory: false,
      })

      if (!selected || Array.isArray(selected)) {
        return null
      }

      const applied = await setConfigPathForCurrentServer(selected, { load: true })
      return applied ? selected : null
    } catch (dialogError) {
      setError(`打开文件选择器失败: ${toErrorText(dialogError)}`)
      return null
    }
  }, [defaultConfigPath, setConfigPathForCurrentServer])

  /**
   * 直接替换配置对象。
   * @param nextConfig 新配置对象。
   */
  const setConfig = useCallback((nextConfig: OpenClawConfig) => {
    setConfigState(normalizeRootConfig(nextConfig))
    setError(null)
  }, [])

  /**
   * 函数式更新配置对象。
   * @param updater 更新函数。
   */
  const updateConfig = useCallback((updater: (prev: OpenClawConfig) => OpenClawConfig) => {
    setConfigState(prev => normalizeRootConfig(updater(prev)))
    setError(null)
  }, [])

  /**
   * 还原配置到最近一次保存快照。
   */
  const revertConfig = useCallback(() => {
    const revertedConfig = parseSnapshot(savedSnapshotRef.current)
    const validation = validateOpenClawConfig(
      revertedConfig,
      resolveValidationSchema(remoteSchemaRef.current),
    )
    setConfigState(revertedConfig)
    setValidationIssues(validation.issues)
    setError(null)
  }, [])

  /**
   * 保存配置到本地文件。
   * @param path 配置文件路径。
   * @param currentConfig 当前配置对象。
   */
  const saveToLocal = useCallback(async (path: string, currentConfig: OpenClawConfig): Promise<void> => {
    const { dirname } = await import('@tauri-apps/api/path')
    const { mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs')
    const parentPath = await dirname(path)
    if (parentPath.trim()) {
      await mkdir(parentPath, { recursive: true })
    }
    await writeTextFile(path, JSON.stringify(currentConfig, null, 2))
  }, [])

  /**
   * 通过 RPC 保存配置。
   * @param currentConfig 当前配置对象。
   * @param options 保存选项。
   */
  const saveToRpc = useCallback(async (
    currentConfig: OpenClawConfig,
    options: SaveConfigOptions,
  ): Promise<void> => {
    const baseHash = toText(configHashRef.current)
    if (!baseHash) {
      throw new Error('缺少 baseHash，请先重新加载配置')
    }

    const writeMode = options.writeMode ?? 'patch'
    let nextHash = baseHash

    if (writeMode === 'apply') {
      const raw = JSON.stringify(currentConfig, null, 2)
      const result = await applyConfig(raw, baseHash)
      nextHash = result.hash ?? baseHash
    } else {
      const baseConfig = parseSnapshot(savedSnapshotRef.current)
      const mergePatch = createJsonMergePatch(baseConfig, currentConfig)
      if (mergePatch === undefined) {
        return
      }

      const raw = JSON.stringify(mergePatch, null, 2)
      const result = await patchConfig(raw, baseHash)
      nextHash = result.hash ?? baseHash
    }

    setMode('rpc')
    setConfigHash(nextHash)
  }, [applyConfig, patchConfig])

  /**
   * 保存配置（保存前执行 schema 校验）。
   * @param options 保存参数，支持 patch/apply。
   */
  const saveConfig = useCallback(async (
    options: SaveConfigOptions = {},
  ): Promise<boolean> => {
    const path = configPathRef.current.trim()
    const baseConfig = parseSnapshot(savedSnapshotRef.current)
    const currentConfig = applyProviderUserAgentOverride(baseConfig, configRef.current)
    const validation = validateOpenClawConfig(
      currentConfig,
      resolveValidationSchema(remoteSchemaRef.current),
    )
    setValidationIssues(validation.issues)

    if (!validation.valid) {
      setError('保存失败：配置校验未通过，请先修复表单错误')
      return false
    }

    if (!isRpcAvailable && !path) {
      setError('配置文件路径为空，无法保存')
      return false
    }

    setIsSaving(true)
    setError(null)

    try {
      if (isRpcAvailable) {
        await saveToRpc(currentConfig, options)
      } else {
        await saveToLocal(path, currentConfig)
        setMode('local')
        setConfigHash(null)
      }

      setConfigState(currentConfig)
      setSavedSnapshot(toSnapshot(currentConfig))
      return true
    } catch (saveError) {
      if (isConfigHashConflict(saveError)) {
        setError('保存失败：配置已被其他端修改，请重新加载后重试')
        setPendingReloadMessage('配置已被其他端修改，是否立即重新加载？')
        return false
      }

      const errorCode = getRpcErrorCode(saveError)
      if (errorCode === 'UNAVAILABLE') {
        const retryAfterMs = getRetryAfterMs(saveError)
        if (retryAfterMs && retryAfterMs > 0) {
          const seconds = Math.ceil(retryAfterMs / 1000)
          setError(`保存失败：Gateway 暂不可用，请约 ${seconds} 秒后重试`)
        } else {
          setError('保存失败：Gateway 暂不可用，请稍后重试')
        }
        return false
      }

      setError(`保存配置失败: ${toErrorText(saveError)}`)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [isRpcAvailable, saveToLocal, saveToRpc])

  const isDirty = useMemo(
    () => toSnapshot(config) !== savedSnapshot,
    [config, savedSnapshot],
  )

  /**
   * 确认重新加载配置。
   */
  const confirmReload = useCallback(async () => {
    setPendingReloadMessage(null)
    await loadConfig()
  }, [loadConfig])

  /**
   * 取消重新加载提示。
   */
  const dismissReload = useCallback(() => {
    setPendingReloadMessage(null)
  }, [])

  return {
    ready,
    mode,
    config,
    configPath,
    defaultConfigPath,
    validationIssues,
    isLoading,
    isSaving,
    isDirty,
    error,
    setConfig,
    updateConfig,
    loadConfig,
    saveConfig,
    revertConfig,
    pickConfigFile,
    setConfigPathForCurrentServer,
    pendingReloadMessage,
    confirmReload,
    dismissReload,
  }
}
