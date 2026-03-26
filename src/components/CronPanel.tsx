import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Clock3, Loader2, Pencil, Play, Plus, Trash2, X } from 'lucide-react'
import type { Agent, CronJob, CronJobConfig, CronRunRecord } from '../types'
import { ConfirmModal } from './ConfirmModal'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'
import { useI18n } from '../i18n/useI18n'

/**
 * Cron 面板属性。
 * @param listCronJobs 读取任务列表方法。
 * @param addCronJob 新增任务方法。
 * @param updateCronJob 更新任务方法。
 * @param removeCronJob 删除任务方法。
 * @param runCronJob 手动运行任务方法。
 * @param listCronRuns 读取运行历史方法。
 * @param onCronEvent 监听 cron 事件方法。
 * @param agents 可选 Agent 列表。
 * @param onClose 关闭面板回调。
 * @author towfive
 */
interface CronPanelProps {
  listCronJobs: () => Promise<CronJob[]>
  addCronJob: (config: CronJobConfig) => Promise<string | null>
  updateCronJob: (jobId: string, patch: Partial<CronJobConfig>) => Promise<void>
  removeCronJob: (jobId: string) => Promise<void>
  runCronJob: (jobId: string) => Promise<void>
  listCronRuns: (jobId?: string, limit?: number) => Promise<CronRunRecord[]>
  onCronEvent: (callback: ((event: Record<string, unknown>) => void) | null) => void
  agents: Agent[]
  onClose: () => void
}

/**
 * 格式化时间。
 * @param timestamp 时间戳。
 */
function formatDateTime(timestamp?: number): string {
  if (typeof timestamp !== 'number') return '-'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

/**
 * Cron 管理面板。
 * @param props 组件属性。
 */
export function CronPanel(props: CronPanelProps) {
  const {
    listCronJobs,
    addCronJob,
    updateCronJob,
    removeCronJob,
    runCronJob,
    listCronRuns,
    onCronEvent,
    agents,
    onClose,
  } = props

  const [jobs, setJobs] = useState<CronJob[]>([])
  const [runs, setRuns] = useState<CronRunRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [formJobId, setFormJobId] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [schedule, setSchedule] = useState('*/30 * * * *')
  const [agentId, setAgentId] = useState('')
  const [message, setMessage] = useState('')
  const [enabled, setEnabled] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [pendingDeleteJob, setPendingDeleteJob] = useState<CronJob | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const { tr } = useI18n()

  useLocalizedSubtree(panelRef)

  /**
   * 重置表单状态。
   */
  const resetForm = () => {
    setFormJobId(null)
    setLabel('')
    setSchedule('*/30 * * * *')
    setAgentId('')
    setMessage('')
    setEnabled(true)
    setFormError(null)
  }

  /**
   * 加载任务和运行历史。
   */
  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [nextJobs, nextRuns] = await Promise.all([
        listCronJobs(),
        listCronRuns(undefined, 20),
      ])
      setJobs(nextJobs)
      setRuns(nextRuns)
    } finally {
      setIsLoading(false)
    }
  }, [listCronJobs, listCronRuns])

  useEffect(() => {
    void loadData()
    onCronEvent(() => {
      void loadData()
    })
    return () => {
      onCronEvent(null)
    }
  }, [loadData, onCronEvent])

  /**
   * 应用编辑表单。
   * @param job 当前任务。
   */
  const handleEdit = (job: CronJob) => {
    setFormJobId(job.jobId)
    setLabel(job.label ?? '')
    setSchedule(job.schedule)
    setAgentId(job.agentId ?? '')
    setMessage(job.message)
    setEnabled(job.enabled)
  }

  /**
   * 保存任务（新增或更新）。
   */
  const handleSave = async () => {
    if (!schedule.trim()) {
      setFormError('请填写 cron 表达式')
      return
    }
    if (!message.trim()) {
      setFormError('请填写发送消息')
      return
    }

    setFormError(null)
    const payload: CronJobConfig = {
      label: label.trim() || undefined,
      schedule: schedule.trim(),
      agentId: agentId || undefined,
      message: message.trim(),
      enabled,
    }

    if (formJobId) {
      await updateCronJob(formJobId, payload)
    } else {
      await addCronJob(payload)
    }

    resetForm()
    await loadData()
  }

  /**
   * 删除任务。
   * @param job 要删除的任务。
   */
  const handleRemove = async (job: CronJob) => {
    setPendingDeleteJob(job)
  }

  /**
   * 关闭删除确认弹窗。
   */
  const closeDeleteModal = () => {
    setPendingDeleteJob(null)
  }

  /**
   * 确认删除任务。
   */
  const confirmDeleteJob = async () => {
    if (!pendingDeleteJob) return
    const targetJobId = pendingDeleteJob.jobId
    setPendingDeleteJob(null)
    await removeCronJob(targetJobId)
    await loadData()
  }

  /**
   * 运行任务。
   * @param job 要运行的任务。
   */
  const handleRun = async (job: CronJob) => {
    await runCronJob(job.jobId)
    await loadData()
  }

  const runningCount = useMemo(
    () => runs.filter(item => item.status === 'running').length,
    [runs],
  )

  return (
    <div ref={panelRef} className="flex h-full flex-col bg-[var(--color-gray-950)]">
      <div className="flex items-center justify-between border-b border-[var(--color-gray-800)] px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Clock3 className="h-4 w-4 text-[var(--color-blue-300)]" />
          <span className="text-sm font-medium text-[var(--color-gray-100)]">{tr('定时任务')}</span>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-[var(--color-gray-400)] hover:bg-[var(--color-gray-800)] hover:text-[var(--color-gray-100)]"
          onClick={onClose}
          title={tr('关闭')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 border-b border-[var(--color-gray-800)] px-4 py-3 text-xs">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={label}
            onChange={e => {
              setLabel(e.target.value)
              if (formError) setFormError(null)
            }}
            placeholder={tr('任务名称（可选）')}
            className="rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2.5 py-1.5 text-[var(--color-gray-200)] outline-none focus:border-[var(--color-gray-500)]"
          />
          <input
            type="text"
            value={schedule}
            onChange={e => {
              setSchedule(e.target.value)
              if (formError) setFormError(null)
            }}
            placeholder="*/30 * * * *"
            className="rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2.5 py-1.5 text-[var(--color-gray-200)] outline-none focus:border-[var(--color-gray-500)]"
          />
        </div>

        <select
          value={agentId}
          onChange={e => setAgentId(e.target.value)}
          className="w-full rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2.5 py-1.5 text-[var(--color-gray-200)] outline-none focus:border-[var(--color-gray-500)]"
        >
          <option value="">{tr('默认 Agent')}</option>
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>
              {agent.name ?? agent.id}
            </option>
          ))}
        </select>

        <textarea
          rows={3}
          value={message}
          onChange={e => {
            setMessage(e.target.value)
            if (formError) setFormError(null)
          }}
          placeholder={tr('发送给 Agent 的消息...')}
          className="w-full resize-none rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2.5 py-1.5 text-[var(--color-gray-200)] outline-none focus:border-[var(--color-gray-500)]"
        />

        <div className="flex items-center justify-between">
          <label className="inline-flex items-center gap-1 text-[var(--color-gray-300)]">
            <input
              type="checkbox"
              checked={enabled}
              onChange={e => setEnabled(e.target.checked)}
              className="accent-[var(--color-blue-500)]"
            />
            {tr('启用任务')}
          </label>
          <div className="flex items-center gap-1.5">
            {formJobId && (
              <button
                type="button"
                className="rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2 py-1 text-[var(--color-gray-200)] hover:border-[var(--color-gray-600)]"
                onClick={resetForm}
              >
                {tr('取消编辑')}
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md bg-[var(--color-blue-600)] px-2 py-1 text-[var(--color-white)] hover:bg-[var(--color-blue-500)]"
              onClick={() => void handleSave()}
            >
              {formJobId ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {formJobId ? tr('更新任务') : tr('创建任务')}
            </button>
          </div>
        </div>

        {formError && (
          <div className="rounded-md border border-[color-mix(in_srgb,var(--color-red-900)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_40%,transparent)] px-2.5 py-1.5 text-[11px] text-[var(--color-red-200)]">
            {formError}
          </div>
        )}

        <div className="rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_50%,transparent)] px-2.5 py-1.5 text-[11px] text-[var(--color-gray-500)]">
          {tr('模板: */30 * * * *（每 30 分钟） | 0 * * * *（每小时） | 0 8 * * *（每天 8 点）')}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-xs">
        <div className="rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-2.5">
          <div className="mb-2 flex items-center justify-between text-[var(--color-gray-400)]">
            <span>{tr('任务列表')} ({jobs.length})</span>
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </div>
          {jobs.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-gray-700)] bg-[color-mix(in_srgb,var(--color-gray-950)_60%,transparent)] px-3 py-4 text-center text-[var(--color-gray-500)]">
              {tr('暂无定时任务')}
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map(job => (
                <div key={job.jobId} className="rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-950)_60%,transparent)] p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="truncate text-[var(--color-gray-200)]">{job.label ?? job.jobId}</span>
                    <span className={job.enabled ? 'text-[var(--color-green-300)]' : 'text-[var(--color-red-300)]'}>
                      {job.enabled ? tr('启用') : tr('停用')}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-[11px] text-[var(--color-gray-500)]">
                    <div>
                      cron:
                      {' '}
                      {job.schedule}
                    </div>
                    <div>
                      agent:
                      {' '}
                      {job.agentId ?? tr('默认')}
                    </div>
                    <div>
                      {tr('下次运行')}:
                      {' '}
                      {formatDateTime(job.nextRunAt)}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2 py-1 text-[11px] text-[var(--color-gray-200)] hover:border-[var(--color-gray-600)]"
                      onClick={() => void handleRun(job)}
                    >
                      <Play className="h-3 w-3" />
                      {tr('运行')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--color-gray-700)] bg-[var(--color-gray-900)] px-2 py-1 text-[11px] text-[var(--color-gray-200)] hover:border-[var(--color-gray-600)]"
                      onClick={() => handleEdit(job)}
                    >
                      <Pencil className="h-3 w-3" />
                      {tr('编辑')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--color-red-900)_70%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_40%,transparent)] px-2 py-1 text-[11px] text-[var(--color-red-200)] hover:bg-[color-mix(in_srgb,var(--color-red-900)_30%,transparent)]"
                      onClick={() => void handleRemove(job)}
                    >
                      <Trash2 className="h-3 w-3" />
                      {tr('删除')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-md border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-900)_60%,transparent)] p-2.5">
          <div className="mb-2 text-[var(--color-gray-400)]">
            {tr('运行历史')} (
            {runs.length}
            )
            {' '}
            | {tr('运行中')}:
            {' '}
            {runningCount}
          </div>
          {runs.length === 0 ? (
            <div className="text-[var(--color-gray-500)]">{tr('暂无运行记录')}</div>
          ) : (
            <div className="space-y-1.5">
              {runs.map(run => (
                <div key={run.runId} className="rounded border border-[var(--color-gray-800)] bg-[color-mix(in_srgb,var(--color-gray-950)_60%,transparent)] px-2 py-1.5 text-[11px]">
                  <div className="mb-0.5 flex items-center justify-between">
                    <span className="truncate text-[var(--color-gray-200)]">{run.jobId}</span>
                    <span className={run.status === 'error' ? 'text-[var(--color-red-300)]' : run.status === 'success' ? 'text-[var(--color-green-300)]' : 'text-[var(--color-blue-300)]'}>
                      {run.status}
                    </span>
                  </div>
                  <div className="text-[var(--color-gray-500)]">
                    {formatDateTime(run.startedAt)}
                    {' '}
                    -&gt;
                    {' '}
                    {formatDateTime(run.endedAt)}
                  </div>
                  {run.error && <div className="text-[var(--color-red-300)]">{tr('错误')}: {run.error}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pendingDeleteJob && (
        <ConfirmModal
          title={tr('cron.delete_title')}
          description={tr('cron.delete_description', { name: pendingDeleteJob.label ?? pendingDeleteJob.jobId })}
          confirmText={tr('common.delete')}
          variant="danger"
          onCancel={closeDeleteModal}
          onConfirm={() => void confirmDeleteJob()}
        />
      )}
    </div>
  )
}
