import { useContext } from 'react'
import { I18nContext, type I18nContextValue } from './context'

/**
 * 读取国际化上下文。
 * @author towfive
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n 必须在 I18nProvider 内使用')
  }
  return context
}

