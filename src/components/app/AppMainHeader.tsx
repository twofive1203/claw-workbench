import { useEffect, useState, type CSSProperties, type RefObject } from 'react'
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
  onApplySessionSettings: () => void
  sessionThinkingLevelOptions: string[]
  currentSessionThinkingLevel: string
  thinkingSelectRef: RefObject<HTMLSelectElement | null>
  chatFontSizePreset: 'compact' | 'default' | 'comfortable' | 'large' | 'xlarge'
  onChatFontSizePresetChange: (preset: 'compact' | 'default' | 'comfortable' | 'large' | 'xlarge') => void
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

type ChatFontSizePreset = AppMainHeaderProps['chatFontSizePreset']

interface HeaderControlMetrics {
  topGapClass: string
  topPaddingClass: string
  topMetaGapClass: string
  topChipClass: string
  topMetaTextClass: string
  cardClassName: string
  groupClassName: string
  modelWrapClassName: string
  thinkingWrapClassName: string
  fontWrapClassName: string
  labelClassName: string
  buttonClassName: string
  multiModelCountClassName: string
  selectStyle: CSSProperties
  inputStyle: CSSProperties
  fontSelectStyle: CSSProperties
}

const HEADER_CONTROL_METRICS: Record<ChatFontSizePreset, HeaderControlMetrics> = {
  compact: {
    topGapClass: 'space-y-2',
    topPaddingClass: 'px-4 py-2.5 md:px-5',
    topMetaGapClass: 'gap-1',
    topChipClass: 'px-1.5 py-0.5 text-[9px]',
    topMetaTextClass: 'text-[10px]',
    cardClassName: 'rounded-[12px] px-1.5 py-1 gap-x-2 gap-y-1',
    groupClassName: 'flex-[1_1_520px] gap-x-2 gap-y-1',
    modelWrapClassName: 'flex-[0_1_188px] gap-1',
    thinkingWrapClassName: 'flex-[0_1_88px] gap-1',
    fontWrapClassName: 'gap-1',
    labelClassName: 'text-[9px]',
    buttonClassName: 'h-7 px-2.5 py-0.5 text-[9px]',
    multiModelCountClassName: 'px-1.5 py-0 text-[8px]',
    selectStyle: {
      minHeight: '26px',
      height: '26px',
      borderRadius: '8px',
      paddingLeft: '10px',
      paddingRight: '24px',
      fontSize: '10px',
      lineHeight: '1.2',
    },
    inputStyle: {
      minHeight: '26px',
      height: '26px',
      borderRadius: '8px',
      paddingLeft: '10px',
      paddingRight: '10px',
      fontSize: '10px',
      lineHeight: '1.2',
    },
    fontSelectStyle: {
      minHeight: '28px',
      height: '28px',
      width: '88px',
      borderRadius: '8px',
      paddingLeft: '8px',
      paddingRight: '28px',
      fontSize: '10px',
      lineHeight: '1.2',
    },
  },
  default: {
    topGapClass: 'space-y-2.5',
    topPaddingClass: 'px-4 py-3 md:px-5',
    topMetaGapClass: 'gap-1.5',
    topChipClass: 'px-2 py-0.5 text-[10px]',
    topMetaTextClass: 'text-[11px]',
    cardClassName: 'rounded-[13px] px-2 py-1.5 gap-x-2.5 gap-y-1.5',
    groupClassName: 'flex-[1_1_590px] gap-x-2.5 gap-y-1.5',
    modelWrapClassName: 'flex-[0_1_236px] gap-1.5',
    thinkingWrapClassName: 'flex-[0_1_112px] gap-1.5',
    fontWrapClassName: 'gap-1.5',
    labelClassName: 'text-[10px]',
    buttonClassName: 'h-8 px-3 py-1 text-[10px]',
    multiModelCountClassName: 'px-1.5 py-0.5 text-[9px]',
    selectStyle: {
      minHeight: '29px',
      height: '29px',
      borderRadius: '9px',
      paddingLeft: '11px',
      paddingRight: '27px',
      fontSize: '11px',
      lineHeight: '1.28',
    },
    inputStyle: {
      minHeight: '29px',
      height: '29px',
      borderRadius: '9px',
      paddingLeft: '11px',
      paddingRight: '11px',
      fontSize: '11px',
      lineHeight: '1.28',
    },
    fontSelectStyle: {
      minHeight: '31px',
      height: '31px',
      width: '98px',
      borderRadius: '9px',
      paddingLeft: '10px',
      paddingRight: '30px',
      fontSize: '11px',
      lineHeight: '1.28',
    },
  },
  comfortable: {
    topGapClass: 'space-y-2.5',
    topPaddingClass: 'px-4 py-3 md:px-5',
    topMetaGapClass: 'gap-1.5',
    topChipClass: 'px-2 py-0.5 text-[10px]',
    topMetaTextClass: 'text-[11px]',
    cardClassName: 'rounded-[13px] px-2 py-1.5 gap-x-2.5 gap-y-1.5',
    groupClassName: 'flex-[1_1_590px] gap-x-2.5 gap-y-1.5',
    modelWrapClassName: 'flex-[0_1_236px] gap-1.5',
    thinkingWrapClassName: 'flex-[0_1_112px] gap-1.5',
    fontWrapClassName: 'gap-1.5',
    labelClassName: 'text-[10px]',
    buttonClassName: 'h-8 px-3 py-1 text-[10px]',
    multiModelCountClassName: 'px-1.5 py-0.5 text-[9px]',
    selectStyle: {
      minHeight: '29px',
      height: '29px',
      borderRadius: '9px',
      paddingLeft: '11px',
      paddingRight: '27px',
      fontSize: '11px',
      lineHeight: '1.28',
    },
    inputStyle: {
      minHeight: '29px',
      height: '29px',
      borderRadius: '9px',
      paddingLeft: '11px',
      paddingRight: '11px',
      fontSize: '11px',
      lineHeight: '1.28',
    },
    fontSelectStyle: {
      minHeight: '31px',
      height: '31px',
      width: '98px',
      borderRadius: '9px',
      paddingLeft: '10px',
      paddingRight: '30px',
      fontSize: '11px',
      lineHeight: '1.28',
    },
  },
  large: {
    topGapClass: 'space-y-2.5',
    topPaddingClass: 'px-4 py-3 md:px-5',
    topMetaGapClass: 'gap-1.5',
    topChipClass: 'px-2 py-0.5 text-[10px]',
    topMetaTextClass: 'text-[12px]',
    cardClassName: 'rounded-[14px] px-2.5 py-1.5 gap-x-3 gap-y-1.5',
    groupClassName: 'flex-[1_1_640px] gap-x-3 gap-y-1.5',
    modelWrapClassName: 'flex-[0_1_252px] gap-1.5',
    thinkingWrapClassName: 'flex-[0_1_120px] gap-1.5',
    fontWrapClassName: 'gap-1.5',
    labelClassName: 'text-[10px]',
    buttonClassName: 'h-8 px-3.5 py-1 text-[10px]',
    multiModelCountClassName: 'px-1.5 py-0.5 text-[9px]',
    selectStyle: {
      minHeight: '30px',
      height: '30px',
      borderRadius: '10px',
      paddingLeft: '11px',
      paddingRight: '28px',
      fontSize: '12px',
      lineHeight: '1.3',
    },
    inputStyle: {
      minHeight: '30px',
      height: '30px',
      borderRadius: '10px',
      paddingLeft: '11px',
      paddingRight: '11px',
      fontSize: '12px',
      lineHeight: '1.3',
    },
    fontSelectStyle: {
      minHeight: '32px',
      height: '32px',
      width: '102px',
      borderRadius: '10px',
      paddingLeft: '10px',
      paddingRight: '31px',
      fontSize: '12px',
      lineHeight: '1.3',
    },
  },
  xlarge: {
    topGapClass: 'space-y-3',
    topPaddingClass: 'px-4 py-3.5 md:px-5',
    topMetaGapClass: 'gap-1.5',
    topChipClass: 'px-2 py-0.5 text-[11px]',
    topMetaTextClass: 'text-[12px]',
    cardClassName: 'rounded-[15px] px-2.5 py-2 gap-x-3 gap-y-2',
    groupClassName: 'flex-[1_1_700px] gap-x-3 gap-y-2',
    modelWrapClassName: 'flex-[0_1_272px] gap-1.5',
    thinkingWrapClassName: 'flex-[0_1_128px] gap-1.5',
    fontWrapClassName: 'gap-1.5',
    labelClassName: 'text-[11px]',
    buttonClassName: 'h-9 px-3.5 py-1 text-[11px]',
    multiModelCountClassName: 'px-2 py-0.5 text-[10px]',
    selectStyle: {
      minHeight: '32px',
      height: '32px',
      borderRadius: '10px',
      paddingLeft: '12px',
      paddingRight: '30px',
      fontSize: '13px',
      lineHeight: '1.35',
    },
    inputStyle: {
      minHeight: '32px',
      height: '32px',
      borderRadius: '10px',
      paddingLeft: '12px',
      paddingRight: '12px',
      fontSize: '13px',
      lineHeight: '1.35',
    },
    fontSelectStyle: {
      minHeight: '34px',
      height: '34px',
      width: '108px',
      borderRadius: '10px',
      paddingLeft: '11px',
      paddingRight: '33px',
      fontSize: '13px',
      lineHeight: '1.35',
    },
  },
}

/**
 * 过滤顶部需要展示的会话状态标签。
 * @param tags 原始会话标签列表。
 * @param isSimple 是否为简易模式。
 */
function getVisibleSessionSettingTags(tags: string[], isSimple: boolean): string[] {
  return tags.filter(
    tag => !isSimple || (!/^(?:思考|Thinking) /i.test(tag) && !/^(?:详细|Verbose) /i.test(tag)),
  )
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
    onApplySessionSettings,
    sessionThinkingLevelOptions,
    currentSessionThinkingLevel,
    thinkingSelectRef,
    chatFontSizePreset,
    onChatFontSizePresetChange,
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
  const metrics = HEADER_CONTROL_METRICS[chatFontSizePreset]
  const visibleSessionSettingTags = getVisibleSessionSettingTags(sessionSettingTags, isSimple)
  const shouldShowSessionMeta = visibleSessionSettingTags.length > 0 || Boolean(sessionTokenSummary)

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
    <header className={cn('wb-topbar', metrics.topGapClass, metrics.topPaddingClass)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-strong)]">{currentAgentLabel}</div>
          <div className="truncate text-xs text-[var(--text-faint)]">{focusedSessionKey ?? tr('app.session.unselected')}</div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {shouldShowSessionMeta && (
            <div className={cn('mr-1 flex min-w-0 max-w-full flex-wrap items-center justify-end', metrics.topMetaGapClass)}>
              {visibleSessionSettingTags.map(tag => (
                <span
                  key={tag}
                  className={cn('wb-chip-muted', metrics.topChipClass)}
                >
                  {tag}
                </span>
              ))}
              {sessionTokenSummary && (
                <span className={cn('truncate text-[var(--text-faint)]', metrics.topMetaTextClass)}>{sessionTokenSummary}</span>
              )}
            </div>
          )}

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
            className="wb-mini-button"
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

      <div className={cn('wb-card flex flex-wrap items-center justify-between', metrics.cardClassName)}>
        <div className={cn('flex min-w-0 flex-wrap items-center', metrics.groupClassName)}>
          <div className={cn('flex min-w-0 items-center', metrics.modelWrapClassName)}>
            <span className={cn('shrink-0 font-medium text-[var(--text-faint)]', metrics.labelClassName)}>{tr('app.model.label')}</span>
            {sessionModelOptions.length > 0 ? (
              <select
                ref={modelSelectRef}
                value={draftModel}
                onChange={event => setDraftModel(event.target.value)}
                disabled={!focusedSessionKey}
                className="wb-select min-w-0 flex-1"
                style={metrics.selectStyle}
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
                className="wb-input min-w-0 flex-1"
                style={metrics.inputStyle}
              />
            )}
          </div>

          <div className={cn('flex min-w-0 items-center', metrics.thinkingWrapClassName)}>
            <span className={cn('shrink-0 font-medium text-[var(--text-faint)]', metrics.labelClassName)}>{tr('app.thinking_level.label')}</span>
            <select
              ref={thinkingSelectRef}
              value={draftThinkingLevel}
              onChange={event => setDraftThinkingLevel(event.target.value)}
              disabled={!focusedSessionKey}
              className="wb-select min-w-0 flex-1"
              style={metrics.selectStyle}
            >
              <option value="">{tr('app.thinking_level.placeholder')}</option>
              {sessionThinkingLevelOptions.map(level => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </div>

          <div className={cn('flex shrink-0 items-center', metrics.fontWrapClassName)}>
            <span className={cn('shrink-0 font-medium text-[var(--text-faint)]', metrics.labelClassName)}>{tr('app.font_size.label')}</span>
            <select
              value={chatFontSizePreset}
              onChange={event => onChatFontSizePresetChange(event.target.value as ChatFontSizePreset)}
              className="wb-select shrink-0"
              style={metrics.fontSelectStyle}
              title={tr('app.font_size.title')}
            >
              <option value="compact">{tr('app.font_size.compact')}</option>
              <option value="default">{tr('app.font_size.default')}</option>
              <option value="comfortable">{tr('app.font_size.comfortable')}</option>
              <option value="large">{tr('app.font_size.large')}</option>
              <option value="xlarge">{tr('app.font_size.xlarge')}</option>
            </select>
          </div>
        </div>

        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            disabled={!focusedSessionKey}
            className={cn('wb-mini-button shrink-0', metrics.buttonClassName)}
            onClick={onApplySessionSettings}
          >
            {tr('common.apply')}
          </button>

          {!isSimple && (
            <>
              <button
                type="button"
                disabled={!canUseMultiModelMode}
                className={cn(
                  'wb-mini-button shrink-0',
                  metrics.buttonClassName,
                  canUseMultiModelMode && isMultiModelMode
                    ? 'is-active border-[var(--border-accent)] bg-[var(--surface-active)] text-[var(--color-blue-200)]'
                    : '',
                )}
                onClick={onToggleMultiModelMode}
                title={tr('app.multi_model.description')}
                aria-label={tr('app.multi_model.title')}
              >
                {isMultiModelMode ? tr('app.multi_model.compact_on') : tr('app.multi_model.compact_off')}
              </button>
              {isMultiModelMode && (
                <span
                  className={cn('wb-chip-muted', metrics.multiModelCountClassName)}
                  title={tr('app.multi_model.enabled_count', { count: multiModelPaneCount })}
                >
                  {tr('app.multi_model.compact_count', { count: multiModelPaneCount })}
                </span>
              )}
            </>
          )}

          <button
            type="button"
            className={cn(
              'wb-mini-button shrink-0',
              metrics.buttonClassName,
              showToolCallDetails
                ? 'is-active border-[var(--border-accent)] bg-[var(--surface-active)] text-[var(--color-blue-200)]'
                : '',
            )}
            onClick={() => onShowToolCallDetailsChange(!showToolCallDetails)}
            title={tr('app.tool_calls.show')}
          >
            {showToolCallDetails ? tr('app.tool_calls.button_on') : tr('app.tool_calls.button_off')}
          </button>
        </div>
      </div>

    </header>
  )
}
