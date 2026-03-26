import type { ConfigValidationIssue } from '../../../lib/configSchema'
import type { BindingConfig, OpenClawConfig } from '../../../types/config'
import { Plus, Trash2 } from 'lucide-react'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { findIssueByPath } from './utils'

const PEER_KIND_OPTIONS: SelectOption[] = [
  { label: 'direct', value: 'direct' },
  { label: 'group', value: 'group' },
  { label: 'channel', value: 'channel' },
  { label: 'dm', value: 'dm' },
]

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

/**
 * 通道绑定分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface BindingsSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 通道绑定分区组件。
 * @param props 组件属性。
 */
export function BindingsSection(props: BindingsSectionProps) {
  const { config, issues, updateConfig } = props
  const bindings = Array.isArray(config.bindings) ? config.bindings : []

  /**
   * 更新 bindings 列表。
   * @param updater 列表更新函数。
   */
  const updateBindings = (updater: (current: BindingConfig[]) => BindingConfig[]) => {
    updateConfig(prev => ({
      ...prev,
      bindings: updater(Array.isArray(prev.bindings) ? prev.bindings : []),
    }))
  }

  /**
   * 更新指定行。
   * @param index 行索引。
   * @param updater 行更新函数。
   */
  const updateBindingAt = (index: number, updater: (row: BindingConfig) => BindingConfig) => {
    updateBindings(current =>
      current.map((row, currentIndex) => {
        if (currentIndex !== index) return row
        return updater(row)
      }),
    )
  }

  /**
   * 新增绑定行。
   */
  const handleAddBinding = () => {
    updateBindings(current => [
      ...current,
      {
        agentId: '',
        match: {
          channel: '',
          peer: {
            kind: '',
            id: '',
          },
          accountId: '',
        },
      },
    ])
  }

  /**
   * 删除绑定行。
   * @param index 行索引。
   */
  const handleRemoveBinding = (index: number) => {
    updateBindings(current => current.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-300">通道绑定规则</div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:border-gray-600"
          onClick={handleAddBinding}
        >
          <Plus className="h-3.5 w-3.5" />
          新增规则
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-700">
        <table className="min-w-[980px] table-fixed border-collapse text-xs text-gray-200">
          <thead className="bg-gray-900/90 text-[11px] text-gray-400">
            <tr>
              <th className="w-44 border-b border-gray-700 px-2 py-1.5 text-left">agentId</th>
              <th className="w-36 border-b border-gray-700 px-2 py-1.5 text-left">match.channel</th>
              <th className="w-32 border-b border-gray-700 px-2 py-1.5 text-left">match.peer.kind</th>
              <th className="w-36 border-b border-gray-700 px-2 py-1.5 text-left">match.peer.id</th>
              <th className="w-36 border-b border-gray-700 px-2 py-1.5 text-left">match.accountId</th>
              <th className="w-12 border-b border-gray-700 px-2 py-1.5 text-left">操作</th>
            </tr>
          </thead>
          <tbody>
            {bindings.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="border-b border-gray-800 px-2 py-4 text-center text-[11px] text-gray-500"
                >
                  暂无绑定规则
                </td>
              </tr>
            )}

            {bindings.map((binding, index) => {
              const pathPrefix = `bindings.${index}`
              const match = binding.match ?? {}
              const peer = match.peer ?? {}

              return (
                <tr key={`${binding.agentId ?? 'binding'}-${index}`}>
                  <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={binding.agentId ?? ''}
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateBindingAt(index, row => ({
                          ...row,
                          agentId: nextValue,
                        }))
                      }}
                    />
                    {findIssueByPath(issues, `${pathPrefix}.agentId`) && (
                      <div className="mt-1 text-[10px] text-red-300">
                        {findIssueByPath(issues, `${pathPrefix}.agentId`)}
                      </div>
                    )}
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={match.channel ?? ''}
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateBindingAt(index, row => ({
                          ...row,
                          match: {
                            ...(row.match ?? {}),
                            channel: nextValue,
                          },
                        }))
                      }}
                    />
                    {findIssueByPath(issues, `${pathPrefix}.match.channel`) && (
                      <div className="mt-1 text-[10px] text-red-300">
                        {findIssueByPath(issues, `${pathPrefix}.match.channel`)}
                      </div>
                    )}
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                    <SelectField
                      value={peer.kind ?? ''}
                      options={PEER_KIND_OPTIONS}
                      placeholder="请选择 kind"
                      onChange={nextValue => {
                        updateBindingAt(index, row => ({
                          ...row,
                          match: {
                            ...(row.match ?? {}),
                            peer: {
                              ...(row.match?.peer ?? {}),
                              kind: nextValue,
                            },
                          },
                        }))
                      }}
                    />
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={peer.id ?? ''}
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateBindingAt(index, row => ({
                          ...row,
                          match: {
                            ...(row.match ?? {}),
                            peer: {
                              ...(row.match?.peer ?? {}),
                              id: nextValue,
                            },
                          },
                        }))
                      }}
                    />
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                    <input
                      type="text"
                      value={match.accountId ?? ''}
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateBindingAt(index, row => ({
                          ...row,
                          match: {
                            ...(row.match ?? {}),
                            accountId: nextValue,
                          },
                        }))
                      }}
                    />
                  </td>
                  <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-300"
                      onClick={() => handleRemoveBinding(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
