import { cn } from '../../../lib/utils'

/**
 * 下拉选项结构。
 * @param label 展示文案。
 * @param value 选项值。
 */
export interface SelectOption {
  label: string
  value: string
}

/**
 * 下拉框属性。
 * @param value 当前值。
 * @param options 选项列表。
 * @param placeholder 占位符。
 * @param disabled 是否禁用。
 * @param className 附加样式。
 * @param onChange 值变更回调。
 */
interface SelectFieldProps {
  value: string
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
  onChange: (value: string) => void
}

/**
 * 通用下拉框组件。
 * @param props 组件属性。
 */
export function SelectField(props: SelectFieldProps) {
  const { value, options, placeholder, disabled, className, onChange } = props

  return (
    <select
      value={value}
      disabled={disabled}
      className={cn(
        'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none',
        'focus:border-gray-500 disabled:cursor-not-allowed disabled:text-gray-500',
        className,
      )}
      onChange={event => onChange(event.target.value)}
    >
      <option value="">{placeholder ?? '请选择'}</option>
      {options.map(option => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

