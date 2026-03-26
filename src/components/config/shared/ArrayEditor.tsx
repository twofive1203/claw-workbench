import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'

/**
 * 数组编辑器属性。
 * @param value 当前字符串数组。
 * @param itemPlaceholder 输入占位符。
 * @param addLabel 新增按钮文案。
 * @param sortable 是否启用拖拽排序。
 * @param onChange 数组变更回调。
 */
interface ArrayEditorProps {
  value: string[] | undefined
  itemPlaceholder?: string
  addLabel?: string
  sortable?: boolean
  onChange: (nextValue: string[]) => void
}

/**
 * 交换数组项位置。
 * @param source 原始数组。
 * @param fromIndex 拖拽起始索引。
 * @param toIndex 拖拽目标索引。
 */
function moveArrayItem(source: string[], fromIndex: number, toIndex: number): string[] {
  if (fromIndex === toIndex) return source
  if (fromIndex < 0 || fromIndex >= source.length) return source
  if (toIndex < 0 || toIndex >= source.length) return source

  const next = [...source]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
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
 * 数组编辑器组件（支持字符串数组增删改）。
 * @param props 组件属性。
 */
export function ArrayEditor(props: ArrayEditorProps) {
  const {
    value,
    itemPlaceholder = '请输入内容',
    addLabel = '新增',
    sortable = false,
    onChange,
  } = props

  const currentValue = useMemo(() => value ?? [], [value])
  const currentValueRef = useRef(currentValue)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const dragPointerYRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const dragScrollContainerRef = useRef<DragScrollContainer>(window)

  /**
   * 同步数组引用，避免拖拽过程读取到旧值。
   */
  useEffect(() => {
    currentValueRef.current = currentValue
  }, [currentValue])

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
  const clearDragging = useCallback(() => {
    stopAutoScroll()
    setDraggingIndex(null)
  }, [stopAutoScroll])

  /**
   * 拖拽过程中，指针抬起后结束排序模式。
   */
  useEffect(() => {
    if (!sortable || draggingIndex === null) return

    const handlePointerUp = () => {
      clearDragging()
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
  }, [clearDragging, draggingIndex, sortable, stopAutoScroll])

  /**
   * 更新数组某一项。
   * @param index 数组索引。
   * @param itemValue 新值。
   */
  const updateItem = (index: number, itemValue: string) => {
    const next = [...currentValue]
    next[index] = itemValue
    onChange(next)
  }

  /**
   * 删除数组某一项。
   * @param index 数组索引。
   */
  const removeItem = (index: number) => {
    onChange(currentValue.filter((_, currentIndex) => currentIndex !== index))
  }

  /**
   * 新增数组项。
   */
  const addItem = () => {
    onChange([...currentValue, ''])
  }

  /**
   * 将当前项上移一位。
   * @param index 数组索引。
   */
  const moveItemUp = (index: number) => {
    if (index <= 0) return
    onChange(moveArrayItem(currentValue, index, index - 1))
  }

  /**
   * 将当前项下移一位。
   * @param index 数组索引。
   */
  const moveItemDown = (index: number) => {
    if (index >= currentValue.length - 1) return
    onChange(moveArrayItem(currentValue, index, index + 1))
  }

  /**
   * 开始拖拽排序（按住图标）。
   * @param index 数组索引。
   * @param event 指针事件。
   */
  const handleSortPointerDown = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (!sortable) return
    event.preventDefault()
    dragPointerYRef.current = event.clientY
    dragScrollContainerRef.current = findScrollContainer(event.currentTarget)
    setDraggingIndex(index)
  }

  /**
   * 指针进入行时执行重排。
   * @param index 数组索引。
   */
  const handleRowPointerEnter = (index: number) => {
    if (!sortable || draggingIndex === null) return
    if (draggingIndex === index) return

    const nextValue = moveArrayItem(currentValueRef.current, draggingIndex, index)
    onChange(nextValue)
    setDraggingIndex(index)
  }

  /**
   * 图标上抬起指针时结束排序。
   * @param event 指针事件。
   */
  const handleSortPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!sortable) return
    event.preventDefault()
    clearDragging()
  }

  return (
    <div className="space-y-2">
      {currentValue.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-700 px-2 py-2 text-[11px] text-gray-500">
          暂无数据
        </div>
      )}

      {currentValue.map((item, index) => (
        <div
          key={index}
          className={`relative flex items-center gap-2 rounded-md border transition-all duration-150 ${
            sortable && draggingIndex === index
              ? 'z-10 scale-[1.01] border-blue-400/70 bg-blue-500/15 shadow-[0_10px_30px_rgba(59,130,246,0.25)] ring-1 ring-blue-400/40'
              : sortable && draggingIndex !== null
              ? 'border-gray-700/70 bg-gray-900/30'
              : 'border-transparent'
          }`}
          onPointerEnter={() => handleRowPointerEnter(index)}
        >
          {sortable && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="按住并拖动排序"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-gray-400 ${
                  draggingIndex === index
                    ? 'cursor-grabbing border-blue-400/70 bg-blue-500/15 text-blue-200'
                    : draggingIndex === null
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
                  onClick={() => moveItemUp(index)}
                >
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  title="下移"
                  disabled={index === currentValue.length - 1}
                  className={`inline-flex h-3.5 w-4 items-center justify-center border-t border-gray-700 text-gray-400 ${
                    index === currentValue.length - 1
                      ? 'cursor-not-allowed bg-gray-900 text-gray-600'
                      : 'bg-gray-900 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                  onClick={() => moveItemDown(index)}
                >
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <input
            type="text"
            value={item}
            placeholder={itemPlaceholder}
            className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500"
            onChange={event => updateItem(index, event.target.value)}
          />
          <button
            type="button"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-300"
            onClick={() => removeItem(index)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {sortable && draggingIndex !== null && (
        <div className="text-[11px] text-blue-200/90">
          拖拽中：靠近窗口上下边缘会自动滚动
        </div>
      )}

      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-gray-600 px-2 py-1 text-xs text-gray-300 hover:border-gray-500 hover:text-gray-100"
        onClick={addItem}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </div>
  )
}
