import type { ReactNode } from 'react'
import { cn } from '../../../lib/utils'

/**
 * 表单字段容器属性。
 * @param label 字段标签。
 * @param required 是否必填。
 * @param description 字段说明文本。
 * @param error 字段错误文本。
 * @param className 容器附加样式。
 * @param children 字段内容。
 */
interface FormFieldProps {
  label: string
  required?: boolean
  description?: string
  error?: string | null
  className?: string
  children: ReactNode
}

/**
 * 通用表单字段容器（标签 + 内容 + 错误提示）。
 * @param props 组件属性。
 */
export function FormField(props: FormFieldProps) {
  const { label, required, description, error, className, children } = props

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center gap-1">
        <label className="text-xs font-medium text-gray-300">{label}</label>
        {required && <span className="text-xs text-red-300">*</span>}
      </div>

      {children}

      {description && (
        <div className="text-[11px] leading-5 text-gray-500">{description}</div>
      )}
      {error && (
        <div className="rounded-md border border-red-900/60 bg-red-950/40 px-2 py-1 text-[11px] text-red-200">
          {error}
        </div>
      )}
    </div>
  )
}

