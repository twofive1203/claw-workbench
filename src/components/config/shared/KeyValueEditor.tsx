import { Plus, Trash2 } from 'lucide-react'

/**
 * 键值编辑器属性。
 * @param value 当前键值对象。
 * @param keyPlaceholder 键输入占位符。
 * @param valuePlaceholder 值输入占位符。
 * @param addLabel 新增按钮文案。
 * @param onChange 数据变更回调。
 */
interface KeyValueEditorProps {
  value: Record<string, string> | undefined
  keyPlaceholder?: string
  valuePlaceholder?: string
  addLabel?: string
  onChange: (nextValue: Record<string, string>) => void
}

/**
 * 生成不重复键名。
 * @param source 当前键值对象。
 * @param base 基础键名前缀。
 */
function createUniqueKey(source: Record<string, string>, base: string): string {
  if (!source[base]) return base

  let index = 1
  while (source[`${base}${index}`]) {
    index += 1
  }
  return `${base}${index}`
}

/**
 * 键值编辑器组件。
 * @param props 组件属性。
 */
export function KeyValueEditor(props: KeyValueEditorProps) {
  const {
    value,
    keyPlaceholder = 'key',
    valuePlaceholder = 'value',
    addLabel = '新增',
    onChange,
  } = props

  const currentValue = value ?? {}
  const rows = Object.entries(currentValue)

  /**
   * 更新某一行的 value。
   * @param currentKey 当前键名。
   * @param nextRowValue 新值。
   */
  const updateRowValue = (currentKey: string, nextRowValue: string) => {
    onChange({
      ...currentValue,
      [currentKey]: nextRowValue,
    })
  }

  /**
   * 重命名某一行的 key。
   * @param currentKey 当前键名。
   * @param nextKey 新键名。
   */
  const renameRowKey = (currentKey: string, nextKey: string) => {
    const trimmedKey = nextKey.trim()
    const nextObject = { ...currentValue }
    const rowValue = nextObject[currentKey] ?? ''
    delete nextObject[currentKey]

    if (trimmedKey) {
      nextObject[trimmedKey] = rowValue
    }
    onChange(nextObject)
  }

  /**
   * 删除某一行。
   * @param key 要删除的键名。
   */
  const removeRow = (key: string) => {
    const nextObject = { ...currentValue }
    delete nextObject[key]
    onChange(nextObject)
  }

  /**
   * 新增一行。
   */
  const addRow = () => {
    const nextKey = createUniqueKey(currentValue, 'key')
    onChange({
      ...currentValue,
      [nextKey]: '',
    })
  }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-700 px-2 py-2 text-[11px] text-gray-500">
          暂无键值项
        </div>
      )}

      {rows.map(([rowKey, rowValue]) => (
        <div key={rowKey} className="flex items-center gap-2">
          <input
            type="text"
            value={rowKey}
            placeholder={keyPlaceholder}
            className="w-[40%] rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
            onChange={event => renameRowKey(rowKey, event.target.value)}
          />
          <input
            type="text"
            value={rowValue}
            placeholder={valuePlaceholder}
            className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
            onChange={event => updateRowValue(rowKey, event.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-300"
            onClick={() => removeRow(rowKey)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-500 hover:text-gray-100"
        onClick={addRow}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  )
}

