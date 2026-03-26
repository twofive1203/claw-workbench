/**
 * 向导配置分区。
 * 说明：用于展示与调整新版 wizard 最近运行记录字段。
 * @author lichong
 */

import type { ConfigValidationIssue } from '../../../lib/configSchema'
import type { OpenClawConfig, WizardConfig } from '../../../types/config'
import { FormField } from '../shared/FormField'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { findIssueByPath } from './utils'

const WIZARD_MODE_OPTIONS: SelectOption[] = [
  { label: 'local', value: 'local' },
  { label: 'remote', value: 'remote' },
]

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

/**
 * 向导分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface WizardSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 向导分区组件。
 * @param props 组件属性。
 */
export function WizardSection(props: WizardSectionProps) {
  const { config, issues, updateConfig } = props
  const wizard = config.wizard ?? {}

  /**
   * 更新 wizard 对象。
   * @param updater wizard 更新函数。
   */
  const updateWizard = (updater: (value: WizardConfig) => WizardConfig) => {
    updateConfig(prev => ({
      ...prev,
      wizard: updater(prev.wizard ?? {}),
    }))
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="text-xs font-medium text-gray-300">向导运行记录</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField
          label="lastRunAt"
          description="最近一次运行时间，建议使用 ISO 时间字符串。"
          error={findIssueByPath(issues, 'wizard.lastRunAt') ?? null}
        >
          <input
            type="text"
            value={wizard.lastRunAt ?? ''}
            placeholder="例如 2026-03-24T12:00:00.000Z"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateWizard(current => ({
                ...current,
                lastRunAt: nextValue || undefined,
              }))
            }}
          />
        </FormField>

        <FormField
          label="lastRunMode"
          description="最近一次向导运行模式。"
          error={findIssueByPath(issues, 'wizard.lastRunMode') ?? null}
        >
          <SelectField
            value={wizard.lastRunMode ?? ''}
            options={WIZARD_MODE_OPTIONS}
            placeholder="请选择运行模式"
            onChange={nextValue => {
              updateWizard(current => ({
                ...current,
                lastRunMode: nextValue || undefined,
              }))
            }}
          />
        </FormField>

        <FormField
          label="lastRunVersion"
          description="最近运行时的 OpenClaw 版本。"
          error={findIssueByPath(issues, 'wizard.lastRunVersion') ?? null}
        >
          <input
            type="text"
            value={wizard.lastRunVersion ?? ''}
            placeholder="例如 2026.3.24"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateWizard(current => ({
                ...current,
                lastRunVersion: nextValue || undefined,
              }))
            }}
          />
        </FormField>

        <FormField
          label="lastRunCommit"
          description="最近运行版本对应提交。"
          error={findIssueByPath(issues, 'wizard.lastRunCommit') ?? null}
        >
          <input
            type="text"
            value={wizard.lastRunCommit ?? ''}
            placeholder="例如 abcdef123456"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateWizard(current => ({
                ...current,
                lastRunCommit: nextValue || undefined,
              }))
            }}
          />
        </FormField>
      </div>

      <FormField
        label="lastRunCommand"
        description="最近一次执行的向导命令。"
        error={findIssueByPath(issues, 'wizard.lastRunCommand') ?? null}
      >
        <input
          type="text"
          value={wizard.lastRunCommand ?? ''}
          placeholder="例如 openclaw init"
          className={INPUT_CLASS_NAME}
          onChange={event => {
            const nextValue = event.target.value
            updateWizard(current => ({
              ...current,
              lastRunCommand: nextValue || undefined,
            }))
          }}
        />
      </FormField>
    </div>
  )
}
