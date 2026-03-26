/**
 * UI 配置分区。
 * 说明：覆盖新版 ui 常用显示字段，方便直接调整界面品牌信息。
 * @author lichong
 */

import type { ConfigValidationIssue } from '../../../lib/configSchema'
import type { OpenClawConfig, UiConfig } from '../../../types/config'
import { FormField } from '../shared/FormField'
import { findIssueByPath } from './utils'

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

/**
 * UI 分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface UiSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * UI 分区组件。
 * @param props 组件属性。
 */
export function UiSection(props: UiSectionProps) {
  const { config, issues, updateConfig } = props
  const ui = config.ui ?? {}

  /**
   * 更新 ui 对象。
   * @param updater ui 更新函数。
   */
  const updateUi = (updater: (value: UiConfig) => UiConfig) => {
    updateConfig(prev => ({
      ...prev,
      ui: updater(prev.ui ?? {}),
    }))
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="text-xs font-medium text-gray-300">UI 配置</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField
          label="seamColor"
          description="OpenClaw UI 强调色，通常填写十六进制颜色。"
          error={findIssueByPath(issues, 'ui.seamColor') ?? null}
        >
          <input
            type="text"
            value={ui.seamColor ?? ''}
            placeholder="例如 #3b82f6"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateUi(current => ({
                ...current,
                seamColor: nextValue || undefined,
              }))
            }}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField
          label="assistant.name"
          description="助手在 UI 中展示的名称。"
          error={findIssueByPath(issues, 'ui.assistant.name') ?? null}
        >
          <input
            type="text"
            value={ui.assistant?.name ?? ''}
            placeholder="例如 OpenClaw"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateUi(current => ({
                ...current,
                assistant: {
                  ...(current.assistant ?? {}),
                  name: nextValue || undefined,
                },
              }))
            }}
          />
        </FormField>

        <FormField
          label="assistant.avatar"
          description="支持 emoji、文本、图片 URL 或 data URI。"
          error={findIssueByPath(issues, 'ui.assistant.avatar') ?? null}
        >
          <input
            type="text"
            value={ui.assistant?.avatar ?? ''}
            placeholder="例如 🤖 或 https://..."
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateUi(current => ({
                ...current,
                assistant: {
                  ...(current.assistant ?? {}),
                  avatar: nextValue || undefined,
                },
              }))
            }}
          />
        </FormField>
      </div>
    </div>
  )
}
