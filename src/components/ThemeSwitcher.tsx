import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown, Palette } from 'lucide-react'
import {
  getThemeById,
  getThemesByAppearance,
  isThemeId,
  THEME_APPEARANCE_LABELS,
  THEME_APPEARANCE_ORDER,
  type ThemeDefinition,
  type ThemeId,
  type ThemePalette,
} from '../data/themes'
import { useI18n } from '../i18n/useI18n'
import { cn } from '../lib/utils'

/**
 * 主题切换器属性。
 * @param themeId 当前主题 ID。
 * @param onThemeChange 主题切换回调。
 */
interface ThemeSwitcherProps {
  themeId: ThemeId
  onThemeChange: (themeId: ThemeId) => void
}

/**
 * 主题悬浮提示状态。
 * @param theme 当前悬浮的主题定义。
 * @param top Tip 的视口顶部坐标。
 * @param left Tip 的视口左侧坐标。
 */
interface ThemeTooltipState {
  theme: ThemeDefinition
  top: number
  left: number
}

/**
 * 渲染主题色板预览。
 * @param palette 主题色板。
 * @param size 色块尺寸规格。
 */
function ThemeSwatches(props: { palette: ThemePalette; size?: 'sm' | 'md'; tr: (text: string) => string }) {
  const { palette, size = 'md', tr } = props
  const swatchSizeClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'
  const colorItems = [
    { key: 'userBubble', value: palette.userBubble, label: tr('theme.user_bubble') },
    { key: 'background', value: palette.background, label: tr('theme.page_background') },
    { key: 'surface', value: palette.surface, label: tr('theme.panel_surface') },
    { key: 'primary', value: palette.primary, label: tr('theme.primary') },
    { key: 'accent', value: palette.accent, label: tr('theme.accent') },
  ]

  return (
    <div className="flex items-center gap-1">
      {colorItems.map(item => (
        <div
          key={item.key}
          className={cn('rounded-full border', swatchSizeClass)}
          style={{
            backgroundColor: item.value,
            borderColor: 'var(--app-border)',
          }}
          title={item.label}
        />
      ))}
    </div>
  )
}

/**
 * 主题切换器组件。
 * 提供按亮色/暗色分组的紧凑下拉列表，并在悬浮时显示主题 tip。
 * @param props 组件属性。
 */
export function ThemeSwitcher(props: ThemeSwitcherProps) {
  const { themeId, onThemeChange } = props
  const [isOpen, setIsOpen] = useState(false)
  const [tooltipState, setTooltipState] = useState<ThemeTooltipState | null>(null)
  const { tr } = useI18n()

  const currentTheme = useMemo(() => getThemeById(themeId), [themeId])

  const themeSections = useMemo(
    () => THEME_APPEARANCE_ORDER
      .map(appearance => ({
        appearance,
        label: THEME_APPEARANCE_LABELS[appearance],
        themes: getThemesByAppearance(appearance),
      }))
      .filter(section => section.themes.length > 0),
    [],
  )

  /**
   * 处理主题选择。
   * @param nextThemeId 目标主题 ID。
   */
  const handleSelect = useCallback((nextThemeId: string) => {
    if (!isThemeId(nextThemeId)) return
    onThemeChange(nextThemeId)
    setIsOpen(false)
    setTooltipState(null)
  }, [onThemeChange])

  /**
   * 关闭下拉菜单和当前 tip。
   */
  const handleCloseMenu = useCallback(() => {
    setIsOpen(false)
    setTooltipState(null)
  }, [])

  /**
   * 根据元素位置更新 tip 坐标。
   * @param theme 当前悬浮的主题定义。
   * @param element 触发 tip 的元素。
   */
  const openTooltip = useCallback((theme: ThemeDefinition, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const tooltipWidth = 248
    const tooltipHeight = 132
    const viewportPadding = 12
    const rightSpace = window.innerWidth - rect.right
    const preferRight = rightSpace >= tooltipWidth + viewportPadding

    const left = preferRight
      ? rect.right + 10
      : Math.max(viewportPadding, rect.left - tooltipWidth - 10)

    const top = Math.min(
      window.innerHeight - tooltipHeight - viewportPadding,
      Math.max(viewportPadding, rect.top - 6),
    )

    setTooltipState({ theme, top, left })
  }, [])

  /**
   * 关闭当前 tip。
   */
  const closeTooltip = useCallback(() => {
    setTooltipState(null)
  }, [])

  /**
   * 处理主题项键盘选择。
   * @param event 键盘事件。
   * @param nextThemeId 目标主题 ID。
   */
  const handleItemKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, nextThemeId: ThemeId) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleSelect(nextThemeId)
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      handleCloseMenu()
    }
  }, [handleCloseMenu, handleSelect])

  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        className={cn(
          'flex h-8 items-center gap-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 text-xs text-[var(--app-text-primary)]',
          'outline-none transition-colors hover:border-blue-500/60',
          'focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20',
        )}
        onClick={() => {
          if (isOpen) {
            handleCloseMenu()
            return
          }

          setIsOpen(true)
        }}
        aria-label={tr('theme.select')}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Palette className="h-3.5 w-3.5 text-[var(--app-text-muted)]" />
        <span className="max-w-[126px] truncate text-left">{currentTheme.name}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-[var(--app-text-muted)] transition-transform',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      <ThemeSwatches palette={currentTheme.palette} size="sm" tr={tr} />

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={handleCloseMenu}
            aria-hidden="true"
          />

          <div
            className={cn(
              'absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[var(--app-border)] bg-gray-900/95 shadow-2xl backdrop-blur',
              'animate-in fade-in slide-in-from-bottom-2',
            )}
          >
            <div className="max-h-[320px] overflow-y-auto p-1.5" role="listbox" aria-label={tr('theme.select')}>
              {themeSections.map(section => (
                <div key={section.appearance} className="py-1">
                  <div className="px-2 pb-1 text-[10px] font-semibold tracking-[0.18em] text-[var(--app-text-muted)] uppercase">
                    {tr(section.label)}
                  </div>

                  <div className="space-y-0.5">
                    {section.themes.map(theme => {
                      const isSelected = theme.id === themeId

                      return (
                        <button
                          key={theme.id}
                          type="button"
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                            isSelected
                              ? 'bg-blue-500/10 text-blue-100'
                              : 'text-[var(--app-text-primary)] hover:bg-gray-900/80',
                          )}
                          role="option"
                          aria-selected={isSelected}
                          title={`${tr(theme.description)}｜${theme.uiFont} / ${theme.codeFont}`}
                          onClick={() => handleSelect(theme.id)}
                          onMouseEnter={event => openTooltip(theme, event.currentTarget)}
                          onMouseLeave={closeTooltip}
                          onFocus={event => openTooltip(theme, event.currentTarget)}
                          onBlur={closeTooltip}
                          onKeyDown={event => handleItemKeyDown(event, theme.id)}
                        >
                          <span className="truncate">{theme.name}</span>

                          {isSelected && (
                            <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-blue-200">
                              <Check className="h-3.5 w-3.5" />
                              {tr('common.current')}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {tooltipState && (
            <div
              className="pointer-events-none fixed z-[60] w-[248px] rounded-xl border border-[var(--app-border)] bg-gray-950 p-3 shadow-2xl"
              style={{ top: tooltipState.top, left: tooltipState.left }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--app-text-primary)]">
                    {tooltipState.theme.name}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--app-text-muted)]">
                    {tr(THEME_APPEARANCE_LABELS[tooltipState.theme.appearance])}
                  </div>
                </div>

                <ThemeSwatches palette={tooltipState.theme.palette} size="sm" tr={tr} />
              </div>

              <p className="mt-2 text-xs leading-5 text-[var(--app-text-secondary)]">
                {tr(tooltipState.theme.description)}
              </p>

              <div className="mt-2 text-[11px] text-[var(--app-text-muted)]">
                {tooltipState.theme.uiFont} / {tooltipState.theme.codeFont}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
