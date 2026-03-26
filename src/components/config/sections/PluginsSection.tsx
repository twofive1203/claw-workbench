/**
 * 插件配置分区。
 * 说明：覆盖新版配置里最常用的 plugins 字段，复杂 entries/install 仍建议在 JSON 视图编辑。
 * @author lichong
 */

import type { ConfigValidationIssue } from '../../../lib/configSchema'
import type { OpenClawConfig, PluginsConfig } from '../../../types/config'
import { ArrayEditor } from '../shared/ArrayEditor'
import { FormField } from '../shared/FormField'
import { findIssueByPath } from './utils'

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

/**
 * 插件分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface PluginsSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 插件分区组件。
 * @param props 组件属性。
 */
export function PluginsSection(props: PluginsSectionProps) {
  const { config, issues, updateConfig } = props
  const plugins = config.plugins ?? {}
  const entryCount = Object.keys(plugins.entries ?? {}).length
  const installCount = Object.keys(plugins.installs ?? {}).length

  /**
   * 更新 plugins 对象。
   * @param updater plugins 更新函数。
   */
  const updatePlugins = (updater: (value: PluginsConfig) => PluginsConfig) => {
    updateConfig(prev => ({
      ...prev,
      plugins: updater(prev.plugins ?? {}),
    }))
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="text-xs font-medium text-gray-300">插件配置</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <FormField
          label="enabled"
          description="控制是否启用插件加载。"
          error={findIssueByPath(issues, 'plugins.enabled') ?? null}
        >
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-blue-500"
              checked={plugins.enabled === true}
              onChange={event => {
                const checked = event.target.checked
                updatePlugins(current => ({
                  ...current,
                  enabled: checked,
                }))
              }}
            />
            启用插件系统
          </label>
        </FormField>

        <FormField
          label="slots.memory"
          description="绑定 memory 槽位的插件 ID。"
          error={findIssueByPath(issues, 'plugins.slots.memory') ?? null}
        >
          <input
            type="text"
            value={plugins.slots?.memory ?? ''}
            placeholder="例如 memory-core"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updatePlugins(current => ({
                ...current,
                slots: {
                  ...(current.slots ?? {}),
                  memory: nextValue || undefined,
                },
              }))
            }}
          />
        </FormField>

        <FormField
          label="slots.contextEngine"
          description="绑定 context-engine 槽位的插件 ID。"
          error={findIssueByPath(issues, 'plugins.slots.contextEngine') ?? null}
        >
          <input
            type="text"
            value={plugins.slots?.contextEngine ?? ''}
            placeholder="例如 context-engine-default"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updatePlugins(current => ({
                ...current,
                slots: {
                  ...(current.slots ?? {}),
                  contextEngine: nextValue || undefined,
                },
              }))
            }}
          />
        </FormField>
      </div>

      <FormField
        label="allow"
        description="插件允许列表，留空表示不限制。"
        error={findIssueByPath(issues, 'plugins.allow') ?? null}
      >
        <ArrayEditor
          value={plugins.allow}
          itemPlaceholder="输入插件 ID"
          addLabel="新增 allow 项"
          sortable
          onChange={nextValue => {
            updatePlugins(current => ({
              ...current,
              allow: nextValue,
            }))
          }}
        />
      </FormField>

      <FormField
        label="deny"
        description="插件拒绝列表，优先用于快速屏蔽问题插件。"
        error={findIssueByPath(issues, 'plugins.deny') ?? null}
      >
        <ArrayEditor
          value={plugins.deny}
          itemPlaceholder="输入插件 ID"
          addLabel="新增 deny 项"
          sortable
          onChange={nextValue => {
            updatePlugins(current => ({
              ...current,
              deny: nextValue,
            }))
          }}
        />
      </FormField>

      <FormField
        label="load.paths"
        description="追加插件扫描目录。"
        error={findIssueByPath(issues, 'plugins.load.paths') ?? null}
      >
        <ArrayEditor
          value={plugins.load?.paths}
          itemPlaceholder="输入目录路径"
          addLabel="新增路径"
          sortable
          onChange={nextValue => {
            updatePlugins(current => ({
              ...current,
              load: {
                ...(current.load ?? {}),
                paths: nextValue,
              },
            }))
          }}
        />
      </FormField>

      <div className="rounded-md border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-[11px] leading-5 text-blue-100/90">
        高级插件配置仍建议在 JSON 视图编辑。
        {' '}
        当前已检测到
        {' '}
        {entryCount}
        {' '}
        个 `entries`，{installCount} 个 `installs` 记录。
      </div>
    </div>
  )
}
