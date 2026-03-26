import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '../../../lib/utils'

/**
 * 密码输入框属性。
 * @param value 当前值。
 * @param onChange 变更回调。
 * @param placeholder 占位符。
 * @param className 容器附加样式。
 * @param disabled 是否禁用。
 */
interface SecretInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * 密码输入框（支持明文切换）。
 * @param props 组件属性。
 */
export function SecretInput(props: SecretInputProps) {
  const { value, onChange, placeholder, className, disabled } = props
  const [visible, setVisible] = useState(false)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        className={cn(
          'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none',
          'focus:border-gray-500 disabled:cursor-not-allowed disabled:text-gray-500',
        )}
      />
      <button
        type="button"
        disabled={disabled}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 bg-gray-900 text-gray-400',
          'hover:border-gray-600 hover:text-gray-200 disabled:cursor-not-allowed disabled:text-gray-600',
        )}
        onClick={() => setVisible(prev => !prev)}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  )
}

