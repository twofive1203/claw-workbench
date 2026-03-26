/**
 * 通道配置分区。
 * 说明：优先覆盖 defaults 与 modelByChannel，具体通道账号细节保留到 JSON 视图编辑。
 * @author lichong
 */

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ConfigValidationIssue } from '../../../lib/configSchema'
import type { ChannelModelByChannelConfig, ChannelsConfig, OpenClawConfig } from '../../../types/config'
import { FormField } from '../shared/FormField'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { findIssueByPath } from './utils'

const GROUP_POLICY_OPTIONS: SelectOption[] = [
  { label: 'open', value: 'open' },
  { label: 'disabled', value: 'disabled' },
  { label: 'allowlist', value: 'allowlist' },
]

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

/**
 * 模型按通道覆盖行结构。
 * @param providerId provider ID。
 * @param channelId channel ID。
 * @param modelId 覆盖后的模型 ID。
 */
interface ChannelModelOverrideRow {
  providerId: string
  channelId: string
  modelId: string
}

/**
 * 通道分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface ChannelsSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 将 modelByChannel 映射展开为表格行。
 * @param value 当前 modelByChannel 配置。
 */
function flattenModelByChannel(value: ChannelModelByChannelConfig | undefined): ChannelModelOverrideRow[] {
  if (!value) return []

  return Object.entries(value).flatMap(([providerId, channelMap]) =>
    Object.entries(channelMap ?? {}).map(([channelId, modelId]) => ({
      providerId,
      channelId,
      modelId,
    })),
  )
}

/**
 * 将表格行重新收敛为 modelByChannel 映射。
 * @param rows 当前表格行。
 */
function buildModelByChannel(rows: ChannelModelOverrideRow[]): ChannelModelByChannelConfig | undefined {
  const nextValue: ChannelModelByChannelConfig = {}

  rows.forEach(row => {
    const providerId = row.providerId.trim()
    const channelId = row.channelId.trim()
    const modelId = row.modelId.trim()
    if (!providerId || !channelId || !modelId) return

    nextValue[providerId] ??= {}
    nextValue[providerId][channelId] = modelId
  })

  return Object.keys(nextValue).length > 0 ? nextValue : undefined
}

/**
 * 通道分区组件。
 * @param props 组件属性。
 */
export function ChannelsSection(props: ChannelsSectionProps) {
  const { config, issues, updateConfig } = props
  const channels = config.channels ?? {}
  const [overrideRows, setOverrideRows] = useState<ChannelModelOverrideRow[]>(
    () => flattenModelByChannel(channels.modelByChannel),
  )
  const providerSectionKeys = Object.keys(channels).filter(key => key !== 'defaults' && key !== 'modelByChannel')

  /**
   * 更新 channels 对象。
   * @param updater channels 更新函数。
   */
  const updateChannels = (updater: (value: ChannelsConfig) => ChannelsConfig) => {
    updateConfig(prev => ({
      ...prev,
      channels: updater(prev.channels ?? {}),
    }))
  }

  /**
   * 更新覆盖行并同步写回 modelByChannel。
   * @param nextRows 目标覆盖行列表。
   */
  const commitOverrideRows = (nextRows: ChannelModelOverrideRow[]) => {
    setOverrideRows(nextRows)
    updateChannels(current => ({
      ...current,
      modelByChannel: buildModelByChannel(nextRows),
    }))
  }

  /**
   * 更新某条模型覆盖行。
   * @param index 行索引。
   * @param updater 行更新函数。
   */
  const updateOverrideRow = (index: number, updater: (row: ChannelModelOverrideRow) => ChannelModelOverrideRow) => {
    const nextRows = overrideRows.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      return updater(row)
    })
    commitOverrideRows(nextRows)
  }

  /**
   * 新增一条模型覆盖行。
   */
  const handleAddOverride = () => {
    commitOverrideRows([
      ...overrideRows,
      { providerId: '', channelId: '', modelId: '' },
    ])
  }

  /**
   * 删除一条模型覆盖行。
   * @param index 行索引。
   */
  const handleRemoveOverride = (index: number) => {
    commitOverrideRows(overrideRows.filter((_, rowIndex) => rowIndex !== index))
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="text-xs font-medium text-gray-300">通道配置</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField
          label="defaults.groupPolicy"
          description="默认群聊处理策略。"
          error={findIssueByPath(issues, 'channels.defaults.groupPolicy') ?? null}
        >
          <SelectField
            value={channels.defaults?.groupPolicy ?? ''}
            options={GROUP_POLICY_OPTIONS}
            placeholder="请选择 groupPolicy"
            onChange={nextValue => {
              updateChannels(current => ({
                ...current,
                defaults: {
                  ...(current.defaults ?? {}),
                  groupPolicy: nextValue || undefined,
                },
              }))
            }}
          />
        </FormField>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <FormField
          label="defaults.heartbeat.showOk"
          description="是否展示正常心跳确认。"
          error={findIssueByPath(issues, 'channels.defaults.heartbeat.showOk') ?? null}
        >
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-blue-500"
              checked={channels.defaults?.heartbeat?.showOk === true}
              onChange={event => {
                const checked = event.target.checked
                updateChannels(current => ({
                  ...current,
                  defaults: {
                    ...(current.defaults ?? {}),
                    heartbeat: {
                      ...(current.defaults?.heartbeat ?? {}),
                      showOk: checked,
                    },
                  },
                }))
              }}
            />
            显示 HEARTBEAT_OK
          </label>
        </FormField>

        <FormField
          label="defaults.heartbeat.showAlerts"
          description="是否显示心跳告警内容。"
          error={findIssueByPath(issues, 'channels.defaults.heartbeat.showAlerts') ?? null}
        >
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-blue-500"
              checked={channels.defaults?.heartbeat?.showAlerts !== false}
              onChange={event => {
                const checked = event.target.checked
                updateChannels(current => ({
                  ...current,
                  defaults: {
                    ...(current.defaults ?? {}),
                    heartbeat: {
                      ...(current.defaults?.heartbeat ?? {}),
                      showAlerts: checked,
                    },
                  },
                }))
              }}
            />
            显示告警内容
          </label>
        </FormField>

        <FormField
          label="defaults.heartbeat.useIndicator"
          description="是否发出 UI 指示器事件。"
          error={findIssueByPath(issues, 'channels.defaults.heartbeat.useIndicator') ?? null}
        >
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-blue-500"
              checked={channels.defaults?.heartbeat?.useIndicator !== false}
              onChange={event => {
                const checked = event.target.checked
                updateChannels(current => ({
                  ...current,
                  defaults: {
                    ...(current.defaults ?? {}),
                    heartbeat: {
                      ...(current.defaults?.heartbeat ?? {}),
                      useIndicator: checked,
                    },
                  },
                }))
              }}
            />
            使用状态指示器
          </label>
        </FormField>
      </div>

      <div className="space-y-2 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-gray-300">modelByChannel</div>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:border-gray-600"
            onClick={handleAddOverride}
          >
            <Plus className="h-3.5 w-3.5" />
            新增覆盖
          </button>
        </div>

        <div className="text-[11px] text-gray-500">
          用于设置 provider / channel / model 的覆盖映射。
        </div>

        {findIssueByPath(issues, 'channels.modelByChannel') && (
          <div className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
            {findIssueByPath(issues, 'channels.modelByChannel')}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border border-gray-700">
          <table className="min-w-[760px] table-fixed border-collapse text-xs text-gray-200">
            <thead className="bg-gray-900/90 text-[11px] text-gray-400">
              <tr>
                <th className="w-40 border-b border-gray-700 px-2 py-1.5 text-left">provider</th>
                <th className="w-40 border-b border-gray-700 px-2 py-1.5 text-left">channel</th>
                <th className="border-b border-gray-700 px-2 py-1.5 text-left">model</th>
                <th className="w-12 border-b border-gray-700 px-2 py-1.5 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {overrideRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="border-b border-gray-800 px-2 py-4 text-center text-[11px] text-gray-500">
                    暂无模型覆盖规则
                  </td>
                </tr>
              )}

              {overrideRows.map((row, index) => (
                <tr key={`${row.providerId || 'provider'}:${row.channelId || 'channel'}:${index}`}>
                  <td className="border-b border-gray-800 px-2 py-1.5">
                    <input
                      type="text"
                      value={row.providerId}
                      placeholder="例如 openai"
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateOverrideRow(index, current => ({
                          ...current,
                          providerId: nextValue,
                        }))
                      }}
                    />
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5">
                    <input
                      type="text"
                      value={row.channelId}
                      placeholder="例如 slack"
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateOverrideRow(index, current => ({
                          ...current,
                          channelId: nextValue,
                        }))
                      }}
                    />
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5">
                    <input
                      type="text"
                      value={row.modelId}
                      placeholder="例如 gpt-5.1-mini"
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateOverrideRow(index, current => ({
                          ...current,
                          modelId: nextValue,
                        }))
                      }}
                    />
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-300"
                      onClick={() => handleRemoveOverride(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-md border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-[11px] leading-5 text-blue-100/90">
        通道账号与平台特定配置仍建议在 JSON 视图编辑。
        {' '}
        {providerSectionKeys.length > 0
          ? `当前已检测到 ${providerSectionKeys.join('、')} 等通道块。`
          : '当前还没有检测到额外的平台通道块。'}
      </div>
    </div>
  )
}
