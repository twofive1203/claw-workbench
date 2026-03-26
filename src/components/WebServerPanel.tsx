import { useRef, useState } from 'react'
import { Copy, Globe, Play, Shuffle, Square, X } from 'lucide-react'
import { useWebServer } from '../hooks/useWebServer'
import { useI18n } from '../i18n/useI18n'
import { cn } from '../lib/utils'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * Web 远程服务面板属性。
 * @author towfive
 */
interface WebServerPanelProps {
  activeWsUrl: string
  activeServerName: string
  onClose: () => void
}

/**
 * 生成随机访问令牌（16 位 hex）。
 */
function generateRandomToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 格式化运行时长。
 * @param startedAt 启动时间戳（毫秒）。
 */
function formatUptime(startedAt?: number): string {
  if (typeof startedAt !== 'number' || startedAt <= 0) return '-'
  const elapsed = Date.now() - startedAt
  if (elapsed < 0) return '-'
  const totalSeconds = Math.floor(elapsed / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m`
  return `${totalSeconds}s`
}

/**
 * Web 远程服务面板。
 * 提供内嵌 Web 服务器的启动/停止控制、状态展示和配置编辑。
 * @param props 组件属性。
 * @author towfive
 */
export function WebServerPanel(props: WebServerPanelProps) {
  const { activeWsUrl, activeServerName, onClose } = props
  const panelRef = useRef<HTMLDivElement | null>(null)
  const { tr } = useI18n()

  const {
    webServerInfo,
    isStarting,
    isStopping,
    error,
    config,
    startServer,
    stopServer,
    setPort,
    setAccessToken,
  } = useWebServer(activeWsUrl, activeServerName)

  const [copied, setCopied] = useState(false)

  useLocalizedSubtree(panelRef)

  const isRunning = webServerInfo?.running === true
  const listenAddress = isRunning ? `http://localhost:${webServerInfo.port}` : null
  const fullUrl = isRunning && webServerInfo.accessToken
    ? `${listenAddress}?token=${webServerInfo.accessToken}`
    : listenAddress

  /**
   * 复制地址到剪贴板。
   */
  const handleCopy = async () => {
    if (!fullUrl) return
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 静默失败
    }
  }

  /**
   * 处理启动。
   */
  const handleStart = () => {
    void startServer(config.port, config.accessToken || undefined)
  }

  /**
   * 处理停止。
   */
  const handleStop = () => {
    void stopServer()
  }

  /**
   * 处理端口输入变更。
   */
  const handlePortChange = (value: string) => {
    const num = Number.parseInt(value, 10)
    if (!Number.isNaN(num) && num > 0 && num <= 65535) {
      setPort(num)
    }
  }

  /**
   * 随机生成令牌。
   */
  const handleRandomToken = () => {
    setAccessToken(generateRandomToken())
  }

  return (
    <div ref={panelRef} className="flex h-full flex-col bg-[var(--color-gray-950)]">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between border-b border-[var(--color-gray-800)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Globe className="h-4 w-4 text-[var(--color-blue-300)]" />
          <span className="text-sm font-medium text-[var(--color-gray-100)]">{tr('web.title')}</span>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-[var(--color-gray-100)]"
          onClick={onClose}
          title={tr('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-3">
        {/* 状态区 */}
        <div className="rounded-lg border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[var(--color-gray-400)]">{tr('web.running_status')}</span>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  isRunning ? 'bg-[var(--color-green-400)]' : 'bg-[var(--color-gray-600)]',
                )}
              />
              <span className={cn('font-medium', isRunning ? 'text-[var(--color-green-300)]' : 'text-[var(--color-gray-400)]')}>
                {isRunning ? tr('web.running') : tr('web.stopped')}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-1 text-[var(--color-gray-300)]">
            <span className="text-[var(--color-gray-500)]">{tr('web.listen_address')}</span>
            <span className="flex items-center gap-1">
              {listenAddress ? (
                <>
                  <button
                    type="button"
                    className="truncate text-[var(--color-blue-300)] hover:underline"
                    onClick={handleCopy}
                    title={tr('web.copy_full_url')}
                  >
                    {listenAddress}
                  </button>
                  <Copy className={cn('h-3 w-3 shrink-0', copied ? 'text-[var(--color-green-400)]' : 'text-[var(--color-gray-500)]')} />
                </>
              ) : (
                '-'
              )}
            </span>
            <span className="text-[var(--color-gray-500)]">{tr('web.uptime')}</span>
            <span>{isRunning ? formatUptime(webServerInfo.startedAt) : '-'}</span>
          </div>
        </div>

        {/* 配置区 */}
        <div className="rounded-lg border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-3 text-xs">
          <div className="mb-2 text-[var(--color-gray-400)]">{tr('web.service_config')}</div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[var(--color-gray-500)]">{tr('web.port')}</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={config.port}
                disabled={isRunning}
                onChange={e => handlePortChange(e.target.value)}
                className={cn(
                  'w-full rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2.5 py-1.5 text-xs text-[var(--color-gray-200)] outline-none focus:border-[var(--color-gray-500)]',
                  isRunning && 'cursor-not-allowed opacity-50',
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-[var(--color-gray-500)]">{tr('web.access_token')}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={config.accessToken}
                  disabled={isRunning}
                  placeholder={tr('web.no_auth_placeholder')}
                  onChange={e => setAccessToken(e.target.value)}
                  className={cn(
                    'flex-1 rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2.5 py-1.5 text-xs text-[var(--color-gray-200)] outline-none focus:border-[var(--color-gray-500)]',
                    isRunning && 'cursor-not-allowed opacity-50',
                  )}
                />
                <button
                  type="button"
                  disabled={isRunning}
                  className={cn(
                    'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-gray-700)] text-[var(--color-gray-400)] transition-colors',
                    isRunning
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:border-[var(--color-gray-600)] hover:text-[var(--color-gray-200)]',
                  )}
                  title={tr('web.random_token')}
                  onClick={handleRandomToken}
                >
                  <Shuffle className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 操作区 */}
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              type="button"
              disabled={isStopping}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                isStopping
                  ? 'cursor-not-allowed bg-[var(--color-gray-800)] text-[var(--color-gray-600)]'
                  : 'bg-[var(--color-red-700)] text-[var(--color-red-100)] hover:bg-[var(--color-red-600)]',
              )}
              onClick={handleStop}
            >
              <Square className="h-3.5 w-3.5" />
              {isStopping ? tr('web.stopping') : tr('web.stop_service')}
            </button>
          ) : (
            <button
              type="button"
              disabled={isStarting}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors',
                isStarting
                  ? 'cursor-not-allowed bg-[var(--color-gray-800)] text-[var(--color-gray-600)]'
                  : 'bg-[var(--color-green-700)] text-[var(--color-green-100)] hover:bg-[var(--color-green-600)]',
              )}
              onClick={handleStart}
            >
              <Play className="h-3.5 w-3.5" />
              {isStarting ? tr('web.starting') : tr('web.start_service')}
            </button>
          )}
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="rounded-md border border-[color-mix(in_srgb,var(--color-red-900)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_40%,transparent)] px-2.5 py-1.5 text-xs text-[var(--color-red-200)]">
            {error}
          </div>
        )}

        {/* 提示区 */}
        <div className="rounded-lg border border-dashed border-[var(--color-gray-700)] bg-[color-mix(in_srgb,var(--color-gray-950)_60%,transparent)] px-3 py-2.5 text-[11px] leading-relaxed text-[var(--color-gray-500)]">
          {tr('web.remote_hint')}
          {isRunning && fullUrl && (
            <div className="mt-1.5">
              <span className="text-[var(--color-gray-400)]">{tr('web.full_url')}</span>
              <button
                type="button"
                className="break-all text-[var(--color-blue-400)] hover:underline"
                onClick={handleCopy}
              >
                <span data-no-i18n>{fullUrl}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
