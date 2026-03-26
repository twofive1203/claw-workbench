import { createContext } from 'react'
import type { AppLocale, I18nParams } from './messages'

/**
 * 国际化上下文结构。
 * @param locale 当前语言。
 * @param isEnglish 是否为英文。
 * @param setLocale 设置语言。
 * @param tr 翻译短文本方法。
 * @author towfive
 */
export interface I18nContextValue {
  locale: AppLocale
  isEnglish: boolean
  setLocale: (locale: AppLocale) => void
  tr: (key: string, params?: I18nParams) => string
  trText: (text: string) => string
}

/**
 * 国际化上下文对象。
 * @author towfive
 */
export const I18nContext = createContext<I18nContextValue | null>(null)
