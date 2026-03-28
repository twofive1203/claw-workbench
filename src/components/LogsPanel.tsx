import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Search, X } from 'lucide-react'
import type { LogsTailParams, LogsTailResult } from '../types'
import { isRecord, toOptionalText } from '../lib/parsers'
import { cn } from '../lib/utils'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

const INITIAL_LIMIT = 200
const POLL_LIMIT = 120
const POLL_INTERVAL_MS = 5000
const MAX_BYTES = 256 * 1024
const MAX_LINES = 3000

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
type LogLevelFilter = 'all' | LogLevel
type LogViewMode = 'table' | 'json'

/**
 * 日志面板属性。
 * @param isConnected 当前网关连接状态。
 * @param supportsLogsTail 当前网关是否支持 logs.tail。
 * @param tailLogs logs.tail 调用方法。
 * @param onClose 关闭面板回调。
 * @author towfive
 */
interface LogsPanelProps {
  isConnected: boolean
  supportsLogsTail: boolean
  tailLogs: (params: LogsTailParams) => Promise<LogsTailResult>
  onClose: () => void
}

/**
 * 解析后的日志条目。
 * @param raw 原始日志行。
 * @param ts 日志时间戳（毫秒）。
 * @param level 归一化日志级别。
 * @param subsystem 日志子系统（OpenClaw 特有）。
 * @param module 日志模块名（如存在）。
 * @param message 日志正文。
 * @param location 日志输出位置（如存在）。
 */
interface ParsedLogEntry {
  raw: string
  ts?: number
  level: LogLevel | 'unknown'
  subsystem?: string
  module?: string
  message: string
  location?: string
}

/**
 * OpenClaw `_meta.name` 解析结果。
 * @param subsystem 子系统名称。
 * @param module 模块名称。
 */
interface ParsedMetaName {
  subsystem?: string
  module?: string
}

/**
 * 归一化日志级别文本。
 * @param value 原始日志级别。
 */
function normalizeLogLevel(value: unknown): LogLevel | 'unknown' {
  if (typeof value !== 'string') return 'unknown'
  const next = value.trim().toLowerCase()
  if (next === 'warning') return 'warn'
  if (next === 'err') return 'error'
  if (next === 'trace' || next === 'debug' || next === 'info' || next === 'warn' || next === 'error' || next === 'fatal') {
    return next
  }
  return 'unknown'
}

/**
 * 解析日志时间戳（自动兼容秒/毫秒/ISO 字符串）。
 * @param value 原始时间值。
 */
function toTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000
  }
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000
    }
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

/**
 * 从对象中提取第一个有效字符串字段。
 * @param obj 源对象。
 * @param keys 候选字段名列表。
 */
function pickTextField(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const text = toOptionalText(obj[key])
    if (text) return text
  }
  return undefined
}

/**
 * 按顺序提取日志对象中的数字索引字段（0、1、2...）。
 * @param value 原始日志对象。
 */
function extractIndexedMessageParts(value: Record<string, unknown>): string[] {
  const numericKeys = Object.keys(value)
    .filter(key => /^\d+$/.test(key))
    .sort((a, b) => Number(a) - Number(b))
  const parts: string[] = []
  for (const key of numericKeys) {
    const item = value[key]
    if (typeof item === 'string') {
      const trimmed = item.trim()
      if (trimmed) parts.push(trimmed)
      continue
    }
    if (item !== null && item !== undefined) {
      parts.push(JSON.stringify(item))
    }
  }
  return parts
}

/**
 * 解析 OpenClaw 日志中的 `_meta.name` 字段。
 * @param rawName `_meta.name` 原始值。
 */
function parseMetaName(rawName: unknown): ParsedMetaName {
  if (typeof rawName !== 'string') return {}
  try {
    const parsed: unknown = JSON.parse(rawName)
    if (!isRecord(parsed)) return {}
    return {
      subsystem: toOptionalText(parsed.subsystem),
      module: toOptionalText(parsed.module),
    }
  } catch {
    return {}
  }
}

/**
 * 尝试从内联 JSON 文本中提取 subsystem/module。
 * @param text 候选文本，常见于日志字段 `0`。
 */
function parseInlineMetaText(text: string | undefined): ParsedMetaName {
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) return {}
    return {
      subsystem: toOptionalText(parsed.subsystem),
      module: toOptionalText(parsed.module),
    }
  } catch {
    return {}
  }
}

/**
 * 将原始日志行解析为结构化条目。
 * @param raw 原始日志行。
 */
function parseLogEntry(raw: string): ParsedLogEntry {
  const plainFallback: ParsedLogEntry = {
    raw,
    level: normalizeLogLevel(raw.match(/\b(trace|debug|info|warn|warning|error|fatal|err)\b/i)?.[1]),
    message: raw,
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return plainFallback

    const meta = isRecord(parsed._meta) ? parsed._meta : undefined
    const indexedMessageParts = extractIndexedMessageParts(parsed)
    const nameMeta = parseMetaName(meta?.name)
    const inlineMeta = parseInlineMetaText(indexedMessageParts[0])
    const pathMeta = isRecord(meta?.path) ? meta.path : undefined

    const level = normalizeLogLevel(meta?.logLevelName ?? parsed.level ?? parsed.severity ?? parsed.lvl)
    const subsystem = nameMeta.subsystem
      ?? inlineMeta.subsystem
      ?? pickTextField(parsed, ['subsystem', 'source', 'logger', 'target', 'component'])
    const module = nameMeta.module ?? inlineMeta.module ?? pickTextField(parsed, ['module'])

    const rawMetaName = toOptionalText(meta?.name)
    const normalizedIndexedParts = indexedMessageParts.filter((part, index) => {
      if (index !== 0) return true
      if (rawMetaName && part === rawMetaName) return false
      const parsedInline = parseInlineMetaText(part)
      if ((parsedInline.subsystem || parsedInline.module) && indexedMessageParts.length > 1) return false
      return true
    })

    const message = normalizedIndexedParts.join(' ')
      || pickTextField(parsed, ['message', 'msg', 'text', 'line', 'event'])
      || raw
    const ts = toTimestamp(parsed.time ?? meta?.date ?? parsed.ts ?? parsed.timestamp ?? parsed.t)
    const location = pathMeta
      ? pickTextField(pathMeta, ['fileNameWithLine', 'filePathWithLine', 'fullFilePath', 'fileName'])
      : undefined

    return {
      raw,
      ts,
      level,
      subsystem,
      module,
      message,
      location,
    }
  } catch {
    return plainFallback
  }
}

/**
 * 格式化日志时间。
 * @param timestamp 时间戳（毫秒）。
 */
function formatLogTime(timestamp?: number): string {
  if (typeof timestamp !== 'number') return '--:--:--'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

/**
 * 格式化字节大小。
 * @param size 字节数。
 */
function formatBytes(size?: number | null): string {
  if (typeof size !== 'number' || size < 0) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 生成导出文件名。
 */
function buildExportFileName(): string {
  const date = new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const ss = String(date.getSeconds()).padStart(2, '0')
  return `openclaw-logs-${y}${m}${d}-${hh}${mm}${ss}.log`
}

/**
 * 根据级别返回文本颜色类名。
 * @param level 日志级别。
 */
function getLevelClass(level: ParsedLogEntry['level']): string {
  if (level === 'trace') return 'text-[var(--color-gray-400)]'
  if (level === 'debug') return 'text-[var(--color-blue-300)]'
  if (level === 'info') return 'text-[var(--color-green-300)]'
  if (level === 'warn') return 'text-[var(--color-amber-300)]'
  if (level === 'error' || level === 'fatal') return 'text-[var(--color-red-300)]'
  return 'text-[var(--color-gray-500)]'
}

/**
 * 将原始日志行格式化为可读 JSON 文本。
 * @param raw 原始日志行。
 */
function formatRawJsonLine(raw: string): string {
  try {
    const parsed: unknown = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

/**
 * 日志查看面板。
 * @param props 组件属性。
 */
export function LogsPanel(props: LogsPanelProps) {
  const { isConnected, supportsLogsTail, tailLogs, onClose } = props

  const [rawLines, setRawLines] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all')
  const [subsystemFilter, setSubsystemFilter] = useState('all')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [viewMode, setViewMode] = useState<LogViewMode>('table')
  const [isLoading, setIsLoading] = useState(false)
  const [isPolling, setIsPolling] = useState(false)
  const [autoFollow, setAutoFollow] = useState(true)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [logFile, setLogFile] = useState<string | null>(null)
  const [logSize, setLogSize] = useState<number | null>(null)
  const [isTruncated, setIsTruncated] = useState(false)
  const [lastResetAt, setLastResetAt] = useState<number | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)

  const cursorRef = useRef<string | null>(null)
  const inFlightRef = useRef(false)
  const requestSeqRef = useRef(0)
  const listContainerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useLocalizedSubtree(panelRef)

  /**
   * 拉取日志尾部。
   * @param mode 拉取模式（初始化/轮询/手动刷新）。
   */
  const fetchLogs = useCallback(async (mode: 'initial' | 'poll' | 'refresh') => {
    if (!isConnected || !supportsLogsTail) return
    if (inFlightRef.current) return
    inFlightRef.current = true

    const currentReq = requestSeqRef.current + 1
    requestSeqRef.current = currentReq

    const isPollingMode = mode === 'poll'
    if (isPollingMode) {
      setIsPolling(true)
    } else {
      setIsLoading(true)
    }

    try {
      const params: LogsTailParams = {
        limit: isPollingMode ? POLL_LIMIT : INITIAL_LIMIT,
        maxBytes: MAX_BYTES,
      }
      if (isPollingMode && cursorRef.current) {
        params.cursor = cursorRef.current
      }

      const result = await tailLogs(params)
      if (requestSeqRef.current !== currentReq) return

      const incoming = Array.isArray(result.lines) ? result.lines : []
      const nextCursor = toOptionalText(result.cursor)
      if (nextCursor) cursorRef.current = nextCursor

      setLogFile(toOptionalText(result.file) ?? null)
      setLogSize(typeof result.size === 'number' ? result.size : null)
      setIsTruncated(result.truncated === true)
      setLastUpdatedAt(Date.now())
      setErrorText(null)

      if (result.reset === true) {
        setLastResetAt(Date.now())
        const resetLines = incoming.length > MAX_LINES ? incoming.slice(incoming.length - MAX_LINES) : incoming
        setRawLines(resetLines)
        return
      }

      if (isPollingMode) {
        if (incoming.length === 0) return
        setRawLines(prev => {
          const merged = [...prev, ...incoming]
          return merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged
        })
        return
      }

      const initialLines = incoming.length > MAX_LINES ? incoming.slice(incoming.length - MAX_LINES) : incoming
      setRawLines(initialLines)
    } catch (error) {
      if (requestSeqRef.current !== currentReq) return
      const message = error instanceof Error ? error.message : String(error)
      setErrorText(message || '日志读取失败')
    } finally {
      inFlightRef.current = false
      if (requestSeqRef.current === currentReq) {
        if (isPollingMode) {
          setIsPolling(false)
        } else {
          setIsLoading(false)
        }
      }
    }
  }, [isConnected, supportsLogsTail, tailLogs])

  useEffect(() => {
    cursorRef.current = null
    inFlightRef.current = false
    requestSeqRef.current += 1
    setRawLines([])
    setErrorText(null)
    setLogFile(null)
    setLogSize(null)
    setIsTruncated(false)
    setLastResetAt(null)
    setLastUpdatedAt(null)

    if (!isConnected || !supportsLogsTail) return
    void fetchLogs('initial')
  }, [fetchLogs, isConnected, supportsLogsTail])

  useEffect(() => {
    if (!isConnected || !supportsLogsTail || !autoFollow) return
    const timer = setInterval(() => {
      void fetchLogs('poll')
    }, POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [autoFollow, fetchLogs, isConnected, supportsLogsTail])

  const parsedEntries = useMemo(
    () => rawLines.map(line => parseLogEntry(line)),
    [rawLines],
  )

  const subsystemOptions = useMemo(() => {
    return Array.from(new Set(parsedEntries.map(entry => entry.subsystem).filter((value): value is string => Boolean(value)))).sort((a, b) => {
      return a.localeCompare(b)
    })
  }, [parsedEntries])

  const moduleOptions = useMemo(() => {
    return Array.from(new Set(parsedEntries.map(entry => entry.module).filter((value): value is string => Boolean(value)))).sort((a, b) => {
      return a.localeCompare(b)
    })
  }, [parsedEntries])

  useEffect(() => {
    if (subsystemFilter === 'all') return
    if (!subsystemOptions.includes(subsystemFilter)) {
      setSubsystemFilter('all')
    }
  }, [subsystemFilter, subsystemOptions])

  useEffect(() => {
    if (moduleFilter === 'all') return
    if (!moduleOptions.includes(moduleFilter)) {
      setModuleFilter('all')
    }
  }, [moduleFilter, moduleOptions])

  const filteredEntries = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return parsedEntries.filter(entry => {
      if (levelFilter !== 'all' && entry.level !== levelFilter) return false
      if (subsystemFilter !== 'all' && entry.subsystem !== subsystemFilter) return false
      if (moduleFilter !== 'all' && entry.module !== moduleFilter) return false
      if (!keyword) return true
      const text = `${entry.raw}\n${entry.message}\n${entry.subsystem ?? ''}\n${entry.module ?? ''}\n${entry.location ?? ''}\n${entry.level}`.toLowerCase()
      return text.includes(keyword)
    })
  }, [levelFilter, moduleFilter, parsedEntries, query, subsystemFilter])

  useEffect(() => {
    if (!autoFollow) return
    const container = listContainerRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [autoFollow, filteredEntries])

  /**
   * 手动刷新日志窗口。
   */
  const handleRefresh = () => {
    cursorRef.current = null
    setIsTruncated(false)
    setLastResetAt(null)
    void fetchLogs('refresh')
  }

  /**
   * 导出当前筛选结果。
   */
  const handleExport = () => {
    if (filteredEntries.length === 0) return
    const body = filteredEntries.map(item => item.raw).join('\n')
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = buildExportFileName()
    anchor.click()
    URL.revokeObjectURL(href)
  }

  return (
    <div ref={panelRef} className="flex h-full flex-col bg-[var(--surface-right-panel)]">
      <div className="wb-panel-header">
        <div className="text-sm font-medium text-[var(--text-strong)]">日志查看</div>
        <button
          type="button"
          className="wb-icon-button h-8 w-8"
          onClick={onClose}
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!isConnected ? (
        <div className="m-4 rounded-[16px] border border-[color-mix(in_srgb,var(--color-yellow-900)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-yellow-950)_34%,transparent)] px-3 py-2 text-xs text-[var(--color-yellow-200)]">
          当前未连接到 Gateway，无法读取日志。
        </div>
      ) : !supportsLogsTail ? (
        <div className="m-4 rounded-[16px] border border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_34%,transparent)] px-3 py-2 text-xs text-[var(--color-red-200)]">
          当前 Gateway 未声明 `logs.tail` 方法，暂不支持日志查看。
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b border-[var(--border-default)] px-4 py-4 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={levelFilter}
                onChange={e => setLevelFilter(e.target.value as LogLevelFilter)}
                className="wb-select w-auto min-w-[108px]"
              >
                <option value="all">全部级别</option>
                <option value="trace">trace</option>
                <option value="debug">debug</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
                <option value="fatal">fatal</option>
              </select>

              <select
                value={subsystemFilter}
                onChange={e => setSubsystemFilter(e.target.value)}
                className="wb-select max-w-[220px]"
              >
                <option value="all">全部子系统</option>
                {subsystemOptions.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>

              <select
                value={moduleFilter}
                onChange={e => setModuleFilter(e.target.value)}
                className="wb-select max-w-[220px]"
              >
                <option value="all">全部模块</option>
                {moduleOptions.map(item => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>

              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-[var(--text-faint)]" />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="搜索日志（消息/子系统/模块/路径）..."
                  className="wb-input py-2 pl-9"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex overflow-hidden rounded-full border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)]">
                <button
                  type="button"
                  className={cn(
                    'px-3 py-1.5 text-[var(--text-subtle)]',
                    viewMode === 'table'
                      ? 'bg-[var(--surface-hover)] text-[var(--text-strong)]'
                      : 'hover:bg-[var(--surface-hover)]',
                  )}
                  onClick={() => setViewMode('table')}
                >
                  表格
                </button>
                <button
                  type="button"
                  className={cn(
                    'border-l border-[var(--border-default)] px-3 py-1.5 text-[var(--text-subtle)]',
                    viewMode === 'json'
                      ? 'bg-[var(--surface-hover)] text-[var(--text-strong)]'
                      : 'hover:bg-[var(--surface-hover)]',
                  )}
                  onClick={() => setViewMode('json')}
                >
                  JSON
                </button>
              </div>

              <button
                type="button"
                className="wb-pill-button"
                onClick={handleRefresh}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                刷新
              </button>
              <button
                type="button"
                className="wb-pill-button"
                onClick={handleExport}
                disabled={filteredEntries.length === 0}
              >
                导出
              </button>
              <label className="inline-flex items-center gap-1 text-[var(--text-faint)]">
                <input
                  type="checkbox"
                  checked={autoFollow}
                  onChange={e => setAutoFollow(e.target.checked)}
                  className="accent-[var(--color-blue-500)]"
                />
                自动拉取并滚动
              </label>
              {(isLoading || isPolling) && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-faint)]" />}
            </div>

            <div className="space-y-0.5 text-[11px] text-[var(--text-faint)]">
              <div>
                文件:
                {' '}
                <span className="text-[var(--color-gray-400)]">{logFile ?? '-'}</span>
                {' '}
                | 大小:
                {' '}
                <span className="text-[var(--color-gray-400)]">{formatBytes(logSize)}</span>
              </div>
              <div>
                总行数:
                {' '}
                <span className="text-[var(--color-gray-400)]">{rawLines.length}</span>
                {' '}
                | 当前筛选:
                {' '}
                <span className="text-[var(--color-gray-400)]">{filteredEntries.length}</span>
                {' '}
                | 最近更新:
                {' '}
                <span className="text-[var(--color-gray-400)]">{lastUpdatedAt ? formatLogTime(lastUpdatedAt) : '-'}</span>
              </div>
              {isTruncated && (
                <div className="text-[var(--color-amber-300)]">
                  已发生日志窗口截断，仅保留最近日志。
                </div>
              )}
              {lastResetAt && (
                <div className="text-[var(--color-blue-300)]">
                  检测到日志文件重置，已自动切换到最新窗口（
                  {formatLogTime(lastResetAt)}
                  ）。
                </div>
              )}
            </div>
          </div>

          {errorText && (
            <div className="mx-4 mt-3 rounded-[16px] border border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_34%,transparent)] px-3 py-2 text-xs text-[var(--color-red-200)]">
              {errorText}
            </div>
          )}

          <div
            ref={listContainerRef}
            className={cn(
              'flex-1 overflow-y-auto px-4 py-4 font-mono text-[11px]',
              viewMode === 'json' && 'space-y-2',
            )}
          >
            {filteredEntries.length === 0 && !isLoading ? (
              <div className="wb-empty-state px-3 py-6 text-center">
                暂无可展示日志
              </div>
            ) : viewMode === 'table' ? (
              <div className="overflow-x-auto rounded-[18px] border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)]">
                <table className="min-w-[900px] w-full border-collapse">
                  <thead className="sticky top-0 bg-[var(--color-gray-900)] text-[10px] uppercase tracking-wide text-[var(--color-gray-500)]">
                    <tr>
                      <th className="w-[86px] px-2 py-1 text-left">时间</th>
                      <th className="w-[70px] px-2 py-1 text-left">级别</th>
                      <th className="w-[220px] px-2 py-1 text-left">子系统</th>
                      <th className="w-[180px] px-2 py-1 text-left">模块</th>
                      <th className="px-2 py-1 text-left">消息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry, index) => (
                      <tr
                        key={`${index}-${entry.raw.slice(0, 24)}`}
                        className="border-t border-[var(--color-gray-800)] align-top hover:bg-[color-mix(in_srgb,var(--color-gray-900)_75%,transparent)]"
                      >
                        <td className="px-2 py-1 text-[var(--color-gray-500)]">{formatLogTime(entry.ts)}</td>
                        <td className="px-2 py-1">
                          <span className={cn('uppercase', getLevelClass(entry.level))}>
                            {entry.level === 'unknown' ? '-' : entry.level}
                          </span>
                        </td>
                        <td className="break-all px-2 py-1 text-[var(--color-gray-300)]">{entry.subsystem ?? '-'}</td>
                        <td className="break-all px-2 py-1 text-[var(--color-gray-400)]">{entry.module ?? '-'}</td>
                        <td className="px-2 py-1 text-[var(--color-gray-200)]">
                          <div className="break-all">{entry.message}</div>
                          {entry.location && (
                            <div className="mt-0.5 break-all text-[10px] text-[var(--color-gray-500)]">
                              {entry.location}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              filteredEntries.map((entry, index) => (
                <div
                  key={`${index}-${entry.raw.slice(0, 24)}`}
                  className="rounded border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_50%,transparent)]"
                >
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-gray-800)] px-2 py-1">
                    <span className="text-[var(--color-gray-500)]">{formatLogTime(entry.ts)}</span>
                    <span className={cn('uppercase', getLevelClass(entry.level))}>
                      {entry.level === 'unknown' ? '-' : entry.level}
                    </span>
                    <span className="break-all text-[var(--color-gray-400)]">{entry.subsystem ?? '-'}</span>
                    {entry.module && (
                      <span className="break-all text-[var(--color-gray-500)]">module={entry.module}</span>
                    )}
                  </div>
                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-all px-2 py-2 text-[var(--color-gray-200)]">
                    {formatRawJsonLine(entry.raw)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
