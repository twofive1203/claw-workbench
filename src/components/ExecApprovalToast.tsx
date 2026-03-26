import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ShieldAlert, X } from 'lucide-react'
import type { ExecApprovalRequest, ExecRiskLevel } from '../types'
import { cn } from '../lib/utils'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * 审批通知组件属性。
 * @param request 审批请求。
 * @param onApprove 批准回调。
 * @param onReject 拒绝回调。
 * @author towfive
 */
interface ExecApprovalToastProps {
  request: ExecApprovalRequest
  onApprove: () => void
  onReject: () => void
}

/**
 * 风险等级视觉配置。
 * @param level 风险等级。
 */
function getRiskStyle(level?: ExecRiskLevel): { label: string, borderClass: string, textClass: string } {
  if (level === 'high') {
    return {
      label: '高风险',
      borderClass: 'border-[color-mix(in_srgb,var(--color-red-700)_80%,transparent)]',
      textClass: 'text-[var(--color-red-300)]',
    }
  }
  if (level === 'medium') {
    return {
      label: '中风险',
      borderClass: 'border-[color-mix(in_srgb,var(--color-yellow-700)_80%,transparent)]',
      textClass: 'text-[var(--color-yellow-300)]',
    }
  }
  if (level === 'low') {
    return {
      label: '低风险',
      borderClass: 'border-[color-mix(in_srgb,var(--color-green-700)_80%,transparent)]',
      textClass: 'text-[var(--color-green-300)]',
    }
  }
  return {
    label: '未评级',
    borderClass: 'border-[var(--color-gray-700)]',
    textClass: 'text-[var(--color-gray-300)]',
  }
}

/**
 * 格式化审批参数预览文本。
 * @param args 参数对象。
 */
function formatApprovalArgs(args: Record<string, unknown>): string {
  const command = typeof args.command === 'string' ? args.command : ''
  const path = typeof args.path === 'string' ? args.path : ''
  const content = typeof args.content === 'string' ? args.content : ''

  if (command) return command
  if (path && content) return `${path}\n${content}`
  if (path) return path
  if (content) return content

  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

/**
 * 将毫秒转换为秒文本。
 * @param ms 剩余毫秒。
 */
function toRemainSeconds(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  return `${seconds}s`
}

/**
 * 审批通知浮层卡片。
 * @param props 组件属性。
 */
export function ExecApprovalToast(props: ExecApprovalToastProps) {
  const { request, onApprove, onReject } = props
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [remainingMs, setRemainingMs] = useState<number | null>(request.timeout ?? null)
  const autoRejectedRef = useRef(false)

  useLocalizedSubtree(containerRef)

  const riskStyle = getRiskStyle(request.riskLevel)
  const previewText = useMemo(() => formatApprovalArgs(request.args), [request.args])

  useEffect(() => {
    autoRejectedRef.current = false
  }, [request.requestId])

  useEffect(() => {
    if (!request.timeout) return

    /**
     * 计算当前剩余毫秒。
     */
    const getRemaining = () => {
      const elapsed = Date.now() - request.receivedAt
      return Math.max(0, request.timeout! - elapsed)
    }

    const initialRemaining = getRemaining()
    if (initialRemaining <= 0) {
      if (!autoRejectedRef.current) {
        autoRejectedRef.current = true
        onReject()
      }
      return
    }

    const ticker = setInterval(() => {
      setRemainingMs(getRemaining())
    }, 200)

    const timer = setTimeout(() => {
      if (!autoRejectedRef.current) {
        autoRejectedRef.current = true
        onReject()
      }
    }, initialRemaining)

    return () => {
      clearInterval(ticker)
      clearTimeout(timer)
    }
  }, [onReject, request.receivedAt, request.timeout])

  const timeoutRatio = request.timeout && remainingMs !== null
    ? Math.max(0, Math.min(1, remainingMs / request.timeout))
    : null

  return (
    <div ref={containerRef} className={cn('w-full max-w-[380px] rounded-xl border bg-[color-mix(in_srgb,var(--color-gray-950)_95%,transparent)] p-3 shadow-2xl backdrop-blur', riskStyle.borderClass)}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ShieldAlert className="h-4 w-4 text-[var(--color-amber-300)]" />
          <span className="text-sm font-medium text-[var(--color-gray-100)]">执行审批请求</span>
        </div>
        {remainingMs !== null && (
          <span className="text-[11px] text-[var(--color-gray-400)]">{toRemainSeconds(remainingMs)}</span>
        )}
      </div>

      <div className="space-y-2">
        <div className="rounded-lg border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_70%,transparent)] px-2.5 py-2 text-xs">
          <div className="mb-1 text-[var(--color-gray-200)]">
            <span className="text-[var(--color-gray-400)]">工具:</span>
            {' '}
            {request.toolName}
          </div>
          <div data-no-i18n className="mb-1 whitespace-pre-wrap break-all rounded border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-950)_70%,transparent)] p-2 font-mono text-[11px] text-[var(--color-gray-300)]">
            {previewText || '(无参数)'}
          </div>
          {request.description && (
            <div data-no-i18n className="text-[11px] text-[var(--color-gray-400)]">{request.description}</div>
          )}
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span className="truncate text-[var(--color-gray-400)]">
            会话:
            {' '}
            <span data-no-i18n>{request.sessionKey || '-'}</span>
          </span>
          <span className={cn('font-medium', riskStyle.textClass)}>
            风险等级:
            {' '}
            {riskStyle.label}
          </span>
        </div>

        {timeoutRatio !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-gray-800)]">
            <div
              className={cn('h-full transition-[width]', request.riskLevel === 'high' ? 'bg-[var(--color-red-500)]' : 'bg-[var(--color-blue-500)]')}
              style={{ width: `${timeoutRatio * 100}%` }}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2.5 py-1.5 text-xs text-[var(--color-gray-200)] hover:border-[var(--color-gray-600)] hover:bg-[var(--color-gray-800)]"
            onClick={onReject}
          >
            <X className="h-3.5 w-3.5" />
            拒绝
          </button>
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-[var(--color-white)]',
              request.riskLevel === 'high'
                ? 'bg-[var(--color-red-700)] hover:bg-[var(--color-red-600)]'
                : 'bg-[var(--color-blue-600)] hover:bg-[var(--color-blue-500)]',
            )}
            onClick={onApprove}
          >
            <Check className="h-3.5 w-3.5" />
            批准执行
          </button>
        </div>
      </div>
    </div>
  )
}
