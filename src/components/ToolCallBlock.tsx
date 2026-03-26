import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Loader2, Wrench, X } from 'lucide-react'
import type { ToolCallRecord } from '../types'
import { getToolDisplayName } from '../lib/toolNames'
import { cn } from '../lib/utils'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * 工具调用卡片属性。
 * @param call 工具调用记录。
 * @author towfive
 */
interface ToolCallBlockProps {
  call: ToolCallRecord
}

const PREVIEW_MAX_LINES = 3

/**
 * 将任意数据格式化为可读文本。
 * @param value 原始值。
 */
function formatToolData(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * 截断多行文本用于预览。
 * @param content 原始文本。
 * @param expanded 是否展开。
 */
function getPreviewText(content: string, expanded: boolean): string {
  if (expanded) return content
  const lines = content.split('\n')
  if (lines.length <= PREVIEW_MAX_LINES) return content
  return lines.slice(0, PREVIEW_MAX_LINES).join('\n')
}

/**
 * 计算工具执行耗时文本。
 * @param call 工具调用记录。
 */
function getDurationText(call: ToolCallRecord): string | null {
  const end = call.endedAt ?? Date.now()
  const durationMs = end - call.startedAt
  if (!Number.isFinite(durationMs) || durationMs < 0) return null
  if (durationMs < 1000) return `${durationMs}ms`
  return `${(durationMs / 1000).toFixed(1)}s`
}

/**
 * 工具调用可视化卡片。
 * @param props 组件属性。
 */
export function ToolCallBlock(props: ToolCallBlockProps) {
  const { call } = props
  const blockRef = useRef<HTMLDivElement | null>(null)
  const [expandedArgs, setExpandedArgs] = useState(false)
  const [expandedResult, setExpandedResult] = useState(false)

  useLocalizedSubtree(blockRef)

  const argsText = useMemo(() => formatToolData(call.args), [call.args])
  const resultText = useMemo(() => {
    if (call.phase === 'update') {
      return formatToolData(call.partialResult)
    }
    if (call.phase === 'result') {
      return formatToolData(call.result ?? call.error)
    }
    return ''
  }, [call.error, call.partialResult, call.phase, call.result])

  const argsLines = argsText ? argsText.split('\n').length : 0
  const resultLines = resultText ? resultText.split('\n').length : 0
  const durationText = getDurationText(call)
  const hasError = call.phase === 'result' && Boolean(call.error)
  const title = getToolDisplayName(call.name)

  return (
    <div ref={blockRef} className="rounded-lg border border-[color-mix(in_srgb,var(--color-gray-700)_80%,transparent)] bg-[color-mix(in_srgb,var(--color-gray-900)_70%,transparent)] p-2.5 text-xs text-[var(--color-gray-200)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Wrench className="h-3.5 w-3.5 shrink-0 text-[var(--color-gray-400)]" />
          <span className="truncate font-medium text-[var(--color-gray-100)]">{title}</span>
        </div>
        <div className="inline-flex items-center gap-1 text-[11px] text-[var(--color-gray-400)]">
          {call.phase === 'result' ? (
            hasError ? <X className="h-3.5 w-3.5 text-[var(--color-red-400)]" /> : <Check className="h-3.5 w-3.5 text-[var(--color-green-400)]" />
          ) : (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-blue-300)]" />
          )}
          <span>{durationText ?? '执行中'}</span>
        </div>
      </div>

      {argsText && (
        <div className="mb-1.5 rounded-md border border-[color-mix(in_srgb,var(--color-gray-700)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-gray-950)_80%,transparent)] p-2">
          <button
            type="button"
            className={cn(
              'mb-1 inline-flex items-center gap-1 text-[11px] text-[var(--color-gray-400)]',
              argsLines > PREVIEW_MAX_LINES ? 'cursor-pointer hover:text-[var(--color-gray-200)]' : 'cursor-default',
            )}
            onClick={() => argsLines > PREVIEW_MAX_LINES && setExpandedArgs(prev => !prev)}
          >
            {argsLines > PREVIEW_MAX_LINES && (
              <ChevronDown className={cn('h-3 w-3 transition-transform', expandedArgs ? 'rotate-180' : 'rotate-0')} />
            )}
            <span>参数</span>
          </button>
          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-[var(--color-gray-300)]">
            {getPreviewText(argsText, expandedArgs)}
          </pre>
        </div>
      )}

      {resultText && (
        <div className={cn('rounded-md border p-2', hasError ? 'border-[color-mix(in_srgb,var(--color-red-900)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_40%,transparent)]' : 'border-[color-mix(in_srgb,var(--color-gray-700)_60%,transparent)] bg-[color-mix(in_srgb,var(--color-gray-950)_80%,transparent)]')}>
          <button
            type="button"
            className={cn(
              'mb-1 inline-flex items-center gap-1 text-[11px]',
              hasError ? 'text-[var(--color-red-300)]' : 'text-[var(--color-gray-400)]',
              resultLines > PREVIEW_MAX_LINES ? 'cursor-pointer hover:text-[var(--color-gray-100)]' : 'cursor-default',
            )}
            onClick={() => resultLines > PREVIEW_MAX_LINES && setExpandedResult(prev => !prev)}
          >
            {resultLines > PREVIEW_MAX_LINES && (
              <ChevronDown className={cn('h-3 w-3 transition-transform', expandedResult ? 'rotate-180' : 'rotate-0')} />
            )}
            <span>{call.phase === 'update' ? '中间结果' : hasError ? '错误信息' : '执行结果'}</span>
          </button>
          <pre className={cn('whitespace-pre-wrap break-all font-mono text-[11px]', hasError ? 'text-[var(--color-red-200)]' : 'text-[var(--color-gray-300)]')}>
            {getPreviewText(resultText, expandedResult)}
          </pre>
        </div>
      )}
    </div>
  )
}
