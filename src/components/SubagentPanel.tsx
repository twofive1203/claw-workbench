import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, GitBranch, Loader2, StopCircle, X, XCircle } from 'lucide-react'
import type { SubagentTask } from '../types'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * 子代理面板属性。
 * @param subagentTasks 子代理任务列表。
 * @param abortSubagent 终止任务方法。
 * @param clearCompletedSubagents 清理已完成任务方法。
 * @param onClose 关闭面板回调。
 * @author towfive
 */
interface SubagentPanelProps {
  subagentTasks: SubagentTask[]
  abortSubagent: (sessionKey: string) => Promise<void>
  clearCompletedSubagents: () => void
  onClose: () => void
}

/**
 * 格式化持续时长。
 * @param startedAt 开始时间。
 * @param endedAt 结束时间。
 * @param nowMs 当前时间。
 */
function formatDuration(startedAt: number, endedAt: number | undefined, nowMs: number): string {
  const end = endedAt ?? nowMs
  const duration = Math.max(0, end - startedAt)
  const totalSeconds = Math.floor(duration / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

/**
 * 子代理管理面板。
 * @param props 组件属性。
 */
export function SubagentPanel(props: SubagentPanelProps) {
  const {
    subagentTasks,
    abortSubagent,
    clearCompletedSubagents,
    onClose,
  } = props
  const [nowMs, setNowMs] = useState(0)
  const panelRef = useRef<HTMLDivElement | null>(null)

  useLocalizedSubtree(panelRef)

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now())
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [])

  const runningTasks = useMemo(
    () => subagentTasks.filter(item => item.status === 'running').sort((a, b) => b.startedAt - a.startedAt),
    [subagentTasks],
  )
  const completedTasks = useMemo(
    () => subagentTasks.filter(item => item.status !== 'running').sort((a, b) => b.startedAt - a.startedAt),
    [subagentTasks],
  )
  const activeNow = nowMs > 0 ? nowMs : (runningTasks[0]?.startedAt ?? 0)

  return (
    <div ref={panelRef} className="flex h-full flex-col rounded-xl border border-[var(--color-gray-800)] bg-[var(--color-gray-950)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--color-gray-800)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-4 w-4 text-[var(--color-blue-300)]" />
          <span className="text-sm font-medium text-[var(--color-gray-100)]">子代理任务</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className="rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2 py-1 text-xs text-[var(--color-gray-200)] hover:border-[var(--color-gray-600)]"
            onClick={clearCompletedSubagents}
          >
            清理已完成
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-[var(--color-gray-100)]"
            onClick={onClose}
            title="关闭"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="border-b border-[var(--color-gray-800)] px-4 py-2 text-xs text-[var(--color-gray-400)]">
        运行中:
        {' '}
        {runningTasks.length}
        {' '}
        / 已完成:
        {' '}
        {completedTasks.length}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-xs">
        <div className="space-y-2">
          <div className="text-[var(--color-gray-400)]">运行中</div>
          {runningTasks.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-gray-700)] bg-[color-mix(in_srgb,var(--color-gray-900)_30%,transparent)] px-3 py-4 text-center text-[var(--color-gray-500)]">
              当前无运行中的子代理
            </div>
          ) : (
            runningTasks.map(task => (
              <div key={task.runId} className="rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <div className="min-w-0">
                    <div data-no-i18n className="truncate text-[var(--color-gray-200)]">{task.label ?? task.runId}</div>
                    <div data-no-i18n className="truncate text-[11px] text-[var(--color-gray-500)]">{task.agentId ?? 'unknown-agent'}</div>
                  </div>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-blue-300)]" />
                </div>
                <div className="mb-2 text-[11px] text-[var(--color-gray-500)]">
                  会话:
                  {' '}
                  <span data-no-i18n>{task.sessionKey}</span>
                  {' '}
                  | 运行:
                  {' '}
                  {formatDuration(task.startedAt, undefined, activeNow)}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--color-amber-700)_80%,transparent)] bg-[color-mix(in_srgb,var(--color-amber-950)_30%,transparent)] px-2 py-1 text-[11px] text-[var(--color-amber-200)] hover:bg-[color-mix(in_srgb,var(--color-amber-900)_30%,transparent)]"
                    onClick={() => void abortSubagent(task.sessionKey)}
                  >
                    <StopCircle className="h-3 w-3" />
                    终止
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-2">
          <div className="text-[var(--color-gray-400)]">已完成</div>
          {completedTasks.length === 0 ? (
            <div className="text-[var(--color-gray-500)]">暂无已完成任务</div>
          ) : (
            completedTasks.map(task => (
              <div key={task.runId} className="rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <div data-no-i18n className="truncate text-[var(--color-gray-200)]">{task.label ?? task.runId}</div>
                  {task.status === 'completed' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[var(--color-green-300)]" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-[var(--color-red-300)]" />
                  )}
                </div>
                <div className="text-[11px] text-[var(--color-gray-500)]">
                  耗时:
                  {' '}
                  {formatDuration(task.startedAt, task.endedAt, activeNow)}
                </div>
                {task.error && (
                  <div data-no-i18n className="mt-1 text-[11px] text-[var(--color-red-300)]">{task.error}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
