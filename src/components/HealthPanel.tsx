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
    <div ref={panelRef} className="flex h-full flex-col bg-[var(--color-gray-950)]">
      <div className="flex items-center justify-between border-b border-[var(--color-gray-800)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Activity className="h-4 w-4 text-[var(--color-blue-300)]" />
          <span className="text-sm font-medium text-[var(--color-gray-100)]">Gateway 状态</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2 py-1 text-xs text-[var(--color-gray-200)] hover:border-[var(--color-gray-600)] hover:bg-[var(--color-gray-800)]"
            onClick={onRefresh}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            刷新
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-[var(--color-gray-100)]"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-3">
        <div className="rounded-lg border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-3 text-xs">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[var(--color-gray-400)]">状态</span>
            <span className={cn('font-medium', health?.ok === false ? 'text-[var(--color-red-300)]' : 'text-[var(--color-green-300)]')}>
              {health?.ok === false ? '异常' : '正常'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-y-1 text-[var(--color-gray-300)]">
            <span className="text-[var(--color-gray-500)]">版本</span>
            <span>{health?.version ?? '-'}</span>
            <span className="text-[var(--color-gray-500)]">协议</span>
            <span>{health?.protocol ? `v${health.protocol}` : '-'}</span>
            <span className="text-[var(--color-gray-500)]">运行时长</span>
            <span>{formatUptime(health?.uptimeMs)}</span>
            <span className="text-[var(--color-gray-500)]">methods</span>
            <span>{health?.features?.methods?.length ?? 0}</span>
            <span className="text-[var(--color-gray-500)]">events</span>
            <span>{health?.features?.events?.length ?? 0}</span>
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-3 text-xs">
          <div className="mb-2 text-[var(--color-gray-400)]">
            在线设备 (
            {presence.length}
            )
          </div>
          {presence.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-gray-700)] bg-[color-mix(in_srgb,var(--color-gray-950)_60%,transparent)] px-2.5 py-3 text-center text-[var(--color-gray-500)]">
              当前无在线设备
            </div>
          ) : (
            <div className="space-y-2">
              {presence.map((item, index) => {
                const Icon = getPresenceIcon(item)
                return (
                  <div key={`${item.instanceId ?? item.deviceId ?? item.host ?? 'presence'}-${index}`} className="rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-950)_60%,transparent)] p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-[var(--color-gray-200)]">
                      <Icon className="h-3.5 w-3.5 text-[var(--color-blue-300)]" />
                      <span className="truncate" data-no-i18n>{item.host ?? item.deviceId ?? item.instanceId ?? '未知设备'}</span>
                    </div>
                    <div className="space-y-0.5 text-[11px] text-[var(--color-gray-400)]">
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
