import { useMemo, useRef, useState } from 'react'
import {
  Boxes,
  Bot,
  Cable,
  Clock3,
  Cog,
  FileCode2,
  Loader2,
  Network,
  Palette,
  Server,
  Sparkles,
  Wrench,
} from 'lucide-react'
import type { ConfigValidationIssue } from '../../lib/configSchema'
import type { ConfigRpcState, OpenClawConfig } from '../../types/config'
import type { SaveConfigOptions } from '../../hooks/useConfigStore'
import type { RpcCaller } from '../../hooks/useConfigRpc'
import { ConfigToolbar, type ConfigViewMode } from './ConfigToolbar'
import { JsonEditor } from './JsonEditor'
import { ThemeSwitcher } from '../ThemeSwitcher'
import { ConfirmModal } from '../ConfirmModal'
import { AgentDefaultsSection } from './sections/AgentDefaultsSection'
import { AgentListSection } from './sections/AgentListSection'
import { BindingsSection } from './sections/BindingsSection'
import { ChannelsSection } from './sections/ChannelsSection'
import { GatewaySection } from './sections/GatewaySection'
import { LoggingSection } from './sections/LoggingSection'
import { ModelsSection } from './sections/ModelsSection'
import { PluginsSection } from './sections/PluginsSection'
import { SkillsSection } from './sections/SkillsSection'
import { UiSection } from './sections/UiSection'
import { WizardSection } from './sections/WizardSection'
import { type ThemeId } from '../../data/themes'
import { useLocalizedSubtree } from '../../i18n/useLocalizedSubtree'
import { useI18n } from '../../i18n/useI18n'
import { LanguageSwitcher } from '../LanguageSwitcher'

type ConfigTabId =
  | 'models'
  | 'agents'
  | 'agentDefaults'
  | 'plugins'
  | 'channels'
  | 'gateway'
  | 'ui'
  | 'wizard'
  | 'logging'
  | 'bindings'
  | 'skills'

/**
 * 配置面板依赖的 store 结构。
 * @param ready 是否初始化完成。
 * @param config 当前配置对象。
 * @param configPath 当前配置文件路径。
 * @param mode 当前读写模式（rpc/local）。
 * @param validationIssues 校验问题列表。
 * @param isLoading 是否加载中。
 * @param isSaving 是否保存中。
 * @param isDirty 是否有未保存修改。
 * @param error 错误信息。
 * @param updateConfig 配置更新函数。
 * @param pickConfigFile 选择配置文件回调。
 * @param saveConfig 保存配置回调。
 * @param revertConfig 还原配置回调。
 */
interface ConfigPanelStore {
  ready: boolean
  config: OpenClawConfig
  configPath: string
  mode: ConfigRpcState
  validationIssues: ConfigValidationIssue[]
  isLoading: boolean
  isSaving: boolean
  isDirty: boolean
  error: string | null
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
  pickConfigFile: () => Promise<string | null>
  saveConfig: (options?: SaveConfigOptions) => Promise<boolean>
  revertConfig: () => void
  pendingReloadMessage: string | null
  confirmReload: () => Promise<void>
  dismissReload: () => void
}

/**
 * 配置面板属性。
 * @param store 配置存储对象（来自 useConfigStore）。
 * @param callRpc 通用 RPC 调用器（由 useOpenClaw 透传）。
 * @param onClose 关闭面板回调。
 */
interface ConfigPanelProps {
  store: ConfigPanelStore
  callRpc: RpcCaller
  themeId: ThemeId
  onThemeChange: (themeId: ThemeId) => void
  onClose?: () => void
}

const TAB_ITEMS = [
  { id: 'models', labelKey: 'config.tab.models', icon: Boxes, issuePathPrefix: 'models' },
  { id: 'agents', labelKey: 'config.tab.agents', icon: Bot, issuePathPrefix: 'agents.list' },
  { id: 'agentDefaults', labelKey: 'config.tab.agent_defaults', icon: Cog, issuePathPrefix: 'agents.defaults' },
  { id: 'plugins', labelKey: 'config.tab.plugins', icon: Wrench, issuePathPrefix: 'plugins' },
  { id: 'channels', labelKey: 'config.tab.channels', icon: Network, issuePathPrefix: 'channels' },
  { id: 'gateway', labelKey: 'config.tab.gateway', icon: Server, issuePathPrefix: 'gateway' },
  { id: 'ui', labelKey: 'config.tab.ui', icon: Palette, issuePathPrefix: 'ui' },
  { id: 'wizard', labelKey: 'config.tab.wizard', icon: Clock3, issuePathPrefix: 'wizard' },
  { id: 'logging', labelKey: 'config.tab.logging', icon: FileCode2, issuePathPrefix: 'logging' },
  { id: 'bindings', labelKey: 'config.tab.bindings', icon: Cable, issuePathPrefix: 'bindings' },
  { id: 'skills', label: 'Skills', icon: Sparkles, issuePathPrefix: '' },
] as const

/**
 * 根据路径前缀统计问题数量。
 * @param issues 校验问题列表。
 * @param prefix 路径前缀。
 */
function countIssuesByPrefix(issues: ConfigValidationIssue[], prefix: string): number {
  return issues.filter(item => item.path === prefix || item.path.startsWith(`${prefix}.`)).length
}

/**
 * 配置主面板。
 * @param props 组件属性。
 */
export function ConfigPanel(props: ConfigPanelProps) {
  const { store, callRpc, themeId, onThemeChange, onClose } = props
  const [activeTab, setActiveTab] = useState<ConfigTabId>('models')
  const [viewMode, setViewMode] = useState<ConfigViewMode>('form')
  const panelRef = useRef<HTMLDivElement | null>(null)
  const { tr } = useI18n()

  useLocalizedSubtree(panelRef)

  const {
    ready,
    config,
    configPath,
    mode,
    validationIssues,
    isLoading,
    isSaving,
    isDirty,
    error,
    updateConfig,
    pickConfigFile,
    saveConfig,
    revertConfig,
    pendingReloadMessage,
    confirmReload,
    dismissReload,
  } = store

  const toolbarMode: ConfigRpcState = mode === 'rpc' && typeof callRpc === 'function'
    ? 'rpc'
    : 'local'

  const tabIssueMap = useMemo(() => {
    const issueMap: Record<ConfigTabId, number> = {
      models: 0,
      agents: 0,
      agentDefaults: 0,
      plugins: 0,
      channels: 0,
      gateway: 0,
      ui: 0,
      wizard: 0,
      logging: 0,
      bindings: 0,
      skills: 0,
    }

    for (const tab of TAB_ITEMS) {
      issueMap[tab.id] = countIssuesByPrefix(validationIssues, tab.issuePathPrefix)
    }

    return issueMap
  }, [validationIssues])

  /**
   * 处理视图模式切换。
   * @param nextViewMode 目标视图模式。
   */
  const handleViewModeChange = (nextViewMode: ConfigViewMode) => {
    setViewMode(nextViewMode)
  }

  /**
   * 处理保存动作（表单走 patch，JSON 走 apply）。
   */
  const handleSave = () => saveConfig({
    writeMode: viewMode === 'json' ? 'apply' : 'patch',
  })

  /**
   * 处理还原动作（回滚到最近一次加载/保存状态）。
   */
  const handleRevert = () => {
    revertConfig()
  }

  /**
   * 渲染当前 Tab 内容。
   * @param tab 当前 Tab。
   */
  const renderTabContent = (tab: ConfigTabId) => {
    if (tab === 'models') {
      return (
        <ModelsSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'agents') {
      return (
        <AgentListSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
          callRpc={callRpc}
          isConnected={mode === 'rpc'}
        />
      )
    }

    if (tab === 'agentDefaults') {
      return (
        <AgentDefaultsSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'logging') {
      return (
        <LoggingSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'plugins') {
      return (
        <PluginsSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'channels') {
      return (
        <ChannelsSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'gateway') {
      return (
        <GatewaySection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'ui') {
      return (
        <UiSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'wizard') {
      return (
        <WizardSection
          config={config}
          issues={validationIssues}
          updateConfig={updateConfig}
        />
      )
    }

    if (tab === 'skills') {
      return (
        <SkillsSection
          callRpc={callRpc}
          isConnected={mode === 'rpc'}
        />
      )
    }

    return (
      <BindingsSection
        config={config}
        issues={validationIssues}
        updateConfig={updateConfig}
      />
    )
  }

  return (
    <div ref={panelRef} className="flex h-full flex-col bg-gray-950">
      <ConfigToolbar
        configPath={configPath}
        mode={toolbarMode}
        isDirty={isDirty}
        isLoading={isLoading}
        isSaving={isSaving}
        error={error}
        viewMode={viewMode}
        onPickFile={pickConfigFile}
        onSave={handleSave}
        onRevert={handleRevert}
        onViewChange={handleViewModeChange}
        onClose={onClose}
      />

      <div className="border-b border-gray-800 bg-gray-900/70 px-4 py-2">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-gray-400">
            {tr('config.theme_label')}
          </label>
          <ThemeSwitcher
            themeId={themeId}
            onThemeChange={onThemeChange}
          />
          <LanguageSwitcher />
        </div>
      </div>

      {viewMode === 'form' && (
        <div className="border-b border-gray-800 bg-gray-900/70 px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            {TAB_ITEMS.map(tab => {
              const Icon = tab.icon
              const issueCount = tabIssueMap[tab.id]
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs ${
                    activeTab === tab.id
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-100'
                      : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600'
                  }`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {'labelKey' in tab ? tr(tab.labelKey) : tab.label}
                  {issueCount > 0 && (
                    <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] text-red-200">
                      {issueCount}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === 'form' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {!ready ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {tr('config.init')}
            </div>
          ) : (
            renderTabContent(activeTab)
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-hidden px-4 py-3">
          {!ready ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              {tr('config.init')}
            </div>
          ) : (
            <JsonEditor
              config={config}
              configPath={configPath}
              issues={validationIssues}
              showConfigPath={toolbarMode !== 'rpc'}
              onChange={nextConfig => updateConfig(() => nextConfig)}
            />
          )}
        </div>
      )}

      {pendingReloadMessage && (
        <ConfirmModal
          title={tr('config.reload_conflict')}
          description={pendingReloadMessage}
          confirmText={tr('config.reload')}
          onCancel={dismissReload}
          onConfirm={() => void confirmReload()}
        />
      )}
    </div>
  )
}
