import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Brain, Loader2, Search, Trash2, X } from 'lucide-react'
import type { MemoryEntry } from '../types'
import { ConfirmModal } from './ConfirmModal'
import { useI18n } from '../i18n/useI18n'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

const PAGE_SIZE = 50
const SEARCH_DEBOUNCE_MS = 300

/**
 * 记忆面板属性。
 * @param focusedAgentId 当前聚焦 agent。
 * @param searchMemory 搜索记忆方法。
 * @param listMemory 分页列表方法。
 * @param deleteMemory 删除记忆方法。
 * @param onClose 关闭回调。
 * @author towfive
 */
interface MemoryPanelProps {
  focusedAgentId: string | null
  searchMemory: (query: string, agentId?: string, limit?: number) => Promise<MemoryEntry[]>
  listMemory: (agentId?: string, limit?: number, offset?: number) => Promise<{ entries: MemoryEntry[], total: number }>
  deleteMemory: (id: string) => Promise<void>
  onClose: () => void
}

/**
 * 格式化时间文本。
 * @param timestamp 时间戳。
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return '-'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

/**
 * 格式化相关度百分比。
 * @param score 原始评分。
 */
function formatScore(score?: number): string | null {
  if (typeof score !== 'number') return null
  const normalized = score <= 1 ? score * 100 : score
  return `${Math.max(0, Math.min(100, Math.round(normalized)))}%`
}

/**
 * 记忆管理面板。
 * @param props 组件属性。
 */
export function MemoryPanel(props: MemoryPanelProps) {
  const {
    focusedAgentId,
    searchMemory,
    listMemory,
    deleteMemory,
    onClose,
  } = props

  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [pendingDeleteEntry, setPendingDeleteEntry] = useState<MemoryEntry | null>(null)
  const requestIdRef = useRef(0)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const { tr } = useI18n()

  useLocalizedSubtree(panelRef)

  const isSearchMode = query.trim().length > 0
  const hasMore = !isSearchMode && entries.length < total

  /**
   * 加载列表模式数据。
   * @param nextOffset 读取偏移量。
   * @param append 是否追加。
   */
  const loadList = useCallback(async (nextOffset: number, append: boolean) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setIsLoading(true)
    setErrorText(null)
    try {
      const result = await listMemory(focusedAgentId ?? undefined, PAGE_SIZE, nextOffset)
      if (requestIdRef.current !== requestId) return
      setEntries(prev => (append ? [...prev, ...result.entries] : result.entries))
      setTotal(result.total)
      setOffset(nextOffset + result.entries.length)
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setErrorText(message || tr('memory.read_failed'))
      setEntries([])
      setTotal(0)
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [focusedAgentId, listMemory, tr])

  /**
   * 加载搜索模式数据。
   * @param keyword 搜索关键词。
   */
  const loadSearch = useCallback(async (keyword: string) => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    setIsLoading(true)
    setErrorText(null)
    try {
      const result = await searchMemory(keyword, focusedAgentId ?? undefined, PAGE_SIZE)
      if (requestIdRef.current !== requestId) return
      setEntries(result)
      setTotal(result.length)
      setOffset(0)
    } catch (error) {
      if (requestIdRef.current !== requestId) return
      const message = error instanceof Error ? error.message : String(error)
      setErrorText(message || tr('memory.search_failed'))
      setEntries([])
      setTotal(0)
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false)
      }
    }
  }, [focusedAgentId, searchMemory, tr])

  useEffect(() => {
    const keyword = query.trim()
    if (!keyword) {
      void loadList(0, false)
      return
    }

    const timer = setTimeout(() => {
      void loadSearch(keyword)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [loadList, loadSearch, query])

  /**
   * 清空单个记忆文件内容。
   * @param entry 要删除的条目。
   */
  const handleDelete = async (entry: MemoryEntry) => {
    setPendingDeleteEntry(entry)
  }

  /**
   * 关闭删除确认弹窗。
   */
  const closeDeleteModal = () => {
    setPendingDeleteEntry(null)
  }

  /**
   * 确认清空记忆。
   */
  const confirmDeleteEntry = async () => {
    if (!pendingDeleteEntry) return
    const targetEntry = pendingDeleteEntry
    setPendingDeleteEntry(null)

    try {
      await deleteMemory(targetEntry.id)
      setEntries(prev => prev.filter(item => item.id !== targetEntry.id))
      setTotal(prev => Math.max(0, prev - 1))
      setErrorText(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setErrorText(message || tr('memory.clear_failed'))
    }
  }

  const titleText = useMemo(
    () => (focusedAgentId ? `${tr('memory.title')} (${focusedAgentId})` : tr('memory.title')),
    [focusedAgentId, tr],
  )

  return (
    <div ref={panelRef} className="flex h-full flex-col bg-[var(--surface-right-panel)]">
      <div className="wb-panel-header">
        <div className="flex items-center gap-1.5">
          <Brain className="h-4 w-4 text-[var(--color-purple-300)]" />
          <span className="text-sm font-medium text-[var(--text-strong)]">{titleText}</span>
        </div>
        <button
          type="button"
          className="wb-icon-button h-8 w-8"
          onClick={onClose}
          title={tr('common.close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-[var(--border-default)] px-4 py-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-[var(--text-faint)]" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={tr('memory.search_placeholder')}
            className="wb-input pl-9"
          />
        </div>
        <div className="mt-2 text-[11px] text-[var(--text-faint)]">
          {tr('memory.total_files', { count: total })}
        </div>
        <div className="mt-1 text-[11px] text-[var(--text-faint)]">
          {tr('memory.gateway_note')}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {errorText && (
          <div className="wb-card rounded-[16px] border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_42%,transparent)] px-3 py-2 text-xs text-[var(--color-red-200)]">
            {errorText}
          </div>
        )}

        {entries.length === 0 && !isLoading && (
          <div className="wb-empty-state px-3 py-6 text-center text-xs">
            {tr('memory.empty')}
          </div>
        )}

        {entries.map(entry => (
          <div key={entry.id} className="wb-card rounded-[18px] p-3 text-xs">
            <div data-no-i18n className="mb-1 whitespace-pre-wrap break-words text-[var(--text-loud)]">{entry.content}</div>
            <div className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-faint)]">
              {entry.tags?.map(tag => (
                <span key={tag} className="wb-chip-muted px-2 py-1 text-[10px]">
                  {tag}
                </span>
              ))}
              <span>{formatTime(entry.createdAt)}</span>
              {entry.source && (
                <span>
                  {tr('memory.source')}
                  {' '}
                  {entry.source}
                </span>
              )}
              {isSearchMode && (
                <span>
                  {tr('memory.relevance')}
                  {' '}
                  {formatScore(entry.relevanceScore) ?? '-'}
                </span>
              )}
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="wb-mini-button border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_42%,transparent)] text-[var(--color-red-200)]"
                onClick={() => void handleDelete(entry)}
              >
                <Trash2 className="h-3 w-3" />
                {tr('common.clear')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border-default)] px-4 py-4">
        <button
          type="button"
          disabled={!hasMore || isLoading}
          className="wb-pill-button w-full"
          onClick={() => void loadList(offset, true)}
        >
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {hasMore ? tr('common.load_more') : tr('common.no_more')}
        </button>
      </div>

      {pendingDeleteEntry && (
        <ConfirmModal
          title={tr('memory.delete_title')}
          description={tr('memory.delete_description', { preview: pendingDeleteEntry.content.slice(0, 120) })}
          confirmText={tr('common.clear')}
          variant="danger"
          onCancel={closeDeleteModal}
          onConfirm={() => void confirmDeleteEntry()}
        />
      )}
    </div>
  )
}
