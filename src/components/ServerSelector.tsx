import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'
import type {
  LocalOpenClawServerCandidate,
  ServerConfig,
  ServerFormValue,
} from '../types/server'
import { ServerFormModal } from './ServerFormModal'
import { ConfirmModal } from './ConfirmModal'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'
import { useI18n } from '../i18n/useI18n'

/**
 * 判断服务器列表中是否已存在本机回环地址。
 * @param servers 服务器列表。
 */
function hasLocalLoopbackServer(servers: ServerConfig[]): boolean {
  return servers.some((server) => {
    const normalizedHost = server.host.trim().toLowerCase()
    return normalizedHost === 'localhost'
      || normalizedHost === '127.0.0.1'
      || normalizedHost === '::1'
      || normalizedHost === '[::1]'
  })
}

/**
 * 服务器选择器属性。
 * @param servers 服务器列表。
 * @param activeServerId 当前选中服务器 id。
 * @param activeServer 当前选中服务器。
 * @param isConnected 当前连接状态。
 * @param readonly 只读模式，隐藏添加/编辑/删除按钮（浏览器远程模式）。
 * @param onSelectServer 切换服务器回调。
 * @param onAddServer 新增服务器回调。
 * @param onDetectLocalServer 检测本机 OpenClaw 回调。
 * @param onUpdateServer 更新服务器回调。
 * @param onRemoveServer 删除服务器回调。
 */
interface ServerSelectorProps {
  servers: ServerConfig[]
  activeServerId: string | null
  activeServer: ServerConfig | null
  isConnected: boolean
  readonly?: boolean
  onSelectServer: (id: string) => void
  onAddServer: (value: ServerFormValue) => void
  onDetectLocalServer: () => Promise<LocalOpenClawServerCandidate | null>
  onUpdateServer: (id: string, value: ServerFormValue) => void
  onRemoveServer: (id: string) => void
}

/**
 * 服务器选择器组件。
 * @param props 组件属性。
 */
export function ServerSelector(props: ServerSelectorProps) {
  const {
    servers,
    activeServerId,
    activeServer,
    isConnected,
    readonly: isReadonly,
    onSelectServer,
    onAddServer,
    onDetectLocalServer,
    onUpdateServer,
    onRemoveServer,
  } = props

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingServer, setEditingServer] = useState<ServerConfig | null>(null)
  const [pendingDeleteServer, setPendingDeleteServer] = useState<ServerConfig | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { tr } = useI18n()
  const connectionStatusText = isConnected ? tr('common.connected') : tr('common.disconnected')
  const connectionStatusClass = isConnected ? 'bg-[var(--color-emerald-500)]' : 'bg-[var(--color-red-500)]'
  const hasLocalServer = hasLocalLoopbackServer(servers)

  useLocalizedSubtree(containerRef)

  /**
   * 监听点击外部区域并关闭下拉框。
   * @param event 鼠标事件。
   */
  useEffect(() => {
    const handleWindowMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return
      if (containerRef.current.contains(event.target as Node)) return
      setIsDropdownOpen(false)
    }

    window.addEventListener('mousedown', handleWindowMouseDown)
    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown)
    }
  }, [])

  const shouldShowDropdown = isDropdownOpen && servers.length > 0

  /**
   * 打开新增弹窗。
   */
  const openCreateModal = () => {
    setEditingServer(null)
    setIsModalOpen(true)
    setIsDropdownOpen(false)
  }

  /**
   * 打开编辑弹窗。
   * @param server 目标服务器。
   */
  const openEditModal = (server: ServerConfig) => {
    setEditingServer(server)
    setIsModalOpen(true)
    setIsDropdownOpen(false)
  }

  /**
   * 关闭编辑弹窗。
   */
  const closeModal = () => {
    setIsModalOpen(false)
    setEditingServer(null)
  }

  /**
   * 提交新增或编辑表单。
   * @param value 表单值。
   */
  const handleSubmitForm = (value: ServerFormValue) => {
    if (editingServer) {
      onUpdateServer(editingServer.id, value)
    } else {
      onAddServer(value)
    }
    closeModal()
  }

  /**
   * 删除服务器。
   * @param server 目标服务器。
   */
  const handleDeleteServer = (server: ServerConfig) => {
    setPendingDeleteServer(server)
    setIsDropdownOpen(false)
  }

  /**
   * 关闭删除确认弹窗。
   */
  const closeDeleteModal = () => {
    setPendingDeleteServer(null)
  }

  /**
   * 确认删除服务器。
   */
  const confirmDeleteServer = () => {
    if (!pendingDeleteServer) return
    const targetServer = pendingDeleteServer
    setPendingDeleteServer(null)
    onRemoveServer(targetServer.id)
  }

  return (
    <div className="w-full min-w-0 space-y-2" ref={containerRef}>
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-sm font-semibold tracking-wide text-[var(--color-gray-300)]">ClawWorkbench</h1>
        <div className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-[var(--color-gray-500)]">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              connectionStatusClass,
            )}
          />
          <span data-no-i18n>{connectionStatusText}</span>
        </div>
      </div>

      {servers.length === 0 ? (
        <div className="space-y-2 rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-950)_60%,transparent)] p-2.5">
          <div className="text-xs text-[var(--color-gray-400)]">
            {isReadonly ? '等待远程配置...' : '请添加一个 Gateway 服务器'}
          </div>
          {!isReadonly && (
            <button
              type="button"
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2 py-1 text-xs text-[var(--color-gray-200)] hover:border-[var(--color-gray-600)]"
              onClick={openCreateModal}
            >
              <Plus className="h-3.5 w-3.5" />
              添加服务器
            </button>
          )}
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-950)] px-2.5 py-2 text-left',
              'text-xs text-[var(--color-gray-200)] transition-colors hover:border-[var(--color-gray-600)]',
            )}
            onClick={() => setIsDropdownOpen(prev => !prev)}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" data-no-i18n>{activeServer?.name ?? tr('server.none_selected')}</div>
              <div className="truncate text-[11px] text-[var(--color-gray-500)]">
                {activeServer?.host ?? tr('server.select_first')}
              </div>
            </div>
            <ChevronDown
              className={cn('h-4 w-4 text-[var(--color-gray-500)] transition-transform', isDropdownOpen && 'rotate-180')}
            />
          </button>

          {shouldShowDropdown && (
            <div className="absolute z-20 mt-1 w-full space-y-1 rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] p-1 shadow-xl">
              {servers.map(server => (
                <div
                  key={server.id}
                  className={cn(
                    'group flex items-center gap-1 rounded-md border px-1 py-1',
                    activeServerId === server.id
                      ? 'border-[color-mix(in_srgb,var(--color-blue-500)_50%,transparent)] bg-[color-mix(in_srgb,var(--color-blue-500)_10%,transparent)]'
                      : 'border-transparent hover:border-[var(--color-gray-700)] hover:bg-[color-mix(in_srgb,var(--color-gray-800)_70%,transparent)]',
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 rounded px-1 py-1 text-left"
                    onClick={() => {
                      onSelectServer(server.id)
                      setIsDropdownOpen(false)
                    }}
                  >
                    <div className="truncate text-xs text-[var(--color-gray-100)]" data-no-i18n>{server.name}</div>
                    <div className="truncate text-[11px] text-[var(--color-gray-500)]">
                      {server.protocol}://{server.host}
                    </div>
                  </button>
                  {!isReadonly && (
                    <>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--color-gray-400)] md:opacity-0 md:transition-opacity md:group-hover:opacity-100 hover:bg-[var(--color-gray-700)] hover:text-[var(--color-gray-200)]"
                        title={tr('common.edit')}
                        onClick={() => openEditModal(server)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-6 w-6 items-center justify-center rounded text-[var(--color-gray-400)] md:opacity-0 md:transition-opacity md:group-hover:opacity-100 hover:bg-[color-mix(in_srgb,var(--color-red-900)_30%,transparent)] hover:text-[var(--color-red-300)]"
                        title={tr('common.delete')}
                        onClick={() => handleDeleteServer(server)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              ))}

              {!isReadonly && (
                <button
                  type="button"
                  className="mt-1 inline-flex w-full items-center justify-center gap-1 whitespace-nowrap rounded-md border border-dashed border-[var(--color-gray-600)] px-2 py-1.5 text-xs text-[var(--color-gray-300)] hover:border-[var(--color-gray-500)] hover:text-[var(--color-gray-100)]"
                  onClick={openCreateModal}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {tr('server.add')}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {isModalOpen && (
        <ServerFormModal
          initialServer={editingServer}
          canDetectLocalServer={!editingServer && !hasLocalServer}
          onDetectLocalServer={onDetectLocalServer}
          onCancel={closeModal}
          onSubmit={handleSubmitForm}
        />
      )}

      {pendingDeleteServer && (
        <ConfirmModal
          title={tr('server.delete_title')}
          description={tr('server.delete_description', { name: pendingDeleteServer.name })}
          confirmText={tr('common.delete')}
          variant="danger"
          onCancel={closeDeleteModal}
          onConfirm={confirmDeleteServer}
        />
      )}
    </div>
  )
}
