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
      className="wb-modal-backdrop"
      onPointerDown={handleBackdropPointerDown}
    >
      <div
        className="wb-modal-card w-full max-w-sm space-y-4"
        onClick={event => event.stopPropagation()}
      >
        <div className="text-sm font-semibold text-[var(--text-strong)]">{title}</div>
        {description && (
          <div className="whitespace-pre-wrap break-words text-xs leading-6 text-[var(--text-subtle)]">
            {description}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className="wb-ghost-button"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={cn(
              variant === 'danger' ? 'wb-danger-button' : 'wb-primary-button',
              variant === 'danger'
                ? ''
                : '',
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
