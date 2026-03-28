import { useRef } from 'react'
import { Activity, Laptop, Monitor, RefreshCcw, Server, Smartphone, X } from 'lucide-react'
import type { GatewayHealthInfo, PresenceEntry } from '../types'
import { cn } from '../lib/utils'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * 健康面板属性。
 * @param health 健康信息。
 * @param presence 在线设备列表。
 * @param onRefresh 刷新回调。
 * @param onClose 关闭面板回调。
 * @author towfive
 */
interface HealthPanelProps {
  health: GatewayHealthInfo | null
  presence: PresenceEntry[]
  onRefresh: () => void
  onClose: () => void
}

/**
 * 格式化运行时长。
 * @param uptimeMs 运行毫秒数。
 */
function formatUptime(uptimeMs?: number): string {
  if (typeof uptimeMs !== 'number' || uptimeMs <= 0) return '-'
  const totalSeconds = Math.floor(uptimeMs / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

/**
 * 获取设备图标。
 * @param row 在线设备条目。
 */
function getPresenceIcon(row: PresenceEntry) {
  const platform = (row.platform ?? '').toLowerCase()
  const family = (row.deviceFamily ?? '').toLowerCase()
  if (platform.includes('ios') || platform.includes('android') || family.includes('phone')) return Smartphone
  if (platform.includes('linux') || platform.includes('darwin') || platform.includes('windows')) return Laptop
  if (platform.includes('server') || family.includes('server')) return Server
  return Monitor
}

/**
 * Gateway 健康监控面板。
 * @param props 组件属性。
 */
export function HealthPanel(props: HealthPanelProps) {
  const { health, presence, onRefresh, onClose } = props
  const panelRef = useRef<HTMLDivElement | null>(null)

  useLocalizedSubtree(panelRef)

  return (
    <div ref={panelRef} className="flex h-full flex-col bg-[var(--surface-right-panel)] text-[var(--text-subtle)]">
      <div className="wb-panel-header">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-[var(--color-blue-300)]" />
            <span className="wb-panel-title">Gateway 状态</span>
          </div>
          <p className="wb-panel-subtitle mt-1">查看连接健康度、版本信息和在线设备。</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="wb-mini-button"
            onClick={onRefresh}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            刷新
          </button>
          <button
            type="button"
            className="wb-icon-button h-8 w-8"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-4">
        <div className="wb-card-strong space-y-3 rounded-[20px] p-4 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[var(--text-faint)]">状态</span>
            <span className={cn('font-medium', health?.ok === false ? 'wb-chip-danger' : 'wb-chip-success')}>
              {health?.ok === false ? '异常' : '正常'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-[var(--text-subtle)]">
            <span className="text-[var(--text-faint)]">版本</span>
            <span>{health?.version ?? '-'}</span>
            <span className="text-[var(--text-faint)]">协议</span>
            <span>{health?.protocol ? `v${health.protocol}` : '-'}</span>
            <span className="text-[var(--text-faint)]">运行时长</span>
            <span>{formatUptime(health?.uptimeMs)}</span>
            <span className="text-[var(--text-faint)]">methods</span>
            <span>{health?.features?.methods?.length ?? 0}</span>
            <span className="text-[var(--text-faint)]">events</span>
            <span>{health?.features?.events?.length ?? 0}</span>
          </div>
        </div>

        <div className="wb-card rounded-[20px] p-4 text-xs">
          <div className="mb-3 text-[var(--text-faint)]">
            在线设备 (
            {presence.length}
            )
          </div>
          {presence.length === 0 ? (
            <div className="wb-empty-state rounded-[16px] px-3 py-4 text-center">
              当前无在线设备
            </div>
          ) : (
            <div className="space-y-2">
              {presence.map((item, index) => {
                const Icon = getPresenceIcon(item)
                return (
                  <div key={`${item.instanceId ?? item.deviceId ?? item.host ?? 'presence'}-${index}`} className="wb-card rounded-[16px] p-3">
                    <div className="mb-2 flex items-center gap-2 text-[var(--text-loud)]">
                      <Icon className="h-3.5 w-3.5 text-[var(--color-blue-300)]" />
                      <span className="truncate" data-no-i18n>{item.host ?? item.deviceId ?? item.instanceId ?? '未知设备'}</span>
                    </div>
                    <div className="space-y-1 text-[11px] text-[var(--text-faint)]">
                      <div>
                        platform:
                        {' '}
                        {item.platform ?? '-'}
                        {' '}
                        | mode:
                        {' '}
                        {item.mode ?? '-'}
                      </div>
                      <div>
                        version:
                        {' '}
                        {item.version ?? '-'}
                        {' '}
                        | ip:
                        {' '}
                        {item.ip ?? '-'}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
