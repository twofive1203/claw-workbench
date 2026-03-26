import type { PointerEvent, ReactNode } from 'react'
import { cn } from '../lib/utils'

/**
 * 二次确认弹窗属性。
 * @param title 标题。
 * @param description 说明文本。
 * @param confirmText 确认按钮文案。
 * @param cancelText 取消按钮文案。
 * @param variant 按钮样式类型。
 * @param onConfirm 确认回调。
 * @param onCancel 取消回调。
 * @author towfive
 */
interface ConfirmModalProps {
  title: string
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

/**
 * 二次确认弹窗。
 * @param props 组件属性。
 */
export function ConfirmModal(props: ConfirmModalProps) {
  const {
    title,
    description,
    confirmText = '确认',
    cancelText = '取消',
    variant = 'default',
    onConfirm,
    onCancel,
  } = props

  /**
   * 点击遮罩层关闭弹窗。
   * 仅当按下发生在遮罩层本身时触发，避免拖拽选择文本时误关闭。
   * @param event 指针事件。
   */
  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    onCancel()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-3 md:p-4"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        className="w-full max-w-sm space-y-3 rounded-lg border border-[var(--color-gray-800)] bg-[var(--color-gray-900)] p-4 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="text-sm font-semibold text-[var(--color-gray-100)]">{title}</div>
        {description && (
          <div className="whitespace-pre-wrap break-words text-xs text-[var(--color-gray-300)]">
            {description}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-[var(--color-gray-400)] hover:text-[var(--color-gray-200)]"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={cn(
              'rounded-md px-3 py-1 text-xs text-[var(--color-white)]',
              variant === 'danger'
                ? 'bg-[var(--color-red-600)] hover:bg-[var(--color-red-500)]'
                : 'bg-[var(--color-blue-600)] hover:bg-[var(--color-blue-500)]',
            )}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
