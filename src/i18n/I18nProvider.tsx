import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_LOCALE, I18N_STORAGE_KEY, normalizeLocale, translateByKey, translateUiText, type AppLocale, type I18nParams } from './messages'
import { I18nContext, type I18nContextValue } from './context'

/**
 * 读取初始语言。
 */
function readInitialLocale(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE

  const storedLocale = window.localStorage.getItem(I18N_STORAGE_KEY)
  if (storedLocale) return normalizeLocale(storedLocale)

  return normalizeLocale(window.navigator.language)
}

/**
 * 国际化 Provider。
 * @param props.children 子组件。
 */
export function I18nProvider(props: { children: ReactNode }) {
  const { children } = props
  const [locale, setLocale] = useState<AppLocale>(readInitialLocale)

  useEffect(() => {
    document.documentElement.lang = locale
    window.localStorage.setItem(I18N_STORAGE_KEY, locale)
  }, [locale])

  /**
   * 翻译旧原文文案。
   * @param text 原始文本。
   */
  const trText = useCallback((text: string) => translateUiText(text, locale), [locale])

  /**
   * 按 key 翻译界面文案，未命中时回退到旧原文翻译。
   * @param key 国际化 key 或旧原文。
   * @param params 占位参数。
   */
  const tr = useCallback((key: string, params?: I18nParams) => {
    const translated = translateByKey(key, locale, params)
    return translated ?? trText(key)
  }, [locale, trText])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    isEnglish: locale === 'en-US',
    setLocale,
    tr,
    trText,
  }), [locale, tr, trText])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
