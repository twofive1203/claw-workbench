import type { ConfigValidationIssue } from '../../../lib/configSchema'
import type { LoggingConfig, OpenClawConfig } from '../../../types/config'
import { FormField } from '../shared/FormField'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { findIssueByPath } from './utils'

const LEVEL_OPTIONS: SelectOption[] = [
  { label: 'silent', value: 'silent' },
  { label: 'fatal', value: 'fatal' },
  { label: 'error', value: 'error' },
  { label: 'warn', value: 'warn' },
  { label: 'info', value: 'info' },
  { label: 'debug', value: 'debug' },
  { label: 'trace', value: 'trace' },
]

const CONSOLE_STYLE_OPTIONS: SelectOption[] = [
  { label: 'pretty', value: 'pretty' },
  { label: 'compact', value: 'compact' },
  { label: 'json', value: 'json' },
]

const REDACT_SENSITIVE_OPTIONS: SelectOption[] = [
  { label: 'off', value: 'off' },
  { label: 'tools', value: 'tools' },
]

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

/**
 * 日志分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface LoggingSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 日志分区组件。
 * @param props 组件属性。
 */
export function LoggingSection(props: LoggingSectionProps) {
  const { config, issues, updateConfig } = props
  const logging = config.logging ?? {}

  /**
   * 更新 logging 对象。
   * @param updater logging 更新函数。
   */
  const updateLogging = (updater: (loggingValue: LoggingConfig) => LoggingConfig) => {
    updateConfig(prev => ({
      ...prev,
      logging: updater(prev.logging ?? {}),
    }))
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="text-xs font-medium text-gray-300">日志配置</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label="level" error={findIssueByPath(issues, 'logging.level') ?? null}>
          <SelectField
            value={logging.level ?? ''}
            options={LEVEL_OPTIONS}
            placeholder="请选择 level"
            onChange={nextValue => {
              updateLogging(current => ({
                ...current,
                level: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField label="consoleLevel" error={findIssueByPath(issues, 'logging.consoleLevel') ?? null}>
          <SelectField
            value={logging.consoleLevel ?? ''}
            options={LEVEL_OPTIONS}
            placeholder="请选择 consoleLevel"
            onChange={nextValue => {
              updateLogging(current => ({
                ...current,
                consoleLevel: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField label="consoleStyle" error={findIssueByPath(issues, 'logging.consoleStyle') ?? null}>
          <SelectField
            value={logging.consoleStyle ?? ''}
            options={CONSOLE_STYLE_OPTIONS}
            placeholder="请选择 consoleStyle"
            onChange={nextValue => {
              updateLogging(current => ({
                ...current,
                consoleStyle: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField label="redactSensitive" error={findIssueByPath(issues, 'logging.redactSensitive') ?? null}>
          <SelectField
            value={logging.redactSensitive ?? ''}
            options={REDACT_SENSITIVE_OPTIONS}
            placeholder="请选择脱敏策略"
            onChange={nextValue => {
              updateLogging(current => ({
                ...current,
                redactSensitive: nextValue,
              }))
            }}
          />
        </FormField>
      </div>

      <FormField label="file" error={findIssueByPath(issues, 'logging.file') ?? null}>
        <input
          type="text"
          value={logging.file ?? ''}
          placeholder="例如 ~/.openclaw/logs/app.log"
          className={INPUT_CLASS_NAME}
          onChange={event => {
            const nextValue = event.target.value
            updateLogging(current => ({
              ...current,
              file: nextValue,
            }))
          }}
        />
      </FormField>
    </div>
  )
}
