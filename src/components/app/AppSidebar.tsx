import { Suspense, lazy, useState, type ComponentProps } from 'react'
import { Activity, ArrowLeft, Brain, ChevronDown, Clock3, FileCode2, Globe, LayoutList, Loader2, PanelLeftClose, PanelLeftOpen, Pencil, Plus, Settings, Trash2 } from 'lucide-react'
import type { Agent, SessionSummary } from '../../types'
import { IS_TAURI } from '../../lib/env'
import { cn } from '../../lib/utils'
import { CronPanel } from '../CronPanel'
import { HealthPanel } from '../HealthPanel'
import { ServerSelector } from '../ServerSelector'
import { WebServerPanel } from '../WebServerPanel'
import { LazyPanelFallback } from './LazyPanelFallback'
import type { ActivePanel, ToggleablePanel } from './activePanel'

const LazyWebServerPanel = lazy(async () => ({ default: (await import('../WebServerPanel')).WebServerPanel }))

interface AppSidebarProps {
  sidebarOpen: boolean
  tr: (key: string, params?: import('../../i18n/messages').I18nParams) => string
  chatViewMode: 'simple' | 'detailed'
  onToggleChatViewMode: () => void
  sidebarCollapsed: boolean
  onToggleSidebarCollapsed: () => void
  serverSelectorProps: ComponentProps<typeof ServerSelector>
  activePanel: ActivePanel
  supportsLogsTail: boolean
  gatewayHealthOk?: boolean
  webServerRunning: boolean
  combinedError: string | null
  onResetDeviceIdentity: () => void
  onTogglePanel: (panel: ToggleablePanel) => void
  onClosePanel: () => void
  onUnsupportedLogs: () => void
  onCloseSidebarDrawer: () => void
  onRefreshAgents: () => void
  showCreatePanel: boolean
  onToggleCreatePanel: () => void
  newAgentName: string
  newAgentWorkspace: string
  onNewAgentNameChange: (value: string) => void
  onNewAgentWorkspaceChange: (value: string) => void
  onCreateAgent: () => void
  onCloseCreatePanel: () => void
  agents: Agent[]
  focusedAgentId: string | null
  currentAgent: Agent | null | undefined
  onFocusAgent: (agentId: string) => void
  onRefreshSessions: () => void
  onResetFocusedSession: () => void
  isLoadingSessions: boolean
  sessions: SessionSummary[]
  focusedSessionKey: string | null
  onFocusSession: (sessionKey: string) => void
  onRenameSession: (sessionKey: string) => void
  onDeleteSession: (sessionKey: string) => void
  healthPanelProps: Pick<ComponentProps<typeof HealthPanel>, 'health' | 'presence'>
  onRefreshHealth: () => void
  cronPanelProps: Omit<ComponentProps<typeof CronPanel>, 'onClose'>
  webServerPanelProps: Omit<ComponentProps<typeof WebServerPanel>, 'onClose'>
}

/**
 * 统一渲染侧边栏面板按钮。
 * @param props 组件属性。
 */
function SidebarPanelButtons(props: Pick<AppSidebarProps,
  'tr'
  | 'chatViewMode'
  | 'onToggleChatViewMode'
  | 'activePanel'
  | 'supportsLogsTail'
  | 'gatewayHealthOk'
  | 'webServerRunning'
  | 'onTogglePanel'
  | 'onUnsupportedLogs'>,
) {
  const { tr, chatViewMode, onToggleChatViewMode, activePanel, supportsLogsTail, gatewayHealthOk, webServerRunning, onTogglePanel, onUnsupportedLogs } = props

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={cn(
          'wb-icon-button h-8 w-8 shrink-0',
          chatViewMode === 'simple'
            ? 'border-[color-mix(in_srgb,var(--color-green-500)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-green-500)_12%,transparent)] text-[var(--color-green-200)]'
            : '',
        )}
        title={chatViewMode === 'simple' ? tr('app.chat_view_mode.simple') : tr('app.chat_view_mode.detailed')}
        onClick={onToggleChatViewMode}
      >
        <LayoutList className="h-4 w-4" />
      </button>

      <button
        type="button"
        className={cn(
          'wb-icon-button h-8 w-8 shrink-0',
          activePanel === 'config'
            ? 'is-active'
            : '',
        )}
        title={tr('panel.config.title')}
        onClick={() => onTogglePanel('config')}
      >
        <Settings className="h-4 w-4" />
      </button>

      <button
        type="button"
        className={cn(
          'wb-icon-button h-8 w-8 shrink-0',
          activePanel === 'health'
            ? 'is-active'
            : gatewayHealthOk === false
              ? 'border-[color-mix(in_srgb,var(--color-red-700)_30%,transparent)] text-[var(--color-red-300)]'
              : '',
        )}
        title={tr('panel.health.title')}
        onClick={() => onTogglePanel('health')}
      >
        <Activity className="h-4 w-4" />
      </button>

      <button
        type="button"
        className={cn(
          'wb-icon-button h-8 w-8 shrink-0',
          activePanel === 'memory'
            ? 'is-active'
            : '',
        )}
        title={tr('panel.memory.title')}
        onClick={() => onTogglePanel('memory')}
      >
        <Brain className="h-4 w-4" />
      </button>

      <button
        type="button"
        className={cn(
          'wb-icon-button h-8 w-8 shrink-0',
          activePanel === 'cron'
            ? 'is-active'
            : '',
        )}
        title={tr('panel.cron.title')}
        onClick={() => onTogglePanel('cron')}
      >
        <Clock3 className="h-4 w-4" />
      </button>

      <button
        type="button"
        className={cn(
          'wb-icon-button h-8 w-8 shrink-0',
          activePanel === 'logs'
            ? 'is-active'
            : supportsLogsTail
              ? ''
              : 'border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] text-[var(--color-red-300)]',
        )}
        title={supportsLogsTail ? tr('panel.logs.title') : tr('panel.logs.unsupported')}
        onClick={() => {
          if (!supportsLogsTail) {
            onUnsupportedLogs()
            return
          }
          onTogglePanel('logs')
        }}
      >
        <FileCode2 className="h-4 w-4" />
      </button>

      {IS_TAURI && (
        <button
          type="button"
          className={cn(
            'wb-icon-button h-8 w-8 shrink-0',
            activePanel === 'webServer'
              ? 'is-active'
              : webServerRunning
                ? 'border-[color-mix(in_srgb,var(--color-green-500)_30%,transparent)] text-[var(--color-green-200)]'
                : '',
          )}
          title={tr('panel.web.title')}
          onClick={() => onTogglePanel('webServer')}
        >
          <Globe className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/**
 * 应用侧边栏。
 * @param props 组件属性。
 */
export function AppSidebar(props: AppSidebarProps) {
  const {
    sidebarOpen,
    tr,
    chatViewMode,
    onToggleChatViewMode,
    sidebarCollapsed,
    onToggleSidebarCollapsed,
    serverSelectorProps,
    activePanel,
    supportsLogsTail,
    gatewayHealthOk,
    webServerRunning,
    combinedError,
    onResetDeviceIdentity,
    onTogglePanel,
    onClosePanel,
    onUnsupportedLogs,
    onCloseSidebarDrawer,
    onRefreshAgents,
    showCreatePanel,
    onToggleCreatePanel,
    newAgentName,
    newAgentWorkspace,
    onNewAgentNameChange,
    onNewAgentWorkspaceChange,
    onCreateAgent,
    onCloseCreatePanel,
    agents,
    focusedAgentId,
    currentAgent,
    onFocusAgent,
    onRefreshSessions,
    onResetFocusedSession,
    isLoadingSessions,
    sessions,
    focusedSessionKey,
    onFocusSession,
    onRenameSession,
    onDeleteSession,
    healthPanelProps,
    onRefreshHealth,
    cronPanelProps,
    webServerPanelProps,
  } = props

  const [sidebarView, setSidebarView] = useState<'agents' | 'sessions'>('agents')

  const isSimple = chatViewMode === 'simple'
  const isCollapsed = isSimple && sidebarCollapsed

  if (isCollapsed) {
    return (
      <aside className="hidden flex-col md:flex md:w-[60px] md:shrink-0 md:py-3">
        <div className="wb-sidebar-shell flex h-full flex-col items-center rounded-[20px] py-4">
          <button
            type="button"
            className="wb-icon-button"
            title={tr('app.sidebar.expand')}
            onClick={onToggleSidebarCollapsed}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        'relative hidden flex-col md:flex md:w-[300px] lg:w-[340px] md:shrink-0 md:py-3',
        sidebarOpen && 'fixed inset-0 z-30 flex flex-row md:flex-col',
      )}
    >
      <div className="wb-sidebar-shell flex h-full w-full max-w-[340px] flex-col md:max-w-none">
        <div className="space-y-4 border-b border-[var(--border-default)] px-4 py-4">
          {!isSimple && <ServerSelector {...serverSelectorProps} />}

          <SidebarPanelButtons
            tr={tr}
            chatViewMode={chatViewMode}
            onToggleChatViewMode={onToggleChatViewMode}
            activePanel={activePanel}
            supportsLogsTail={supportsLogsTail}
            gatewayHealthOk={gatewayHealthOk}
            webServerRunning={webServerRunning}
            onTogglePanel={onTogglePanel}
            onUnsupportedLogs={onUnsupportedLogs}
          />

          {combinedError && (
            <div className="wb-card rounded-[16px] border-[color-mix(in_srgb,var(--color-red-700)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_52%,transparent)] px-3 py-2 text-xs text-[var(--color-red-200)]">
              <div className="whitespace-pre-wrap">{tr(combinedError)}</div>
              {/device|设备/i.test(combinedError) && (
                <button
                  type="button"
                  className="wb-mini-button mt-2 border-[color-mix(in_srgb,var(--color-red-700)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_58%,transparent)] text-[var(--color-red-200)]"
                  onClick={onResetDeviceIdentity}
                >
                  {tr('重置设备身份')}
                </button>
              )}
            </div>
          )}
        </div>

        {isSimple ? (
          /* ── 简易模式 ── */
          sidebarView === 'agents' ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-faint)]">AGENTS</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs text-[var(--text-faint)] hover:text-[var(--text-strong)]"
                    onClick={onRefreshAgents}
                  >
                    {tr('common.refresh')}
                  </button>
                  <button
                    type="button"
                    className="wb-icon-button h-7 w-7"
                    onClick={onToggleCreatePanel}
                    title={tr('common.create')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="wb-icon-button h-7 w-7"
                    title={tr('app.sidebar.collapse')}
                    onClick={onToggleSidebarCollapsed}
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {showCreatePanel && (
                <div className="wb-card-strong space-y-2 rounded-[18px] p-3">
                  <input
                    type="text"
                    value={newAgentName}
                    placeholder={tr('app.agent.name')}
                    onChange={event => onNewAgentNameChange(event.target.value)}
                    className="wb-input"
                  />
                  <input
                    type="text"
                    value={newAgentWorkspace}
                    placeholder={tr('app.agent.workspace_path')}
                    onChange={event => onNewAgentWorkspaceChange(event.target.value)}
                    className="wb-input"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      className="wb-ghost-button"
                      onClick={onCloseCreatePanel}
                    >
                      {tr('common.cancel')}
                    </button>
                    <button
                      type="button"
                      className="wb-primary-button"
                      onClick={onCreateAgent}
                    >
                      {tr('common.create')}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex-1 space-y-1 overflow-y-auto">
                {agents.map(agent => {
                  const label = agent.identity?.emoji
                    ? `${agent.identity.emoji} ${agent.name?.trim() || agent.identity.name?.trim() || agent.id}`
                    : agent.name?.trim() || agent.identity?.name?.trim() || agent.id
                  return (
                    <div
                      key={agent.id}
                      className={cn(
                        'group flex items-center gap-2 rounded-[18px] border px-3 py-3 transition-colors shadow-[var(--inset-highlight)]',
                        focusedAgentId === agent.id
                          ? 'border-[var(--border-accent)] bg-[var(--surface-active)] text-[var(--color-blue-100)]'
                          : 'border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)] text-[var(--text-loud)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-hover)]',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left text-sm"
                        onClick={() => onFocusAgent(agent.id)}
                        onDoubleClick={() => {
                          onFocusAgent(agent.id)
                          setSidebarView('sessions')
                        }}
                      >
                        <div className="truncate">{label}</div>
                      </button>
                      <button
                        type="button"
                        className="wb-icon-button h-7 w-7 shrink-0 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                        title={tr('app.session.new')}
                        onClick={() => {
                          onFocusAgent(agent.id)
                          onResetFocusedSession()
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            /* 简易模式 - Sessions 子页面 */
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-faint)] hover:text-[var(--text-strong)]"
                  onClick={() => setSidebarView('agents')}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  {tr('app.sidebar.back_to_agents')}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!focusedAgentId}
                    className="text-xs text-[var(--text-faint)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
                    onClick={onRefreshSessions}
                  >
                    {tr('common.refresh')}
                  </button>
                  <button
                    type="button"
                    disabled={!focusedAgentId}
                    className="text-xs text-[var(--text-faint)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
                    onClick={onResetFocusedSession}
                  >
                    {tr('app.session.new')}
                  </button>
                </div>
              </div>
              <div className="truncate text-xs font-medium text-[var(--text-subtle)]">
                {currentAgent?.name?.trim() || currentAgent?.identity?.name?.trim() || currentAgent?.id || tr('app.agent.unselected')}
              </div>

              {isLoadingSessions ? (
                <div className="flex items-center gap-1 text-xs text-[var(--text-faint)]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {tr('app.session.loading')}
                </div>
              ) : (
                <div className="flex-1 space-y-1 overflow-y-auto">
                  {sessions.map(session => (
                    <div
                      key={session.key}
                      className={cn(
                        'group flex items-center gap-2 rounded-[16px] border px-3 py-2.5 shadow-[var(--inset-highlight)]',
                        focusedSessionKey === session.key
                          ? 'border-[var(--border-accent)] bg-[var(--surface-active)]'
                          : 'border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)]',
                      )}
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => onFocusSession(session.key)}
                      >
                        <div className="truncate text-xs text-[var(--text-loud)]">{session.displayName ?? session.key.split(':').slice(2).join(':')}</div>
                        <div className="truncate text-[11px] text-[var(--text-faint)]">{session.lastMessagePreview ?? session.key}</div>
                      </button>
                      <button
                        type="button"
                        className="wb-icon-button h-7 w-7 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                        onClick={() => onRenameSession(session.key)}
                        title={tr('app.session.rename')}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="wb-icon-button h-7 w-7 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                        onClick={() => onDeleteSession(session.key)}
                        title={tr('app.session.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          /* ── 详细模式（保持原有布局不变） ── */
          <>
            <div className="border-b border-[var(--border-default)] px-4 py-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-faint)]">AGENTS</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs text-[var(--text-faint)] hover:text-[var(--text-strong)]"
                onClick={onRefreshAgents}
              >
                {tr('common.refresh')}
              </button>
              <button
                type="button"
                className="wb-icon-button h-7 w-7"
                onClick={onToggleCreatePanel}
                title={tr('common.create')} 
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="relative">
              <select
                value={focusedAgentId ?? ''}
                disabled={agents.length === 0}
                className="wb-select h-10 w-full pr-9 text-sm disabled:cursor-not-allowed"
                onChange={(event) => {
                  const nextAgentId = event.target.value
                  if (nextAgentId) onFocusAgent(nextAgentId)
                }}
                title={tr('app.agent.select')}
              >
                {!focusedAgentId && <option value="">{tr('app.agent.select')}</option>}
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.identity?.emoji
                      ? `${agent.identity.emoji} ${agent.name?.trim() || agent.identity.name?.trim() || agent.id}`
                      : agent.name?.trim() || agent.identity?.name?.trim() || agent.id}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-faint)]" />
            </div>
            <div className="truncate text-[11px] text-[var(--text-faint)]">
              {currentAgent ? tr('app.agent.current', { agentId: currentAgent.id }) : tr('app.agent.none')}
            </div>
          </div>

          {showCreatePanel && (
            <div className="wb-card-strong mt-3 space-y-2 rounded-[18px] p-3">
              <input
                type="text"
                value={newAgentName}
                placeholder={tr('app.agent.name')}
                onChange={event => onNewAgentNameChange(event.target.value)}
                className="wb-input"
              />
              <input
                type="text"
                value={newAgentWorkspace}
                placeholder={tr('app.agent.workspace_path')}
                onChange={event => onNewAgentWorkspaceChange(event.target.value)}
                className="wb-input"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  className="wb-ghost-button"
                  onClick={onCloseCreatePanel}
                >
                  {tr('common.cancel')}
                </button>
                <button
                  type="button"
                  className="wb-primary-button"
                  onClick={onCreateAgent}
                >
                  {tr('common.create')}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3">
          <div className="wb-card-strong flex min-h-0 flex-1 flex-col rounded-[20px] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium tracking-[0.16em] text-[var(--text-faint)]">SESSIONS</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!focusedAgentId}
                  className="text-xs text-[var(--text-faint)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
                  onClick={onRefreshSessions}
                >
                  {tr('common.refresh')}
                </button>
                <button
                  type="button"
                  disabled={!focusedAgentId}
                  className="text-xs text-[var(--text-faint)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:text-[var(--text-faint)]"
                  onClick={onResetFocusedSession}
                >
                  {tr('app.session.new')}
                </button>
              </div>
            </div>

            {isLoadingSessions ? (
              <div className="mt-2 flex items-center gap-1 text-xs text-[var(--text-faint)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {tr('app.session.loading')}
              </div>
            ) : (
              <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
                {sessions.map(session => (
                  <div
                    key={session.key}
                    className={cn(
                      'group flex items-center gap-2 rounded-[16px] border px-3 py-2.5 shadow-[var(--inset-highlight)]',
                      focusedSessionKey === session.key
                        ? 'border-[var(--border-accent)] bg-[var(--surface-active)]'
                        : 'border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)]',
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onFocusSession(session.key)}
                    >
                      <div className="truncate text-xs text-[var(--text-loud)]">{session.displayName ?? session.key.split(':').slice(2).join(':')}</div>
                      <div className="truncate text-[11px] text-[var(--text-faint)]">{session.lastMessagePreview ?? session.key}</div>
                    </button>
                    <button
                      type="button"
                      className="wb-icon-button h-7 w-7 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                      onClick={() => onRenameSession(session.key)}
                      title={tr('app.session.rename')}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="wb-icon-button h-7 w-7 md:opacity-0 md:transition-opacity md:group-hover:opacity-100"
                      onClick={() => onDeleteSession(session.key)}
                      title={tr('app.session.delete')}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
          </>
        )}

        {activePanel === 'health' && (
          <div className="fixed inset-0 z-40 bg-[var(--surface-right-panel)] md:absolute md:inset-0 md:z-20">
            <HealthPanel {...healthPanelProps} onRefresh={onRefreshHealth} onClose={onClosePanel} />
          </div>
        )}

        {activePanel === 'cron' && (
          <div className="fixed inset-0 z-40 bg-[var(--surface-right-panel)] md:absolute md:inset-0 md:z-20">
            <CronPanel {...cronPanelProps} onClose={onClosePanel} />
          </div>
        )}

        {activePanel === 'webServer' && (
          <div className="fixed inset-0 z-40 bg-[var(--surface-right-panel)] md:absolute md:inset-0 md:z-20">
            <Suspense fallback={<LazyPanelFallback title={`${tr('panel.web.title')} · ${tr('common.loading')}`} />}>
              <LazyWebServerPanel {...webServerPanelProps} onClose={onClosePanel} />
            </Suspense>
          </div>
        )}
      </div>

      {sidebarOpen && (
        <button
          type="button"
          className="flex-1 bg-overlay md:hidden"
          onClick={onCloseSidebarDrawer}
          aria-label={tr('app.sidebar.close')}
        />
      )}
    </aside>
  )
}
