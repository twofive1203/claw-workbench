import { useCallback, useEffect, useMemo, useState } from 'react'
import { Clock3, FileText, Loader2, Network, RefreshCw, Wrench } from 'lucide-react'
import type { RpcCaller } from '../../../hooks/useConfigRpc'
import { toText } from '../../../lib/parsers'
import { isRecord } from '../../../types/config'

type AgentRuntimeTabId = 'files' | 'tools' | 'channels' | 'cron'

interface RuntimeTabOption {
  id: AgentRuntimeTabId
  label: string
}

const RUNTIME_TABS: RuntimeTabOption[] = [
  { id: 'files', label: 'Files' },
  { id: 'tools', label: 'Tools' },
  { id: 'channels', label: 'Channels' },
  { id: 'cron', label: 'Cron Jobs' },
]

/**
 * Agent 运行态文件条目。
 * @param name 文件名。
 * @param path 文件路径。
 * @param missing 是否缺失。
 * @param size 文件大小（字节）。
 * @param updatedAtMs 更新时间戳（毫秒）。
 * @param content 文件内容。
 */
interface AgentRuntimeFileEntry {
  name: string
  path?: string
  missing: boolean
  size?: number
  updatedAtMs?: number
  content?: string
}

/**
 * Tool profile 条目。
 * @param id profile id。
 * @param label profile 展示名。
 */
interface ToolProfileItem {
  id: string
  label: string
}

/**
 * Tool 条目。
 * @param id tool id。
 * @param label tool 展示名。
 * @param description tool 描述。
 * @param source 来源（core/plugin）。
 * @param pluginId 插件 id。
 * @param defaultProfiles 默认 profile 列表。
 */
interface ToolItem {
  id: string
  label: string
  description: string
  source: string
  pluginId?: string
  defaultProfiles: string[]
}

/**
 * Tool 分组条目。
 * @param id 分组 id。
 * @param label 分组展示名。
 * @param source 来源（core/plugin）。
 * @param pluginId 插件 id。
 * @param tools 分组内工具列表。
 */
interface ToolGroupItem {
  id: string
  label: string
  source: string
  pluginId?: string
  tools: ToolItem[]
}

/**
 * Channel 账号行。
 * @param channelId 通道 id。
 * @param channelLabel 通道名称。
 * @param accountId 账号 id。
 * @param name 账号展示名。
 * @param connected 是否已连接。
 * @param configured 是否已配置。
 * @param enabled 是否启用。
 * @param dmPolicy 私聊策略。
 * @param groupPolicy 群聊策略。
 * @param lastError 最近错误信息。
 */
interface ChannelAccountRow {
  channelId: string
  channelLabel: string
  accountId: string
  name?: string
  connected?: boolean
  configured?: boolean
  enabled?: boolean
  dmPolicy?: string
  groupPolicy?: string
  lastError?: string
}

/**
 * Cron 调度状态。
 * @param enabled 是否启用调度器。
 * @param jobs 任务数量。
 * @param nextWakeAtMs 下次唤醒时间戳（毫秒）。
 */
interface CronSchedulerStatus {
  enabled?: boolean
  jobs?: number
  nextWakeAtMs?: number
}

/**
 * Cron 任务行。
 * @param id 任务 id。
 * @param name 任务名称。
 * @param description 任务描述。
 * @param enabled 是否启用。
 * @param agentId 目标 agent id。
 * @param scheduleText 日程文本。
 * @param nextRunAtMs 下次运行时间戳（毫秒）。
 */
interface CronJobRow {
  id: string
  name: string
  description?: string
  enabled: boolean
  agentId?: string
  scheduleText: string
  nextRunAtMs?: number
}

/**
 * Agent 运行态分区属性。
 * @param agentId 当前 agent id。
 * @param callRpc RPC 调用器。
 * @param isConnected 是否已连接 Gateway。
 * @author towfive
 */
interface AgentRuntimeSectionProps {
  agentId: string
  callRpc: RpcCaller
  isConnected: boolean
}

/**
 * 将 unknown 转为有限数字。
 * @param value 原始值。
 */
function toNumber(value: unknown): number | undefined {
  if (typeof value !== 'number') return undefined
  if (!Number.isFinite(value)) return undefined
  return value
}

/**
 * 将 unknown 转为布尔值。
 * @param value 原始值。
 */
function toBoolean(value: unknown): boolean | undefined {
  if (typeof value !== 'boolean') return undefined
  return value
}

/**
 * 格式化时间戳。
 * @param timestamp 时间戳（毫秒）。
 */
function formatDateTime(timestamp?: number): string {
  if (typeof timestamp !== 'number') return 'n/a'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'n/a'
  return date.toLocaleString()
}

/**
 * 格式化文件大小。
 * @param bytes 字节数。
 */
function formatBytes(bytes?: number): string {
  if (typeof bytes !== 'number' || bytes < 0) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 规范化文件条目。
 * @param value 原始条目。
 */
function normalizeRuntimeFileEntry(value: unknown): AgentRuntimeFileEntry | null {
  if (!isRecord(value)) return null
  const name = toText(value.name)
  if (!name) return null

  return {
    name,
    path: toText(value.path) ?? undefined,
    missing: value.missing === true,
    size: toNumber(value.size),
    updatedAtMs: toNumber(value.updatedAtMs),
    content: typeof value.content === 'string' ? value.content : undefined,
  }
}

/**
 * 提取工具目录数据。
 * @param payload 原始 tools.catalog 响应。
 */
function normalizeToolCatalog(payload: unknown): {
  profiles: ToolProfileItem[]
  groups: ToolGroupItem[]
} {
  if (!isRecord(payload)) {
    return { profiles: [], groups: [] }
  }

  const profilesRaw = Array.isArray(payload.profiles) ? payload.profiles : []
  const groupsRaw = Array.isArray(payload.groups) ? payload.groups : []

  const profiles = profilesRaw
    .map((item): ToolProfileItem | null => {
      if (!isRecord(item)) return null
      const id = toText(item.id)
      const label = toText(item.label)
      if (!id || !label) return null
      return { id, label }
    })
    .filter((item): item is ToolProfileItem => item !== null)

  const groups = groupsRaw
    .map((item): ToolGroupItem | null => {
      if (!isRecord(item)) return null
      const id = toText(item.id)
      const label = toText(item.label)
      const source = toText(item.source)
      if (!id || !label || !source) return null

      const toolsRaw = Array.isArray(item.tools) ? item.tools : []
      const tools = toolsRaw
        .map((toolItem): ToolItem | null => {
          if (!isRecord(toolItem)) return null
          const toolId = toText(toolItem.id)
          const toolLabel = toText(toolItem.label)
          const toolSource = toText(toolItem.source)
          if (!toolId || !toolLabel || !toolSource) return null
          return {
            id: toolId,
            label: toolLabel,
            description: typeof toolItem.description === 'string' ? toolItem.description : '',
            source: toolSource,
            pluginId: toText(toolItem.pluginId) ?? undefined,
            defaultProfiles: Array.isArray(toolItem.defaultProfiles)
              ? toolItem.defaultProfiles
                .map(profile => toText(profile))
                .filter((profile): profile is string => Boolean(profile))
              : [],
          }
        })
        .filter((tool): tool is ToolItem => tool !== null)

      return {
        id,
        label,
        source,
        pluginId: toText(item.pluginId) ?? undefined,
        tools,
      }
    })
    .filter((item): item is ToolGroupItem => item !== null)

  return { profiles, groups }
}

/**
 * 提取通道账号行数据。
 * @param payload 原始 channels.status 响应。
 */
function normalizeChannelRows(payload: unknown): ChannelAccountRow[] {
  if (!isRecord(payload)) return []
  const channelLabels = isRecord(payload.channelLabels) ? payload.channelLabels : {}
  const channelAccounts = isRecord(payload.channelAccounts) ? payload.channelAccounts : {}
  const channelsMeta = isRecord(payload.channels) ? payload.channels : {}
  const rows: ChannelAccountRow[] = []

  for (const [channelId, accountsValue] of Object.entries(channelAccounts)) {
    if (!Array.isArray(accountsValue)) continue
    const label = toText(channelLabels[channelId]) ?? channelId
    const channelMeta = isRecord(channelsMeta[channelId]) ? channelsMeta[channelId] : {}

    for (const accountValue of accountsValue) {
      if (!isRecord(accountValue)) continue
      const accountId = toText(accountValue.accountId) ?? 'default'
      rows.push({
        channelId,
        channelLabel: label,
        accountId,
        name: toText(accountValue.name) ?? undefined,
        connected: toBoolean(accountValue.connected),
        configured: toBoolean(accountValue.configured),
        enabled: toBoolean(accountValue.enabled),
        dmPolicy: toText(accountValue.dmPolicy) ?? toText(channelMeta.dmPolicy) ?? undefined,
        groupPolicy: toText(accountValue.groupPolicy) ?? toText(channelMeta.groupPolicy) ?? undefined,
        lastError: toText(accountValue.lastError) ?? undefined,
      })
    }
  }

  rows.sort((a, b) => {
    const channelCompare = a.channelLabel.localeCompare(b.channelLabel)
    if (channelCompare !== 0) return channelCompare
    return a.accountId.localeCompare(b.accountId)
  })

  return rows
}

/**
 * 将 cron schedule 对象格式化为文本。
 * @param schedule 原始 schedule 字段。
 */
function formatCronSchedule(schedule: unknown): string {
  if (!isRecord(schedule)) {
    return toText(schedule) ?? '-'
  }

  const kind = toText(schedule.kind)
  if (kind === 'cron') {
    return `cron: ${toText(schedule.expr) ?? '-'}`
  }
  if (kind === 'at') {
    return `at: ${toText(schedule.at) ?? '-'}`
  }
  if (kind === 'every') {
    const everyMs = toNumber(schedule.everyMs)
    if (typeof everyMs !== 'number') return 'every'
    if (everyMs % 3_600_000 === 0) return `every ${everyMs / 3_600_000}h`
    if (everyMs % 60_000 === 0) return `every ${everyMs / 60_000}m`
    if (everyMs % 1000 === 0) return `every ${everyMs / 1000}s`
    return `every ${everyMs}ms`
  }

  return kind ?? '-'
}

/**
 * 规范化 cron 任务行。
 * @param value 原始任务对象。
 */
function normalizeCronJobRow(value: unknown): CronJobRow | null {
  if (!isRecord(value)) return null
  const id = toText(value.id) ?? toText(value.jobId)
  if (!id) return null

  const state = isRecord(value.state) ? value.state : {}
  return {
    id,
    name: toText(value.name) ?? toText(value.label) ?? id,
    description: toText(value.description) ?? undefined,
    enabled: value.enabled === true,
    agentId: toText(value.agentId) ?? undefined,
    scheduleText: formatCronSchedule(value.schedule),
    nextRunAtMs: toNumber(state.nextRunAtMs) ?? toNumber(value.nextRunAtMs),
  }
}

/**
 * 规范化 cron 调度状态。
 * @param value 原始 cron.status 响应。
 */
function normalizeCronSchedulerStatus(value: unknown): CronSchedulerStatus {
  if (!isRecord(value)) return {}
  const scheduler = isRecord(value.scheduler) ? value.scheduler : {}
  return {
    enabled: toBoolean(value.enabled) ?? toBoolean(scheduler.enabled),
    jobs: toNumber(value.jobs) ?? toNumber(scheduler.jobs),
    nextWakeAtMs: toNumber(value.nextWakeAtMs) ?? toNumber(scheduler.nextWakeAtMs),
  }
}

/**
 * Agent 运行态分区组件。
 * @param props 组件属性。
 */
export function AgentRuntimeSection(props: AgentRuntimeSectionProps) {
  const { agentId, callRpc, isConnected } = props
  const [activeTab, setActiveTab] = useState<AgentRuntimeTabId>('files')

  const [files, setFiles] = useState<AgentRuntimeFileEntry[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const [selectedFileContent, setSelectedFileContent] = useState<string>('')
  const [selectedFileLoading, setSelectedFileLoading] = useState(false)

  const [toolProfiles, setToolProfiles] = useState<ToolProfileItem[]>([])
  const [toolGroups, setToolGroups] = useState<ToolGroupItem[]>([])
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsError, setToolsError] = useState<string | null>(null)

  const [channelRows, setChannelRows] = useState<ChannelAccountRow[]>([])
  const [channelsLoading, setChannelsLoading] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [channelsLastRefreshMs, setChannelsLastRefreshMs] = useState<number | null>(null)

  const [cronStatus, setCronStatus] = useState<CronSchedulerStatus>({})
  const [cronJobs, setCronJobs] = useState<CronJobRow[]>([])
  const [cronLoading, setCronLoading] = useState(false)
  const [cronError, setCronError] = useState<string | null>(null)

  /**
   * 加载 Agent 文件列表。
   */
  const loadFiles = useCallback(async () => {
    if (!isConnected || !agentId) return
    setFilesLoading(true)
    setFilesError(null)
    try {
      const payload = await callRpc<{ files?: unknown[] }>('agents.files.list', { agentId })
      const rows = Array.isArray(payload.files) ? payload.files : []
      const nextFiles = rows
        .map(item => normalizeRuntimeFileEntry(item))
        .filter((item): item is AgentRuntimeFileEntry => item !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
      setFiles(nextFiles)

      if (nextFiles.length === 0) {
        setSelectedFileName(null)
        setSelectedFileContent('')
        return
      }

      const hasSelected = selectedFileName
        ? nextFiles.some(item => item.name === selectedFileName)
        : false
      if (!hasSelected) {
        setSelectedFileName(nextFiles[0]?.name ?? null)
      }
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : String(error))
      setFiles([])
      setSelectedFileName(null)
      setSelectedFileContent('')
    } finally {
      setFilesLoading(false)
    }
  }, [agentId, callRpc, isConnected, selectedFileName])

  /**
   * 加载指定 Agent 文件内容。
   * @param fileName 目标文件名。
   */
  const loadFileContent = useCallback(async (fileName: string) => {
    if (!isConnected || !agentId) return
    setSelectedFileLoading(true)
    setFilesError(null)
    try {
      const payload = await callRpc<{ file?: unknown }>('agents.files.get', {
        agentId,
        name: fileName,
      })
      const file = normalizeRuntimeFileEntry(payload.file)
      setSelectedFileContent(file?.content ?? '')
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : String(error))
      setSelectedFileContent('')
    } finally {
      setSelectedFileLoading(false)
    }
  }, [agentId, callRpc, isConnected])

  /**
   * 加载工具目录数据。
   */
  const loadTools = useCallback(async () => {
    if (!isConnected || !agentId) return
    setToolsLoading(true)
    setToolsError(null)
    try {
      const payload = await callRpc<unknown>('tools.catalog', {
        agentId,
        includePlugins: true,
      })
      const catalog = normalizeToolCatalog(payload)
      setToolProfiles(catalog.profiles)
      setToolGroups(catalog.groups)
    } catch (error) {
      setToolsError(error instanceof Error ? error.message : String(error))
      setToolProfiles([])
      setToolGroups([])
    } finally {
      setToolsLoading(false)
    }
  }, [agentId, callRpc, isConnected])

  /**
   * 加载通道状态快照。
   */
  const loadChannels = useCallback(async () => {
    if (!isConnected) return
    setChannelsLoading(true)
    setChannelsError(null)
    try {
      const payload = await callRpc<unknown>('channels.status', {
        probe: false,
        timeoutMs: 1500,
      })
      setChannelRows(normalizeChannelRows(payload))
      setChannelsLastRefreshMs(Date.now())
    } catch (error) {
      setChannelsError(error instanceof Error ? error.message : String(error))
      setChannelRows([])
    } finally {
      setChannelsLoading(false)
    }
  }, [callRpc, isConnected])

  /**
   * 加载 Cron 状态与任务列表。
   */
  const loadCron = useCallback(async () => {
    if (!isConnected || !agentId) return
    setCronLoading(true)
    setCronError(null)
    try {
      const [statusPayload, listPayload] = await Promise.all([
        callRpc<unknown>('cron.status', {}),
        callRpc<{ jobs?: unknown[] }>('cron.list', {}),
      ])
      setCronStatus(normalizeCronSchedulerStatus(statusPayload))

      const rows = Array.isArray(listPayload.jobs) ? listPayload.jobs : []
      const nextJobs = rows
        .map(item => normalizeCronJobRow(item))
        .filter((item): item is CronJobRow => item !== null && item.agentId === agentId)
        .sort((a, b) => (a.nextRunAtMs ?? Number.MAX_SAFE_INTEGER) - (b.nextRunAtMs ?? Number.MAX_SAFE_INTEGER))
      setCronJobs(nextJobs)
    } catch (error) {
      setCronError(error instanceof Error ? error.message : String(error))
      setCronStatus({})
      setCronJobs([])
    } finally {
      setCronLoading(false)
    }
  }, [agentId, callRpc, isConnected])

  /**
   * 刷新当前激活的运行态分区。
   */
  const refreshActiveTab = useCallback(() => {
    if (activeTab === 'files') {
      void loadFiles()
      return
    }
    if (activeTab === 'tools') {
      void loadTools()
      return
    }
    if (activeTab === 'channels') {
      void loadChannels()
      return
    }
    void loadCron()
  }, [activeTab, loadChannels, loadCron, loadFiles, loadTools])

  /**
   * Agent 切换后重置运行态缓存。
   */
  useEffect(() => {
    setFiles([])
    setFilesError(null)
    setSelectedFileName(null)
    setSelectedFileContent('')
    setToolProfiles([])
    setToolGroups([])
    setToolsError(null)
    setChannelRows([])
    setChannelsError(null)
    setChannelsLastRefreshMs(null)
    setCronStatus({})
    setCronJobs([])
    setCronError(null)
  }, [agentId])

  /**
   * 切换分区时按需加载数据。
   */
  useEffect(() => {
    refreshActiveTab()
  }, [refreshActiveTab])

  /**
   * 文件选择变化时加载文件内容。
   */
  useEffect(() => {
    if (activeTab !== 'files') return
    if (!selectedFileName) return
    void loadFileContent(selectedFileName)
  }, [activeTab, loadFileContent, selectedFileName])

  const selectedFile = useMemo(
    () => (selectedFileName ? files.find(item => item.name === selectedFileName) ?? null : null),
    [files, selectedFileName],
  )

  const channelSummary = useMemo(() => {
    const connected = channelRows.filter(item => item.connected).length
    const configured = channelRows.filter(item => item.configured).length
    const enabled = channelRows.filter(item => item.enabled).length
    return {
      connected,
      configured,
      enabled,
    }
  }, [channelRows])

  const showUnavailable = !isConnected

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-medium text-gray-300">Agent 运行时详情</div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:border-gray-600 disabled:opacity-60"
          onClick={refreshActiveTab}
          disabled={showUnavailable}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {RUNTIME_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={`inline-flex items-center rounded-full border px-3 py-1 text-xs ${
              activeTab === tab.id
                ? 'border-blue-500/60 bg-blue-500/10 text-blue-100'
                : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showUnavailable && (
        <div className="rounded-md border border-yellow-900/60 bg-yellow-950/40 px-2.5 py-2 text-xs text-yellow-200">
          当前为本地模式或未连接 Gateway，运行态数据不可用。
        </div>
      )}

      {activeTab === 'files' && (
        <div className="grid min-h-56 grid-cols-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2">
            <div className="mb-2 flex items-center justify-between">
              <div className="inline-flex items-center gap-1 text-xs text-gray-300">
                <FileText className="h-3.5 w-3.5" />
                文件列表
              </div>
              {filesLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
            </div>
            {filesError && (
              <div className="mb-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
                {filesError}
              </div>
            )}
            <div className="space-y-1.5">
              {files.length === 0 && !filesLoading ? (
                <div className="rounded border border-dashed border-gray-700 px-2 py-3 text-center text-xs text-gray-500">
                  暂无文件
                </div>
              ) : (
                files.map(file => (
                  <button
                    key={file.name}
                    type="button"
                    className={`w-full rounded border px-2 py-1.5 text-left ${
                      selectedFileName === file.name
                        ? 'border-blue-500/60 bg-blue-500/10'
                        : 'border-gray-700 bg-gray-900/40 hover:border-gray-600'
                    }`}
                    onClick={() => setSelectedFileName(file.name)}
                  >
                    <div className="truncate text-xs text-gray-200">{file.name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {formatBytes(file.size)}
                      {' · '}
                      {file.missing ? 'missing' : 'ok'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2">
            {!selectedFile ? (
              <div className="flex h-full min-h-48 items-center justify-center text-sm text-gray-500">
                请选择左侧文件
              </div>
            ) : (
              <div className="flex h-full min-h-48 flex-col">
                <div className="mb-2 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-gray-200">{selectedFile.name}</div>
                    <div className="mt-0.5 text-[11px] text-gray-500">
                      {selectedFile.path ?? '-'}
                      {' · '}
                      更新于
                      {' '}
                      {formatDateTime(selectedFile.updatedAtMs)}
                    </div>
                  </div>
                  {selectedFileLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                </div>
                <pre className="min-h-0 flex-1 overflow-auto rounded border border-gray-700 bg-gray-900 p-2 text-[11px] leading-relaxed text-gray-200">
                  {selectedFileContent || '该文件暂无内容或网关未返回内容。'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'tools' && (
        <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="inline-flex items-center gap-1 text-xs text-gray-300">
              <Wrench className="h-3.5 w-3.5" />
              工具目录
            </div>
            {toolsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          {toolsError && (
            <div className="mb-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
              {toolsError}
            </div>
          )}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {toolProfiles.map(profile => (
              <span
                key={profile.id}
                className="rounded-full border border-gray-700 bg-gray-900 px-2 py-0.5 text-[11px] text-gray-300"
              >
                {profile.label}
              </span>
            ))}
          </div>
          {toolGroups.length === 0 && !toolsLoading ? (
            <div className="rounded border border-dashed border-gray-700 px-2 py-3 text-center text-xs text-gray-500">
              暂无工具目录数据
            </div>
          ) : (
            <div className="space-y-2">
              {toolGroups.map(group => (
                <div key={group.id} className="rounded border border-gray-700 bg-gray-900/40 p-2">
                  <div className="mb-1 text-xs font-medium text-gray-200">
                    {group.label}
                    {' '}
                    <span className="text-gray-500">({group.tools.length})</span>
                  </div>
                  <div className="space-y-1">
                    {group.tools.map(tool => (
                      <div key={tool.id} className="rounded border border-gray-800 bg-gray-950/50 px-2 py-1.5">
                        <div className="text-[11px] text-gray-200">
                          {tool.label}
                          {' '}
                          <span className="text-gray-500">[{tool.id}]</span>
                        </div>
                        {tool.description && (
                          <div className="mt-0.5 text-[11px] text-gray-500">{tool.description}</div>
                        )}
                        {tool.defaultProfiles.length > 0 && (
                          <div className="mt-0.5 text-[10px] text-gray-500">
                            默认 profile:
                            {' '}
                            {tool.defaultProfiles.join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'channels' && (
        <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="inline-flex items-center gap-1 text-xs text-gray-300">
              <Network className="h-3.5 w-3.5" />
              通道快照
            </div>
            {channelsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          <div className="mb-2 text-[11px] text-gray-500">
            Last refresh:
            {' '}
            {channelsLastRefreshMs ? formatDateTime(channelsLastRefreshMs) : 'n/a'}
          </div>
          {channelsError && (
            <div className="mb-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
              {channelsError}
            </div>
          )}
          <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5 text-xs text-gray-200">
              连接中:
              {' '}
              {channelSummary.connected}
            </div>
            <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5 text-xs text-gray-200">
              已配置:
              {' '}
              {channelSummary.configured}
            </div>
            <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5 text-xs text-gray-200">
              已启用:
              {' '}
              {channelSummary.enabled}
            </div>
          </div>
          {channelRows.length === 0 && !channelsLoading ? (
            <div className="rounded border border-dashed border-gray-700 px-2 py-3 text-center text-xs text-gray-500">
              暂无通道账号数据
            </div>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-700">
              <table className="min-w-[760px] table-fixed border-collapse text-[11px] text-gray-200">
                <thead className="bg-gray-900/70 text-gray-400">
                  <tr>
                    <th className="border-b border-gray-700 px-2 py-1 text-left">Channel</th>
                    <th className="border-b border-gray-700 px-2 py-1 text-left">Account</th>
                    <th className="border-b border-gray-700 px-2 py-1 text-left">Connected</th>
                    <th className="border-b border-gray-700 px-2 py-1 text-left">Configured</th>
                    <th className="border-b border-gray-700 px-2 py-1 text-left">Enabled</th>
                    <th className="border-b border-gray-700 px-2 py-1 text-left">Policy</th>
                  </tr>
                </thead>
                <tbody>
                  {channelRows.map(row => (
                    <tr key={`${row.channelId}:${row.accountId}`}>
                      <td className="border-b border-gray-800 px-2 py-1.5">
                        <div>{row.channelLabel}</div>
                        <div className="text-gray-500">{row.channelId}</div>
                      </td>
                      <td className="border-b border-gray-800 px-2 py-1.5">
                        <div>{row.accountId}</div>
                        {row.name && <div className="text-gray-500">{row.name}</div>}
                      </td>
                      <td className="border-b border-gray-800 px-2 py-1.5">{row.connected ? 'yes' : 'no'}</td>
                      <td className="border-b border-gray-800 px-2 py-1.5">{row.configured ? 'yes' : 'no'}</td>
                      <td className="border-b border-gray-800 px-2 py-1.5">{row.enabled ? 'yes' : 'no'}</td>
                      <td className="border-b border-gray-800 px-2 py-1.5 text-gray-300">
                        dm:
                        {' '}
                        {row.dmPolicy ?? '-'}
                        {' | '}
                        group:
                        {' '}
                        {row.groupPolicy ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'cron' && (
        <div className="space-y-2 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
          <div className="mb-2 flex items-center justify-between">
            <div className="inline-flex items-center gap-1 text-xs text-gray-300">
              <Clock3 className="h-3.5 w-3.5" />
              调度状态
            </div>
            {cronLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
          {cronError && (
            <div className="mb-2 rounded border border-red-900/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
              {cronError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5 text-xs text-gray-200">
              ENABLED:
              {' '}
              {cronStatus.enabled === undefined ? 'n/a' : (cronStatus.enabled ? 'Yes' : 'No')}
            </div>
            <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5 text-xs text-gray-200">
              JOBS:
              {' '}
              {cronStatus.jobs ?? 'n/a'}
            </div>
            <div className="rounded border border-gray-700 bg-gray-900/40 px-2 py-1.5 text-xs text-gray-200">
              NEXT WAKE:
              {' '}
              {formatDateTime(cronStatus.nextWakeAtMs)}
            </div>
          </div>

          <div className="mt-2 rounded border border-gray-700 bg-gray-900/40 p-2">
            <div className="mb-2 text-xs text-gray-300">
              Agent Cron Jobs (
              {cronJobs.length}
              )
            </div>
            {cronJobs.length === 0 && !cronLoading ? (
              <div className="text-xs text-gray-500">No jobs assigned.</div>
            ) : (
              <div className="space-y-1.5">
                {cronJobs.map(job => (
                  <div key={job.id} className="rounded border border-gray-700 bg-gray-950/50 px-2 py-1.5 text-[11px]">
                    <div className="text-gray-200">
                      {job.name}
                      {' '}
                      <span className="text-gray-500">[{job.id}]</span>
                    </div>
                    <div className="text-gray-400">
                      {job.scheduleText}
                      {' · '}
                      next:
                      {' '}
                      {formatDateTime(job.nextRunAtMs)}
                      {' · '}
                      {job.enabled ? 'enabled' : 'disabled'}
                    </div>
                    {job.description && (
                      <div className="mt-0.5 text-gray-500">{job.description}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
