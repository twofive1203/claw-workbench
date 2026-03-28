import { useEffect, useRef, type KeyboardEvent } from 'react'
import { CATEGORY_ICONS, type SlashCommand } from '../data/slashCommands'
import { cn } from '../lib/utils'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * 命令面板组件属性
 */
export interface CommandPaletteProps {
  /** 过滤后的命令列表 */
  commands: SlashCommand[]
  /** 当前选中的索引 */
  selectedIndex: number
  /** 搜索查询关键词 */
  query?: string
  /** 选中索引变化回调 */
  onSelectIndex: (index: number) => void
  /** 命令选择回调 */
  onSelectCommand: (command: SlashCommand) => void
  /** 关闭面板回调 */
  onClose: () => void
}

/**
 * 命令面板组件
 * @author towfive
 */
export function CommandPalette({
  commands,
  selectedIndex,
  query = '',
  onSelectIndex,
  onSelectCommand,
  onClose,
}: CommandPaletteProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useLocalizedSubtree(containerRef)

  /**
   * 滚动到选中项
   */
  useEffect(() => {
    if (selectedItemRef.current && listRef.current) {
      const item = selectedItemRef.current
      const list = listRef.current
      const itemTop = item.offsetTop
      const itemBottom = itemTop + item.offsetHeight
      const listScrollTop = list.scrollTop
      const listHeight = list.clientHeight

      if (itemTop < listScrollTop) {
        list.scrollTop = itemTop
      } else if (itemBottom > listScrollTop + listHeight) {
        list.scrollTop = itemBottom - listHeight
      }
    }
  }, [selectedIndex])

  /**
   * 处理键盘导航
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        onSelectIndex(Math.min(selectedIndex + 1, commands.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        onSelectIndex(Math.max(selectedIndex - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (commands[selectedIndex]) {
          onSelectCommand(commands[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }

  if (commands.length === 0) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
      onKeyDown={handleKeyDown}
    >
      <div className="wb-command-surface mx-auto max-w-4xl rounded-[22px]">
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto p-2.5"
        >
          <div className="space-y-1">
            {commands.map((command, index) => {
              const isSelected = index === selectedIndex
              const icon = command.icon ?? CATEGORY_ICONS[command.category]

              // 检查是否通过别名匹配
              const lowerQuery = query.toLowerCase()
              const matchedAlias = command.aliases?.find(alias =>
                alias.toLowerCase() === lowerQuery || alias.toLowerCase().startsWith(lowerQuery)
              )

              return (
                <button
                  key={`${command.name}-${index}`}
                  ref={isSelected ? selectedItemRef : null}
                  type="button"
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[16px] px-3 py-3 text-left transition-colors',
                    isSelected
                      ? 'bg-[var(--surface-active)] ring-1 ring-[var(--border-accent)]'
                      : 'hover:bg-[var(--surface-hover)]',
                  )}
                  onClick={() => onSelectCommand(command)}
                  onMouseEnter={() => onSelectIndex(index)}
                >
                  <span className="mt-0.5 text-lg leading-none">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'font-mono text-sm font-medium',
                          isSelected ? 'text-[var(--color-blue-200)]' : 'text-[var(--text-loud)]',
                        )}
                      >
                        /{command.name}
                      </span>
                      {matchedAlias && (
                        <span className="rounded bg-[color-mix(in_srgb,var(--color-amber-500)_20%,transparent)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-amber-300)]">
                          别名: /{matchedAlias}
                        </span>
                      )}
                      {command.parameters && command.parameters.length > 0 && (
                        <span className="font-mono text-xs text-[var(--text-faint)]">
                          {command.parameters
                            .filter(p => p.required)
                            .map(p => `<${p.name}>`)
                            .join(' ')}
                          {command.parameters.some(p => !p.required) && (
                              <span className="ml-1 text-[var(--text-faint)]">
                              {command.parameters
                                .filter(p => !p.required)
                                .map(p => `[${p.name}]`)
                                .join(' ')}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-faint)]">
                      {command.description}
                    </div>
                    {command.aliases && command.aliases.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {command.aliases.map(alias => (
                          <span
                            key={alias}
                            className={cn(
                              'rounded px-1.5 py-0.5 font-mono text-[10px]',
                              alias === matchedAlias
                                ? 'bg-[color-mix(in_srgb,var(--color-amber-500)_20%,transparent)] text-[var(--color-amber-300)]'
                                : 'bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] text-[var(--text-faint)]'
                            )}
                          >
                            /{alias}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
        <div className="hidden items-center border-t border-[var(--border-default)] px-3 py-2 text-[11px] text-[var(--text-faint)] md:flex">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-1.5 py-0.5 font-mono">↑↓</kbd>
            导航
          </span>
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-1.5 py-0.5 font-mono">Tab</kbd>
            <kbd className="rounded bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-1.5 py-0.5 font-mono">Enter</kbd>
            选择
          </span>
          <span className="mx-2">·</span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-1.5 py-0.5 font-mono">Esc</kbd>
            关闭
          </span>
        </div>
        <div className="border-t border-[var(--border-default)] px-3 py-2 text-[11px] text-[var(--text-faint)] md:hidden">
          点击选择命令
        </div>
      </div>
    </div>
  )
}
