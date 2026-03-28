import { useEffect, useState, type RefObject } from 'react'
import { Check, Download, GitBranch, Loader2, Square } from 'lucide-react'
import { cn } from '../../lib/utils'

interface AppMainHeaderProps {
  tr: (key: string, params?: import('../../i18n/messages').I18nParams) => string
  chatViewMode: 'simple' | 'detailed'
  currentAgentLabel: string
  focusedSessionKey: string | null
  showSubagentPanel: boolean
  runningSubagentCount: number
  onToggleSubagentPanel: () => void
  canAbortFocusedSession: boolean
  onAbortFocusedSession: () => void
  sessionModelOptions: string[]
  currentSessionModel: string
  modelSelectRef: RefObject<HTMLSelectElement | null>
  modelInputRef: RefObject<HTMLInputElement | null>
  onApplyModel: () => void
  sessionThinkingLevelOptions: string[]
  currentSessionThinkingLevel: string
  thinkingSelectRef: RefObject<HTMLSelectElement | null>
  onApplyThinking: () => void
  isMultiModelMode: boolean
  multiModelPaneCount: number
  canUseMultiModelMode: boolean
  onToggleMultiModelMode: () => void
  showToolCallDetails: boolean
  onShowToolCallDetailsChange: (checked: boolean) => void
  sessionSettingTags: string[]
  sessionTokenSummary: string | null
  canExportSession: boolean
  isExportingSession: boolean
  isSessionExported: boolean
  onExportSession: () => void
}

/**
 * 主区头部与会话控制条。
 * @param props 组件属性。
 */
export function AppMainHeader(props: AppMainHeaderProps) {
  const {
    tr,
    chatViewMode,
    currentAgentLabel,
    focusedSessionKey,
    showSubagentPanel,
    runningSubagentCount,
    onToggleSubagentPanel,
    canAbortFocusedSession,
    onAbortFocusedSession,
    sessionModelOptions,
    currentSessionModel,
    modelSelectRef,
    modelInputRef,
    onApplyModel,
    sessionThinkingLevelOptions,
    currentSessionThinkingLevel,
    thinkingSelectRef,
    onApplyThinking,
    isMultiModelMode,
    multiModelPaneCount,
    canUseMultiModelMode,
    onToggleMultiModelMode,
    showToolCallDetails,
    onShowToolCallDetailsChange,
    sessionSettingTags,
    sessionTokenSummary,
    canExportSession,
    isExportingSession,
    isSessionExported,
    onExportSession,
  } = props

  const isSimple = chatViewMode === 'simple'
  const [draftModel, setDraftModel] = useState(currentSessionModel)
  const [draftThinkingLevel, setDraftThinkingLevel] = useState(currentSessionThinkingLevel)

  /**
   * 当前会话变化时，同步模型草稿值，避免控件停留在旧会话内容。
   * @param currentSessionModel 当前会话生效模型。
   */
  useEffect(() => {
    setDraftModel(currentSessionModel)
  }, [currentSessionModel])

  /**
   * 当前会话变化时，同步思考级别草稿值。
   * @param currentSessionThinkingLevel 当前会话思考级别。
   */
  useEffect(() => {
    setDraftThinkingLevel(currentSessionThinkingLevel)
  }, [currentSessionThinkingLevel])

  return (
    <header className="wb-topbar space-y-4 px-4 py-4 md:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-strong)]">{currentAgentLabel}</div>
          <div className="truncate text-xs text-[var(--text-faint)]">{focusedSessionKey ?? tr('app.session.unselected')}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              'wb-icon-button relative',
              showSubagentPanel
                ? 'is-active'
                : '',
            )}
            onClick={onToggleSubagentPanel}
            title={tr('panel.subagent.title')}
          >
            <GitBranch className="h-4 w-4" />
            {runningSubagentCount > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-blue-500)] px-1 text-[10px] text-[var(--color-white)]">
                {runningSubagentCount}
              </span>
            )}
          </button>

          <button
            type="button"
            disabled={!canAbortFocusedSession}
            className={cn(
              'wb-danger-button',
              canAbortFocusedSession
                ? 'border-[color-mix(in_srgb,var(--color-red-600)_34%,transparent)]'
                : '',
            )}
            onClick={onAbortFocusedSession}
          >
            <Square className="h-3.5 w-3.5" />
            {tr('common.stop')}
          </button>
        </div>
      </div>

      <div className={cn('grid gap-3', isSimple ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2')}>
        <div className="flex items-center gap-2">
          {sessionModelOptions.length > 0 ? (
            <select
              ref={modelSelectRef}
              value={draftModel}
              onChange={event => setDraftModel(event.target.value)}
              disabled={!focusedSessionKey}
              className="wb-select flex-1"
            >
              <option value="">{tr('app.model.placeholder')}</option>
              {sessionModelOptions.map(modelId => (
                <option key={modelId} value={modelId}>
                  {modelId}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={modelInputRef}
              type="text"
              value={draftModel}
              onChange={event => setDraftModel(event.target.value)}
              disabled={!focusedSessionKey}
              placeholder={tr('app.model.placeholder')}
              className="wb-input flex-1"
            />
          )}
          <button
            type="button"
            disabled={!focusedSessionKey}
            className="wb-mini-button"
            onClick={onApplyModel}
          >
            {tr('common.apply')}
          </button>
          {isSimple && (
            <button
              type="button"
              className={cn(
                'wb-mini-button shrink-0',
                showToolCallDetails
                  ? 'is-active border-[var(--border-accent)] bg-[var(--surface-active)] text-[var(--color-blue-200)]'
                  : '',
              )}
              onClick={() => onShowToolCallDetailsChange(!showToolCallDetails)}
            >
              {tr('app.tool_calls.compact_label')} {showToolCallDetails ? tr('common.enabled') : tr('common.disabled')}
            </button>
          )}
        </div>
        {!isSimple && (
          <div className="flex items-center gap-2">
            <select
              ref={thinkingSelectRef}
              value={draftThinkingLevel}
              onChange={event => setDraftThinkingLevel(event.target.value)}
              disabled={!focusedSessionKey}
              className="wb-select flex-1"
            >
              <option value="">{tr('app.thinking_level.placeholder')}</option>
              {sessionThinkingLevelOptions.map(level => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!focusedSessionKey}
              className="wb-mini-button"
              onClick={onApplyThinking}
            >
              {tr('common.apply')}
            </button>
          </div>
        )}
      </div>

      {!isSimple && (
      <div className="wb-card flex flex-col gap-2 rounded-[18px] px-3 py-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="text-xs font-medium text-[var(--text-loud)]">{tr('app.multi_model.title')}</div>
          <div className="text-[11px] text-[var(--text-faint)]">{tr('app.multi_model.description')}</div>
        </div>

        <div className="flex items-center gap-2">
          {isMultiModelMode && (
            <span className="text-[11px] text-[var(--text-faint)]">{tr('app.multi_model.enabled_count', { count: multiModelPaneCount })}</span>
          )}

          <button
            type="button"
            disabled={!canUseMultiModelMode}
            className={cn(
              'wb-pill-button',
              canUseMultiModelMode
                ? isMultiModelMode
                  ? 'is-active border-[var(--border-accent)] bg-[var(--surface-active)] text-[var(--color-blue-200)]'
                  : ''
                : '',
            )}
            onClick={onToggleMultiModelMode}
          >
            {isMultiModelMode ? tr('app.multi_model.disable') : tr('app.multi_model.enable')}
          </button>
        </div>
      </div>
      )}

      {!isSimple && (
      <div className="wb-card flex items-center justify-between rounded-[18px] px-3 py-2">
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--text-loud)]">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-[var(--color-blue-500)]"
            checked={showToolCallDetails}
            onChange={event => onShowToolCallDetailsChange(event.target.checked)}
          />
          {tr('app.tool_calls.show')}
        </label>
        <span className="text-[11px] text-[var(--text-faint)]">{showToolCallDetails ? tr('common.enabled') : tr('common.disabled')}</span>
      </div>
      )}

      {(sessionSettingTags.length > 0 || sessionTokenSummary || focusedSessionKey) && (
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            {sessionSettingTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {sessionSettingTags
                  .filter(tag => !isSimple || (!/^(?:思考|Thinking) /i.test(tag) && !/^(?:详细|Verbose) /i.test(tag)))
                  .map(tag => (
                  <span
                    key={tag}
                    className="wb-chip-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {sessionTokenSummary && <div className="text-[11px] text-[var(--text-faint)]">{sessionTokenSummary}</div>}
          </div>
          <div className="flex justify-end md:shrink-0">
            <button
              type="button"
              className="wb-pill-button"
              onClick={onExportSession}
              disabled={!canExportSession}
              title={tr('app.export.full_session_markdown')}
              aria-label={tr('app.export.full_session_markdown')}
            >
              {isExportingSession ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isSessionExported ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>{isExportingSession ? tr('common.exporting') : isSessionExported ? tr('common.exported') : tr('app.export.session_md')}</span>
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
