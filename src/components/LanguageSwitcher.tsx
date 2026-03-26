import { Languages } from 'lucide-react'
import { LOCALE_LABELS, type AppLocale } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { cn } from '../lib/utils'

/**
 * 语言切换器属性。
 * @param compact 是否使用紧凑模式。
 * @author towfive
 */
interface LanguageSwitcherProps {
  compact?: boolean
}

const LANGUAGE_OPTIONS: AppLocale[] = ['zh-CN', 'en-US']

/**
 * 语言切换器。
 * @param props 组件属性。
 */
export function LanguageSwitcher(props: LanguageSwitcherProps) {
  const { compact = false } = props
  const { locale, setLocale, tr } = useI18n()

  return (
    <div className="inline-flex items-center gap-1.5">
      {!compact && (
        <span className="text-xs text-[var(--color-gray-400)]">
          {tr('language.switch')}
        </span>
      )}

      <div className="inline-flex items-center rounded-lg border border-[var(--color-gray-700)] bg-[var(--color-gray-950)] p-0.5">
        {LANGUAGE_OPTIONS.map((option) => {
          const isActive = option === locale
          return (
            <button
              key={option}
              type="button"
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
                isActive
                  ? 'bg-[var(--color-blue-600)] text-white'
                  : 'text-[var(--color-gray-300)] hover:bg-[var(--color-gray-800)] hover:text-[var(--color-gray-100)]',
              )}
              title={tr('language.switch')}
              onClick={() => setLocale(option)}
            >
              {option === 'zh-CN' && <Languages className="h-3.5 w-3.5" />}
              {LOCALE_LABELS[option]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
