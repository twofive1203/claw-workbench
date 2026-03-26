import type { ConfigValidationIssue } from '../../../lib/configSchema'
import { isRecord, type AgentDefaultsConfig, type OpenClawConfig } from '../../../types/config'
import { ArrayEditor } from '../shared/ArrayEditor'
import { FormField } from '../shared/FormField'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { findIssueByPath } from './utils'

const THINKING_OPTIONS: SelectOption[] = [
  { label: 'off', value: 'off' },
  { label: 'minimal', value: 'minimal' },
  { label: 'low', value: 'low' },
  { label: 'medium', value: 'medium' },
  { label: 'high', value: 'high' },
  { label: 'xhigh', value: 'xhigh' },
]

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

/**
 * Agent 默认配置分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface AgentDefaultsSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 解析可选数字。
 * @param value 输入文本。
 */
function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * 将数字转为输入框文本。
 * @param value 数值。
 */
function numberToInput(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : ''
}

/**
 * 将 models 允许列表转为可编辑数组。
 * @param value models 字段值。
 */
function modelAllowListToArray(value: AgentDefaultsConfig['models'] | undefined): string[] {
  if (!isRecord(value)) return []
  return Object.keys(value)
}

/**
 * 根据输入数组构造 models 允许列表对象。
 * @param modelIds 用户输入的模型 ID 列表。
 * @param previousValue 变更前 models 值。
 */
function buildModelAllowList(
  modelIds: string[],
  previousValue: AgentDefaultsConfig['models'] | undefined,
): AgentDefaultsConfig['models'] {
  const previousModels = isRecord(previousValue) ? previousValue : {}
  const nextModels: NonNullable<AgentDefaultsConfig['models']> = {}

  for (const item of modelIds) {
    const modelId = item
    if (Object.prototype.hasOwnProperty.call(nextModels, modelId)) continue

    const existingModelValue = previousModels[modelId]
    nextModels[modelId] = isRecord(existingModelValue) ? { ...existingModelValue } : {}
  }

  return nextModels
}

/**
 * Agent 默认配置分区组件。
 * @param props 组件属性。
 */
export function AgentDefaultsSection(props: AgentDefaultsSectionProps) {
  const { config, issues, updateConfig } = props
  const defaults = config.agents?.defaults ?? {}
  const model = defaults.model ?? {}
  const allowListedModels = modelAllowListToArray(defaults.models)
  const heartbeat = defaults.heartbeat ?? {}

  /**
   * 更新 agents.defaults 对象。
   * @param updater defaults 更新函数。
   */
  const updateDefaults = (updater: (defaultsValue: AgentDefaultsConfig) => AgentDefaultsConfig) => {
    updateConfig(prev => {
      const previousAgents = prev.agents ?? {}
      const previousDefaults = previousAgents.defaults ?? {}
      return {
        ...prev,
        agents: {
          ...previousAgents,
          defaults: updater(previousDefaults),
        },
      }
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="text-xs font-medium text-gray-300">Agent 默认配置</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField
          label="model.primary"
          error={findIssueByPath(issues, 'agents.defaults.model.primary') ?? null}
        >
          <input
            type="text"
            value={model.primary ?? ''}
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateDefaults(currentDefaults => ({
                ...currentDefaults,
                model: {
                  ...(currentDefaults.model ?? {}),
                  primary: nextValue,
                },
              }))
            }}
          />
        </FormField>

        <FormField
          label="workspace"
          error={findIssueByPath(issues, 'agents.defaults.workspace') ?? null}
        >
          <input
            type="text"
            value={defaults.workspace ?? ''}
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateDefaults(currentDefaults => ({
                ...currentDefaults,
                workspace: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField
          label="userTimezone"
          error={findIssueByPath(issues, 'agents.defaults.userTimezone') ?? null}
        >
          <input
            type="text"
            value={defaults.userTimezone ?? ''}
            placeholder="例如 Asia/Shanghai"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateDefaults(currentDefaults => ({
                ...currentDefaults,
                userTimezone: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField
          label="thinkingDefault"
          error={findIssueByPath(issues, 'agents.defaults.thinkingDefault') ?? null}
        >
          <SelectField
            value={defaults.thinkingDefault ?? ''}
            options={THINKING_OPTIONS}
            placeholder="请选择 thinking 默认值"
            onChange={nextValue => {
              updateDefaults(currentDefaults => ({
                ...currentDefaults,
                thinkingDefault: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField
          label="timeoutSeconds"
          error={findIssueByPath(issues, 'agents.defaults.timeoutSeconds') ?? null}
        >
          <input
            type="number"
            value={numberToInput(defaults.timeoutSeconds)}
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = parseOptionalNumber(event.target.value)
              updateDefaults(currentDefaults => ({
                ...currentDefaults,
                timeoutSeconds: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField
          label="contextTokens"
          error={findIssueByPath(issues, 'agents.defaults.contextTokens') ?? null}
        >
          <input
            type="number"
            value={numberToInput(defaults.contextTokens)}
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = parseOptionalNumber(event.target.value)
              updateDefaults(currentDefaults => ({
                ...currentDefaults,
                contextTokens: nextValue,
              }))
            }}
          />
        </FormField>
      </div>

      <FormField
        label="model.fallbacks"
        error={findIssueByPath(issues, 'agents.defaults.model.fallbacks') ?? null}
      >
        <ArrayEditor
          value={model.fallbacks}
          itemPlaceholder="例如 gpt-4o-mini"
          addLabel="新增回退模型"
          sortable
          onChange={nextValue => {
            updateDefaults(currentDefaults => ({
              ...currentDefaults,
              model: {
                ...(currentDefaults.model ?? {}),
                fallbacks: nextValue,
              },
            }))
          }}
        />
      </FormField>

      <FormField
        label="models（允许切换模型）"
        description="写入 agents.defaults.models；未配置时可能无法在会话中切换模型。"
        error={findIssueByPath(issues, 'agents.defaults.models') ?? null}
      >
        <ArrayEditor
          value={allowListedModels}
          itemPlaceholder="例如 openai-codex/gpt-5.3-codex"
          addLabel="新增允许模型"
          sortable
          onChange={nextValue => {
            updateDefaults(currentDefaults => ({
              ...currentDefaults,
              models: buildModelAllowList(nextValue, currentDefaults.models),
            }))
          }}
        />
      </FormField>

      <FormField
        label="heartbeat.every"
        error={findIssueByPath(issues, 'agents.defaults.heartbeat.every') ?? null}
      >
        <input
          type="text"
          value={heartbeat.every ?? ''}
          placeholder="例如 15s"
          className={INPUT_CLASS_NAME}
          onChange={event => {
            const nextValue = event.target.value
            updateDefaults(currentDefaults => ({
              ...currentDefaults,
              heartbeat: {
                ...(currentDefaults.heartbeat ?? {}),
                every: nextValue,
              },
            }))
          }}
        />
      </FormField>
    </div>
  )
}
