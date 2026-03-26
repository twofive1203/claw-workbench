import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { ConfigValidationIssue } from '../../../lib/configSchema'
import { type AgentListItem, type OpenClawConfig } from '../../../types/config'
import type { RpcCaller } from '../../../hooks/useConfigRpc'
import { ArrayEditor } from '../shared/ArrayEditor'
import { FormField } from '../shared/FormField'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { AgentRuntimeSection } from './AgentRuntimeSection'
import { filterSectionIssues, findIssueByPath } from './utils'

const TOOL_PROFILE_OPTIONS: SelectOption[] = [
  { label: 'inherit（跟随默认）', value: '' },
  { label: 'minimal', value: 'minimal' },
  { label: 'coding', value: 'coding' },
  { label: 'messaging', value: 'messaging' },
  { label: 'full', value: 'full' },
]

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'
const EMPTY_AGENT_LIST: AgentListItem[] = []

/**
 * Agent 列表分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 * @param callRpc 通用 RPC 调用器。
 * @param isConnected 是否已连接 Gateway。
 */
interface AgentListSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
  callRpc: RpcCaller
  isConnected: boolean
}

/**
 * 运行时解析出的 identity 提示信息。
 * @param name 运行时名称。
 * @param emoji 运行时 emoji。
 * @param theme 运行时主题。
 * @param avatar 运行时头像。
 */
interface ResolvedIdentityHint {
  name?: string
  emoji?: string
  theme?: string
  avatar?: string
}

/**
 * 生成默认 Agent ID。
 * @param existingIds 已存在 Agent ID 列表。
 */
function createAgentId(existingIds: string[]): string {
  let index = 1
  while (existingIds.includes(`agent-${index}`)) {
    index += 1
  }
  return `agent-${index}`
}

/**
 * 将输入框文本转换为可选整数。
 * @param value 原始文本值。
 */
function toOptionalInteger(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed)) return undefined
  return parsed
}

/**
 * 从文件内容中解析 identity 信息。
 * @param content IDENTITY.md 文本内容。
 */
function parseIdentityFromMarkdown(content: string): ResolvedIdentityHint {
  const pick = (pattern: RegExp): string | undefined => {
    const matched = content.match(pattern)
    const value = matched?.[1]?.trim()
    return value ? value : undefined
  }

  return {
    name: pick(/^\s*-\s*\*\*Name\s*[:：]\*\*\s*(.+)$/im),
    emoji: pick(/^\s*-\s*\*\*Emoji\s*[:：]\*\*\s*(.+)$/im),
    theme: pick(/^\s*-\s*\*\*(?:Theme|Vibe)\s*[:：]\*\*\s*(.+)$/im),
    avatar: pick(/^\s*-\s*\*\*Avatar\s*[:：]\*\*\s*(.+)$/im),
  }
}

/**
 * 交换数组项位置。
 * @param source 原始数组。
 * @param fromIndex 拖拽起始索引。
 * @param toIndex 拖拽目标索引。
 */
function moveArrayItem<T>(source: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return source
  if (fromIndex < 0 || fromIndex >= source.length) return source
  if (toIndex < 0 || toIndex >= source.length) return source

  const next = [...source]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * 计算排序后需要聚焦的 Agent 索引。
 * @param selectedIndex 当前选中的索引。
 * @param fromIndex 移动起点索引。
 * @param toIndex 移动目标索引。
 */
function resolveSelectedIndexAfterMove(selectedIndex: number, fromIndex: number, toIndex: number): number {
  if (selectedIndex === fromIndex) return toIndex
  if (fromIndex < selectedIndex && toIndex >= selectedIndex) return selectedIndex - 1
  if (fromIndex > selectedIndex && toIndex <= selectedIndex) return selectedIndex + 1
  return selectedIndex
}

/**
 * 拖拽自动滚动容器类型。
 */
type DragScrollContainer = HTMLElement | Window

/**
 * 判断容器是否为 Window。
 * @param container 滚动容器。
 */
function isWindowContainer(container: DragScrollContainer): container is Window {
  return container instanceof Window
}

/**
 * 判断元素是否可纵向滚动。
 * @param element 目标元素。
 */
function isElementScrollable(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  const overflowY = style.overflowY
  if (overflowY !== 'auto' && overflowY !== 'scroll') return false
  return element.scrollHeight > element.clientHeight + 1
}

/**
 * 从起始元素向上查找最近的可滚动容器。
 * @param startElement 起始元素。
 */
function findScrollContainer(startElement: HTMLElement | null): DragScrollContainer {
  let current: HTMLElement | null = startElement
  while (current) {
    if (isElementScrollable(current)) return current
    current = current.parentElement
  }
  return window
}

/**
 * 获取滚动容器在视口中的上下边界。
 * @param container 滚动容器。
 */
function getContainerBounds(container: DragScrollContainer): { top: number; bottom: number; height: number } {
  if (isWindowContainer(container)) {
    return {
      top: 0,
      bottom: window.innerHeight,
      height: window.innerHeight,
    }
  }

  const rect = container.getBoundingClientRect()
  return {
    top: rect.top,
    bottom: rect.bottom,
    height: rect.height,
  }
}

/**
 * 解析自动滚动步进值。
 * @param pointerY 指针在视口中的 y 坐标。
 * @param container 滚动容器。
 */
function resolveAutoScrollDelta(pointerY: number, container: DragScrollContainer): number {
  const bounds = getContainerBounds(container)
  const edgeSize = Math.max(56, Math.min(96, Math.round(bounds.height * 0.2)))
  const maxStep = 18
  const upperEdge = bounds.top + edgeSize
  const lowerEdge = bounds.bottom - edgeSize

  if (pointerY < upperEdge) {
    const ratio = Math.min((upperEdge - pointerY) / edgeSize, 1)
    return -Math.max(1, Math.round(maxStep * ratio * ratio))
  }

  if (pointerY > lowerEdge) {
    const ratio = Math.min((pointerY - lowerEdge) / edgeSize, 1)
    return Math.max(1, Math.round(maxStep * ratio * ratio))
  }

  return 0
}

/**
 * 判断容器是否还能继续滚动。
 * @param container 滚动容器。
 * @param delta 计划滚动位移。
 */
function canContainerScrollBy(container: DragScrollContainer, delta: number): boolean {
  if (isWindowContainer(container)) {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    if (delta < 0) return scrollingElement.scrollTop > 0

    const maxScrollTop = scrollingElement.scrollHeight - scrollingElement.clientHeight
    return scrollingElement.scrollTop < maxScrollTop
  }

  if (delta < 0) return container.scrollTop > 0
  const maxScrollTop = container.scrollHeight - container.clientHeight
  return container.scrollTop < maxScrollTop
}

/**
 * 按位移滚动容器。
 * @param container 滚动容器。
 * @param delta 计划滚动位移。
 */
function scrollContainerBy(container: DragScrollContainer, delta: number) {
  if (isWindowContainer(container)) {
    window.scrollBy({ top: delta, left: 0, behavior: 'auto' })
    return
  }
  container.scrollTop += delta
}

/**
 * Agent 列表分区组件。
 * @param props 组件属性。
 */
export function AgentListSection(props: AgentListSectionProps) {
  const { config, issues, updateConfig, callRpc, isConnected } = props
  const agentList = Array.isArray(config.agents?.list) ? config.agents.list : EMPTY_AGENT_LIST
  const [selectedAgentIndex, setSelectedAgentIndex] = useState(0)
  const [draggingAgentIndex, setDraggingAgentIndex] = useState<number | null>(null)
  const [resolvedIdentityHint, setResolvedIdentityHint] = useState<ResolvedIdentityHint | null>(null)
  const [loadingIdentityHint, setLoadingIdentityHint] = useState(false)
  const agentListRef = useRef(agentList)
  const dragPointerYRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const dragScrollContainerRef = useRef<DragScrollContainer>(window)
  const sectionIssues = useMemo(() => filterSectionIssues(issues, 'agents.list'), [issues])
  const resolvedAgentIndex = useMemo(() => {
    if (agentList.length === 0) return 0
    return Math.min(selectedAgentIndex, agentList.length - 1)
  }, [agentList, selectedAgentIndex])
  const selectedAgent = agentList[resolvedAgentIndex] ?? null
  const selectedAgentPathPrefix = `agents.list.${resolvedAgentIndex}`

  /**
   * 读取当前 Agent 的运行时 identity 提示（来自 IDENTITY.md）。
   */
  useEffect(() => {
    const agentId = selectedAgent?.id?.trim() ?? ''
    if (!isConnected || !agentId) {
      setResolvedIdentityHint(null)
      setLoadingIdentityHint(false)
      return
    }

    let disposed = false
    const loadIdentityHint = async () => {
      setLoadingIdentityHint(true)
      try {
        const payload = await callRpc<{ file?: { content?: unknown } }>('agents.files.get', {
          agentId,
          name: 'IDENTITY.md',
        })
        if (disposed) return

        const content = typeof payload.file?.content === 'string' ? payload.file.content : ''
        if (!content.trim()) {
          setResolvedIdentityHint(null)
          return
        }
        setResolvedIdentityHint(parseIdentityFromMarkdown(content))
      } catch {
        if (disposed) return
        setResolvedIdentityHint(null)
      } finally {
        if (!disposed) {
          setLoadingIdentityHint(false)
        }
      }
    }

    void loadIdentityHint()
    return () => {
      disposed = true
    }
  }, [callRpc, isConnected, selectedAgent?.id])

  /**
   * 同步 Agent 列表引用，避免拖拽时读取旧值。
   */
  useEffect(() => {
    agentListRef.current = agentList
  }, [agentList])

  /**
   * 结束自动滚动循环并清理缓存。
   */
  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
    dragPointerYRef.current = null
    dragScrollContainerRef.current = window
  }, [])

  /**
   * 清理拖拽状态。
   */
  const clearAgentDragging = useCallback(() => {
    stopAutoScroll()
    setDraggingAgentIndex(null)
  }, [stopAutoScroll])

  /**
   * 拖拽过程中，指针抬起后结束排序模式。
   */
  useEffect(() => {
    if (draggingAgentIndex === null) return

    const handlePointerUp = () => {
      clearAgentDragging()
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      dragPointerYRef.current = event.clientY
    }

    const runAutoScroll = () => {
      const pointerY = dragPointerYRef.current
      if (pointerY !== null) {
        const container = dragScrollContainerRef.current
        const delta = resolveAutoScrollDelta(pointerY, container)
        if (delta !== 0 && canContainerScrollBy(container, delta)) {
          scrollContainerBy(container, delta)
        }
      }
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('blur', handlePointerUp)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)

    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('blur', handlePointerUp)
      window.removeEventListener('pointermove', handlePointerMove)
      stopAutoScroll()
    }
  }, [clearAgentDragging, draggingAgentIndex, stopAutoScroll])

  /**
   * 更新 Agent 列表。
   * @param updater 列表更新函数。
   */
  const updateAgentList = (updater: (list: AgentListItem[]) => AgentListItem[]) => {
    updateConfig(prev => {
      const previousAgents = prev.agents ?? {}
      const currentList = Array.isArray(previousAgents.list) ? previousAgents.list : []
      return {
        ...prev,
        agents: {
          ...previousAgents,
          list: updater(currentList),
        },
      }
    })
  }

  /**
   * 更新指定 Agent。
   * @param index Agent 索引。
   * @param updater Agent 更新函数。
   */
  const updateAgentAt = (index: number, updater: (agent: AgentListItem) => AgentListItem) => {
    updateAgentList(current =>
      current.map((agent, currentIndex) => {
        if (currentIndex !== index) return agent
        return updater(agent)
      }),
    )
  }

  /**
   * 新增 Agent。
   */
  const handleAddAgent = () => {
    const nextId = createAgentId(agentList.map(item => item.id ?? ''))
    const nextAgent: AgentListItem = {
      id: nextId,
      name: '',
      default: agentList.length === 0,
      workspace: '',
      model: '',
      tools: { profile: 'minimal' },
      skills: [],
    }

    updateAgentList(current => [...current, nextAgent])
    setSelectedAgentIndex(agentList.length)
  }

  /**
   * 删除 Agent。
   * @param index 目标索引。
   */
  const handleRemoveAgent = (index: number) => {
    updateAgentList(current => current.filter((_, currentIndex) => currentIndex !== index))
    if (resolvedAgentIndex >= index && resolvedAgentIndex > 0) {
      setSelectedAgentIndex(resolvedAgentIndex - 1)
    }
    if (draggingAgentIndex === index) {
      clearAgentDragging()
    }
  }

  /**
   * 调整 Agent 在列表中的顺序。
   * @param fromIndex 当前索引。
   * @param toIndex 目标索引。
   */
  const moveAgent = (fromIndex: number, toIndex: number) => {
    const nextList = moveArrayItem(agentListRef.current, fromIndex, toIndex)
    if (nextList === agentListRef.current) return

    agentListRef.current = nextList
    updateAgentList(() => nextList)
    setSelectedAgentIndex(currentIndex => resolveSelectedIndexAfterMove(currentIndex, fromIndex, toIndex))
  }

  /**
   * 将 Agent 上移一位。
   * @param index Agent 索引。
   */
  const moveAgentUp = (index: number) => {
    moveAgent(index, index - 1)
  }

  /**
   * 将 Agent 下移一位。
   * @param index Agent 索引。
   */
  const moveAgentDown = (index: number) => {
    moveAgent(index, index + 1)
  }

  /**
   * 开始拖拽排序（按住图标）。
   * @param index Agent 索引。
   * @param event 指针事件。
   */
  const handleSortPointerDown = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    dragPointerYRef.current = event.clientY
    dragScrollContainerRef.current = findScrollContainer(event.currentTarget)
    setDraggingAgentIndex(index)
  }

  /**
   * 图标上抬起指针时结束排序。
   * @param event 指针事件。
   */
  const handleSortPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    clearAgentDragging()
  }

  /**
   * 指针进入卡片时执行重排。
   * @param index Agent 索引。
   */
  const handleCardPointerEnter = (index: number) => {
    if (draggingAgentIndex === null) return
    if (draggingAgentIndex === index) return

    moveAgent(draggingAgentIndex, index)
    setDraggingAgentIndex(index)
  }

  /**
   * 切换当前 Agent 的默认开关。
   * @param index Agent 索引。
   * @param nextDefault 默认值。
   */
  const handleUpdateDefault = (index: number, nextDefault: boolean) => {
    updateAgentList(current =>
      current.map((agent, currentIndex) => {
        if (currentIndex === index) {
          return { ...agent, default: nextDefault }
        }
        if (nextDefault) {
          return { ...agent, default: false }
        }
        return agent
      }),
    )
  }

  /**
   * 切换模型字段结构。
   * @param nextType 目标结构类型。
   */
  const handleSwitchModelType = (nextType: 'string' | 'object') => {
    if (!selectedAgent) return

    if (nextType === 'string') {
      updateAgentAt(resolvedAgentIndex, agent => ({ ...agent, model: '' }))
      return
    }

    const primary = typeof selectedAgent.model === 'string' ? selectedAgent.model : ''
    updateAgentAt(resolvedAgentIndex, agent => ({
      ...agent,
      model: {
        primary,
        fallbacks: [],
      },
    }))
  }

  /**
   * 切换 subagents.model 字段结构。
   * @param nextType 目标结构类型。
   */
  const handleSwitchSubagentsModelType = (nextType: 'string' | 'object') => {
    if (!selectedAgent) return

    if (nextType === 'string') {
      updateAgentAt(resolvedAgentIndex, agent => ({
        ...agent,
        subagents: {
          ...(agent.subagents ?? {}),
          model: '',
        },
      }))
      return
    }

    const primary = typeof selectedAgent.subagents?.model === 'string' ? selectedAgent.subagents.model : ''
    updateAgentAt(resolvedAgentIndex, agent => ({
      ...agent,
      subagents: {
        ...(agent.subagents ?? {}),
        model: {
          primary,
          fallbacks: [],
        },
      },
    }))
  }

  const isModelObject = selectedAgent
    ? typeof selectedAgent.model === 'object' && selectedAgent.model !== null
    : false
  const selectedModelObject =
    selectedAgent && typeof selectedAgent.model === 'object' && selectedAgent.model !== null
      ? selectedAgent.model
      : null
  const isSubagentsModelObject = selectedAgent
    ? typeof selectedAgent.subagents?.model === 'object' && selectedAgent.subagents?.model !== null
    : false
  const selectedSubagentsModelObject =
    selectedAgent && typeof selectedAgent.subagents?.model === 'object' && selectedAgent.subagents?.model !== null
      ? selectedAgent.subagents.model
      : null

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <section className="rounded-lg border border-gray-700 bg-gray-900/60 p-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-medium text-gray-300">Agent 卡片</div>
          <div className="text-[11px] text-gray-500">{agentList.length} 个</div>
        </div>

        <div className="space-y-2">
          {agentList.length === 0 && (
            <div className="rounded-md border border-dashed border-gray-700 px-2 py-3 text-center text-xs text-gray-500">
              暂无 Agent
            </div>
          )}

          {agentList.map((agent, index) => (
            <div
              key={`${agent.id ?? 'agent'}-${index}`}
              className={`rounded-md border p-2 transition-all duration-150 ${
                draggingAgentIndex === index
                  ? 'z-10 scale-[1.01] border-blue-400/70 bg-blue-500/15 shadow-[0_10px_30px_rgba(59,130,246,0.25)] ring-1 ring-blue-400/40'
                  : resolvedAgentIndex === index
                  ? 'border-blue-500/60 bg-blue-500/10'
                  : 'border-gray-700 bg-gray-950/40'
              }`}
              onPointerEnter={() => handleCardPointerEnter(index)}
            >
              <div className="flex items-start gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    title="按住并拖动排序"
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-700 text-gray-400 ${
                      draggingAgentIndex === index
                        ? 'cursor-grabbing border-blue-400/70 bg-blue-500/15 text-blue-200'
                        : draggingAgentIndex === null
                        ? 'cursor-grab'
                        : 'cursor-grabbing'
                    }`}
                    onPointerDown={event => handleSortPointerDown(index, event)}
                    onPointerUp={handleSortPointerUp}
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </button>
                  <div className="inline-flex flex-col overflow-hidden rounded-md border border-gray-700">
                    <button
                      type="button"
                      title="上移"
                      disabled={index === 0}
                      className={`inline-flex h-3.5 w-4 items-center justify-center text-gray-400 ${
                        index === 0
                          ? 'cursor-not-allowed bg-gray-900 text-gray-600'
                          : 'bg-gray-900 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                      onClick={() => moveAgentUp(index)}
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      title="下移"
                      disabled={index === agentList.length - 1}
                      className={`inline-flex h-3.5 w-4 items-center justify-center border-t border-gray-700 text-gray-400 ${
                        index === agentList.length - 1
                          ? 'cursor-not-allowed bg-gray-900 text-gray-600'
                          : 'bg-gray-900 hover:bg-gray-800 hover:text-gray-200'
                      }`}
                      onClick={() => moveAgentDown(index)}
                    >
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelectedAgentIndex(index)}
                >
                  <div className="truncate text-xs font-medium text-gray-200">
                    {agent.name || agent.id || `agent-${index + 1}`}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-gray-500">{agent.id || '未设置 id'}</div>
                </button>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:bg-red-950/40 hover:text-red-300"
                  title="删除 Agent"
                  onClick={() => handleRemoveAgent(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {draggingAgentIndex !== null && (
          <div className="mt-2 text-[11px] text-blue-200/90">
            拖拽中：靠近窗口上下边缘会自动滚动
          </div>
        )}

        <button
          type="button"
          className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-600 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-gray-100"
          onClick={handleAddAgent}
        >
          <Plus className="h-3.5 w-3.5" />
          新增 Agent
        </button>

        {sectionIssues.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-200">
            agents.list 分区存在 {sectionIssues.length} 条校验问题
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
        {!selectedAgent ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-gray-700 text-sm text-gray-500">
            请选择或新增 Agent
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField
                label="id"
                required
                error={findIssueByPath(issues, `${selectedAgentPathPrefix}.id`) ?? null}
              >
                <input
                  type="text"
                  value={selectedAgent.id ?? ''}
                  className={INPUT_CLASS_NAME}
                  onChange={event => {
                    const nextValue = event.target.value
                    updateAgentAt(resolvedAgentIndex, agent => ({
                      ...agent,
                      id: nextValue,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="name"
                error={findIssueByPath(issues, `${selectedAgentPathPrefix}.name`) ?? null}
              >
                <input
                  type="text"
                  value={selectedAgent.name ?? ''}
                  className={INPUT_CLASS_NAME}
                  onChange={event => {
                    const nextValue = event.target.value
                    updateAgentAt(resolvedAgentIndex, agent => ({
                      ...agent,
                      name: nextValue,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="workspace"
                error={findIssueByPath(issues, `${selectedAgentPathPrefix}.workspace`) ?? null}
              >
                <input
                  type="text"
                  value={selectedAgent.workspace ?? ''}
                  className={INPUT_CLASS_NAME}
                  onChange={event => {
                    const nextValue = event.target.value
                    updateAgentAt(resolvedAgentIndex, agent => ({
                      ...agent,
                      workspace: nextValue,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="agentDir"
                description="Agent 核心文件目录（可选）"
                error={findIssueByPath(issues, `${selectedAgentPathPrefix}.agentDir`) ?? null}
              >
                <input
                  type="text"
                  value={selectedAgent.agentDir ?? ''}
                  className={INPUT_CLASS_NAME}
                  onChange={event => {
                    const nextValue = event.target.value
                    updateAgentAt(resolvedAgentIndex, agent => ({
                      ...agent,
                      agentDir: nextValue || undefined,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="default"
                description="勾选后会自动取消其他 Agent 的 default"
                error={findIssueByPath(issues, `${selectedAgentPathPrefix}.default`) ?? null}
              >
                <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedAgent.default)}
                    className="h-3.5 w-3.5 rounded border-gray-600 bg-gray-800 text-blue-500"
                    onChange={event => handleUpdateDefault(resolvedAgentIndex, event.target.checked)}
                  />
                  设为默认 Agent
                </label>
              </FormField>
            </div>

            <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-300">
                <span>identity</span>
                {loadingIdentityHint && <span className="text-[11px] text-gray-500">读取运行时 identity...</span>}
              </div>
              {resolvedIdentityHint && (
                <div className="mb-2 rounded-md border border-blue-900/60 bg-blue-950/30 px-2 py-1.5 text-[11px] text-blue-200">
                  运行时解析：
                  {' '}
                  {resolvedIdentityHint.name ?? '-'}
                  {' / '}
                  {resolvedIdentityHint.emoji ?? '-'}
                  {' / '}
                  {resolvedIdentityHint.theme ?? '-'}
                  （来源: IDENTITY.md）
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  label="identity.name"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.identity.name`) ?? null}
                >
                  <input
                    type="text"
                    value={selectedAgent.identity?.name ?? ''}
                    placeholder={resolvedIdentityHint?.name ?? ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = event.target.value
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        identity: {
                          ...(agent.identity ?? {}),
                          name: nextValue || undefined,
                        },
                      }))
                    }}
                  />
                </FormField>

                <FormField
                  label="identity.theme"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.identity.theme`) ?? null}
                >
                  <input
                    type="text"
                    value={selectedAgent.identity?.theme ?? ''}
                    placeholder={resolvedIdentityHint?.theme ?? ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = event.target.value
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        identity: {
                          ...(agent.identity ?? {}),
                          theme: nextValue || undefined,
                        },
                      }))
                    }}
                  />
                </FormField>

                <FormField
                  label="identity.emoji"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.identity.emoji`) ?? null}
                >
                  <input
                    type="text"
                    value={selectedAgent.identity?.emoji ?? ''}
                    placeholder={resolvedIdentityHint?.emoji ?? ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = event.target.value
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        identity: {
                          ...(agent.identity ?? {}),
                          emoji: nextValue || undefined,
                        },
                      }))
                    }}
                  />
                </FormField>

                <FormField
                  label="identity.avatar"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.identity.avatar`) ?? null}
                >
                  <input
                    type="text"
                    value={selectedAgent.identity?.avatar ?? ''}
                    placeholder={resolvedIdentityHint?.avatar ?? ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = event.target.value
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        identity: {
                          ...(agent.identity ?? {}),
                          avatar: nextValue || undefined,
                        },
                      }))
                    }}
                  />
                </FormField>
              </div>
            </div>

            <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-medium text-gray-300">model</div>
                <div className="flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 p-1 text-[11px] text-gray-300">
                  <button
                    type="button"
                    className={`rounded px-2 py-0.5 ${
                      !isModelObject ? 'bg-blue-500/20 text-blue-200' : 'text-gray-400 hover:text-gray-200'
                    }`}
                    onClick={() => handleSwitchModelType('string')}
                  >
                    string
                  </button>
                  <button
                    type="button"
                    className={`rounded px-2 py-0.5 ${
                      isModelObject ? 'bg-blue-500/20 text-blue-200' : 'text-gray-400 hover:text-gray-200'
                    }`}
                    onClick={() => handleSwitchModelType('object')}
                  >
                    object
                  </button>
                </div>
              </div>

              {!isModelObject ? (
                <FormField
                  label="model"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.model`) ?? null}
                >
                  <input
                    type="text"
                    value={typeof selectedAgent.model === 'string' ? selectedAgent.model : ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = event.target.value
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        model: nextValue,
                      }))
                    }}
                  />
                </FormField>
              ) : (
                <div className="space-y-3">
                  <FormField
                    label="model.primary"
                    error={findIssueByPath(issues, `${selectedAgentPathPrefix}.model.primary`) ?? null}
                  >
                    <input
                      type="text"
                      value={selectedModelObject?.primary ?? ''}
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateAgentAt(resolvedAgentIndex, agent => ({
                          ...agent,
                          model: {
                            ...(typeof agent.model === 'object' && agent.model ? agent.model : {}),
                            primary: nextValue,
                          },
                        }))
                      }}
                    />
                  </FormField>

                  <FormField
                    label="model.fallbacks"
                    error={findIssueByPath(issues, `${selectedAgentPathPrefix}.model.fallbacks`) ?? null}
                  >
                    <ArrayEditor
                      value={selectedModelObject?.fallbacks}
                      itemPlaceholder="例如 gpt-4o-mini"
                      addLabel="新增回退模型"
                      sortable
                      onChange={nextValue => {
                        updateAgentAt(resolvedAgentIndex, agent => ({
                          ...agent,
                          model: {
                            ...(typeof agent.model === 'object' && agent.model ? agent.model : {}),
                            fallbacks: nextValue,
                          },
                        }))
                      }}
                    />
                  </FormField>
                </div>
              )}
            </div>

            <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
              <div className="mb-2 text-xs font-medium text-gray-300">tools</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  label="tools.profile"
                  description="inherit 表示跟随默认配置"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.tools.profile`) ?? null}
                >
                  <SelectField
                    value={selectedAgent.tools?.profile ?? ''}
                    options={TOOL_PROFILE_OPTIONS}
                    placeholder="请选择 profile"
                    onChange={nextValue => {
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        tools: {
                          ...(agent.tools ?? {}),
                          profile: nextValue || undefined,
                        },
                      }))
                    }}
                  />
                </FormField>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <FormField
                  label="tools.allow"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.tools.allow`) ?? null}
                >
                  <ArrayEditor
                    value={selectedAgent.tools?.allow}
                    itemPlaceholder="例如 web_search"
                    addLabel="新增允许工具"
                    onChange={nextValue => {
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        tools: {
                          ...(agent.tools ?? {}),
                          allow: nextValue,
                        },
                      }))
                    }}
                  />
                </FormField>

                <FormField
                  label="tools.alsoAllow"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.tools.alsoAllow`) ?? null}
                >
                  <ArrayEditor
                    value={selectedAgent.tools?.alsoAllow}
                    itemPlaceholder="例如 web_fetch"
                    addLabel="新增追加允许"
                    onChange={nextValue => {
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        tools: {
                          ...(agent.tools ?? {}),
                          alsoAllow: nextValue,
                        },
                      }))
                    }}
                  />
                </FormField>

                <FormField
                  label="tools.deny"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.tools.deny`) ?? null}
                >
                  <ArrayEditor
                    value={selectedAgent.tools?.deny}
                    itemPlaceholder="例如 exec"
                    addLabel="新增拒绝工具"
                    onChange={nextValue => {
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        tools: {
                          ...(agent.tools ?? {}),
                          deny: nextValue,
                        },
                      }))
                    }}
                  />
                </FormField>
              </div>
            </div>

            <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
              <div className="mb-2 text-xs font-medium text-gray-300">groupChat</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  label="groupChat.mentionPatterns"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.groupChat.mentionPatterns`) ?? null}
                >
                  <ArrayEditor
                    value={selectedAgent.groupChat?.mentionPatterns}
                    itemPlaceholder="例如 @openclaw"
                    addLabel="新增提及模式"
                    onChange={nextValue => {
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        groupChat: {
                          ...(agent.groupChat ?? {}),
                          mentionPatterns: nextValue,
                        },
                      }))
                    }}
                  />
                </FormField>

                <FormField
                  label="groupChat.historyLimit"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.groupChat.historyLimit`) ?? null}
                >
                  <input
                    type="number"
                    min={1}
                    value={selectedAgent.groupChat?.historyLimit?.toString() ?? ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = toOptionalInteger(event.target.value)
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        groupChat: {
                          ...(agent.groupChat ?? {}),
                          historyLimit: nextValue,
                        },
                      }))
                    }}
                  />
                </FormField>
              </div>
            </div>

            <div className="rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
              <div className="mb-2 text-xs font-medium text-gray-300">runtime</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <FormField
                  label="heartbeat.every"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.heartbeat.every`) ?? null}
                >
                  <input
                    type="text"
                    value={selectedAgent.heartbeat?.every ?? ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = event.target.value
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        heartbeat: {
                          ...(agent.heartbeat ?? {}),
                          every: nextValue || undefined,
                        },
                      }))
                    }}
                  />
                </FormField>

                <FormField
                  label="subagents.thinking"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.subagents.thinking`) ?? null}
                >
                  <input
                    type="text"
                    value={selectedAgent.subagents?.thinking ?? ''}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      const nextValue = event.target.value
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        subagents: {
                          ...(agent.subagents ?? {}),
                          thinking: nextValue || undefined,
                        },
                      }))
                    }}
                  />
                </FormField>
              </div>

              <div className="mt-3">
                <FormField
                  label="subagents.allowAgents"
                  error={findIssueByPath(issues, `${selectedAgentPathPrefix}.subagents.allowAgents`) ?? null}
                >
                  <ArrayEditor
                    value={selectedAgent.subagents?.allowAgents}
                    itemPlaceholder="例如 reviewer"
                    addLabel="新增允许子代理"
                    onChange={nextValue => {
                      updateAgentAt(resolvedAgentIndex, agent => ({
                        ...agent,
                        subagents: {
                          ...(agent.subagents ?? {}),
                          allowAgents: nextValue,
                        },
                      }))
                    }}
                  />
                </FormField>
              </div>

              <div className="mt-3 rounded-md border border-gray-700 bg-gray-900/40 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-medium text-gray-300">subagents.model</div>
                  <div className="flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 p-1 text-[11px] text-gray-300">
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 ${
                        !isSubagentsModelObject ? 'bg-blue-500/20 text-blue-200' : 'text-gray-400 hover:text-gray-200'
                      }`}
                      onClick={() => handleSwitchSubagentsModelType('string')}
                    >
                      string
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-0.5 ${
                        isSubagentsModelObject ? 'bg-blue-500/20 text-blue-200' : 'text-gray-400 hover:text-gray-200'
                      }`}
                      onClick={() => handleSwitchSubagentsModelType('object')}
                    >
                      object
                    </button>
                  </div>
                </div>

                {!isSubagentsModelObject ? (
                  <FormField
                    label="subagents.model"
                    error={findIssueByPath(issues, `${selectedAgentPathPrefix}.subagents.model`) ?? null}
                  >
                    <input
                      type="text"
                      value={typeof selectedAgent.subagents?.model === 'string' ? selectedAgent.subagents.model : ''}
                      className={INPUT_CLASS_NAME}
                      onChange={event => {
                        const nextValue = event.target.value
                        updateAgentAt(resolvedAgentIndex, agent => ({
                          ...agent,
                          subagents: {
                            ...(agent.subagents ?? {}),
                            model: nextValue,
                          },
                        }))
                      }}
                    />
                  </FormField>
                ) : (
                  <div className="space-y-3">
                    <FormField
                      label="subagents.model.primary"
                      error={findIssueByPath(issues, `${selectedAgentPathPrefix}.subagents.model.primary`) ?? null}
                    >
                      <input
                        type="text"
                        value={selectedSubagentsModelObject?.primary ?? ''}
                        className={INPUT_CLASS_NAME}
                        onChange={event => {
                          const nextValue = event.target.value
                          updateAgentAt(resolvedAgentIndex, agent => ({
                            ...agent,
                            subagents: {
                              ...(agent.subagents ?? {}),
                              model: {
                                ...(typeof agent.subagents?.model === 'object' && agent.subagents.model
                                  ? agent.subagents.model
                                  : {}),
                                primary: nextValue,
                              },
                            },
                          }))
                        }}
                      />
                    </FormField>

                    <FormField
                      label="subagents.model.fallbacks"
                      error={findIssueByPath(issues, `${selectedAgentPathPrefix}.subagents.model.fallbacks`) ?? null}
                    >
                      <ArrayEditor
                        value={selectedSubagentsModelObject?.fallbacks}
                        itemPlaceholder="例如 openai/gpt-5.2"
                        addLabel="新增子代理回退模型"
                        sortable
                        onChange={nextValue => {
                          updateAgentAt(resolvedAgentIndex, agent => ({
                            ...agent,
                            subagents: {
                              ...(agent.subagents ?? {}),
                              model: {
                                ...(typeof agent.subagents?.model === 'object' && agent.subagents.model
                                  ? agent.subagents.model
                                  : {}),
                                fallbacks: nextValue,
                              },
                            },
                          }))
                        }}
                      />
                    </FormField>
                  </div>
                )}
              </div>
            </div>

            <FormField
              label="skills"
              error={findIssueByPath(issues, `${selectedAgentPathPrefix}.skills`) ?? null}
            >
              <ArrayEditor
                value={selectedAgent.skills}
                itemPlaceholder="例如 algorithmic-art"
                addLabel="新增技能"
                onChange={nextValue => {
                  updateAgentAt(resolvedAgentIndex, agent => ({
                    ...agent,
                    skills: nextValue,
                  }))
                }}
              />
            </FormField>

            {selectedAgent.id && (
              <AgentRuntimeSection
                agentId={selectedAgent.id}
                callRpc={callRpc}
                isConnected={isConnected}
              />
            )}
          </>
        )}
      </section>
    </div>
  )
}
