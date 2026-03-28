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
    <div ref={panelRef} className="flex h-full flex-col bg-[var(--surface-right-panel)] text-[var(--text-subtle)]">
      <div className="wb-panel-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-[var(--color-blue-300)]" />
            <span className="wb-panel-title">{tr('web.title')}</span>
          </div>
          <p className="wb-panel-subtitle mt-1">{tr('控制桌面内嵌 Web 服务并生成远程访问入口。')}</p>
        </div>
        <button
          type="button"
          className="wb-icon-button h-8 w-8"
          onClick={onClose}
          title={tr('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 overflow-y-auto px-4 py-4">
        <section className="wb-card-strong rounded-[20px] p-4 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[var(--text-faint)]">{tr('web.running_status')}</span>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-block h-2 w-2 rounded-full',
                  isRunning ? 'bg-[var(--color-green-400)]' : 'bg-[var(--color-gray-600)]',
                )}
              />
              <span className={cn('font-medium', isRunning ? 'wb-chip-success' : 'wb-chip-muted')}>
                {isRunning ? tr('web.running') : tr('web.stopped')}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-[var(--text-subtle)]">
            <span className="text-[var(--text-faint)]">{tr('web.listen_address')}</span>
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
            <span className="text-[var(--text-faint)]">{tr('web.uptime')}</span>
            <span>{isRunning ? formatUptime(webServerInfo.startedAt) : '-'}</span>
          </div>
        </section>

        <section className="wb-card rounded-[20px] p-4 text-xs">
          <div className="mb-3 text-[var(--text-faint)]">{tr('web.service_config')}</div>
          <div className="space-y-2">
            <div>
              <label className="mb-1 block text-[var(--text-faint)]">{tr('web.port')}</label>
              <input
                type="number"
                min={1}
                max={65535}
                value={config.port}
                disabled={isRunning}
                onChange={e => handlePortChange(e.target.value)}
                className={cn(
                  'wb-input',
                  isRunning && 'cursor-not-allowed opacity-50',
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-[var(--text-faint)]">{tr('web.access_token')}</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={config.accessToken}
                  disabled={isRunning}
                  placeholder={tr('web.no_auth_placeholder')}
                  onChange={e => setAccessToken(e.target.value)}
                  className={cn(
                    'wb-input flex-1',
                    isRunning && 'cursor-not-allowed opacity-50',
                  )}
                />
                <button
                  type="button"
                  disabled={isRunning}
                  className={cn(
                    'wb-icon-button h-9 w-9 shrink-0',
                    isRunning
                      ? 'cursor-not-allowed opacity-50'
                      : '',
                  )}
                  title={tr('web.random_token')}
                  onClick={handleRandomToken}
                >
                  <Shuffle className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-2">
          {isRunning ? (
            <button
              type="button"
              disabled={isStopping}
              className={cn(
                'wb-danger-button flex-1',
                isStopping
                  ? 'cursor-not-allowed bg-[var(--color-gray-800)] text-[var(--color-gray-600)]'
                  : '',
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
                'wb-primary-button flex-1',
                isStarting
                  ? 'cursor-not-allowed bg-[var(--color-gray-800)] text-[var(--color-gray-600)]'
                  : 'border-[color-mix(in_srgb,var(--color-green-500)_34%,transparent)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-green-600)_92%,transparent),color-mix(in_srgb,var(--color-green-700)_92%,transparent))]',
              )}
              onClick={handleStart}
            >
              <Play className="h-3.5 w-3.5" />
              {isStarting ? tr('web.starting') : tr('web.start_service')}
            </button>
          )}
        </div>

        {error && (
          <div className="wb-card rounded-[16px] border-[color-mix(in_srgb,var(--color-red-700)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_48%,transparent)] px-3 py-2 text-xs text-[var(--color-red-200)]">
            {error}
          </div>
        )}

        <div className="wb-empty-state rounded-[18px] px-3 py-3 text-[11px] leading-relaxed">
          {tr('web.remote_hint')}
          {isRunning && fullUrl && (
            <div className="mt-1.5">
              <span className="text-[var(--text-faint)]">{tr('web.full_url')}</span>
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
