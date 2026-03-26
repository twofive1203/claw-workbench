import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_THEME_ID,
  getThemeById,
  isThemeId,
  THEMES,
  type ThemeDefinition,
  type ThemeId,
} from '../data/themes'

const THEME_STORAGE_KEY = 'openclaw-theme-id'

/**
 * 主题存储 Hook 返回结构。
 * @param themeId 当前主题 ID。
 * @param theme 当前主题定义。
 * @param themes 全部主题列表。
 * @param setTheme 切换主题函数。
 */
interface UseThemeStoreResult {
  themeId: ThemeId
  theme: ThemeDefinition
  themes: ThemeDefinition[]
  setTheme: (themeId: ThemeId) => void
}

/**
 * 读取本地持久化主题。
 */
function readThemeFromStorage(): ThemeId {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  const resolvedThemeId = isThemeId(stored) ? stored : DEFAULT_THEME_ID
  document.documentElement.dataset.theme = resolvedThemeId
  return resolvedThemeId
}

/**
 * 主题状态管理 Hook（带 localStorage 持久化）。
 */
export function useThemeStore(): UseThemeStoreResult {
  const [themeId, setThemeId] = useState<ThemeId>(readThemeFromStorage)

  /**
   * 应用主题到 document，并写入 localStorage。
   * @param nextThemeId 当前主题。
   */
  useEffect(() => {
    document.documentElement.dataset.theme = themeId
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId)
  }, [themeId])

  /**
   * 切换主题。
   * @param nextThemeId 目标主题 ID。
   */
  const setTheme = useCallback((nextThemeId: ThemeId) => {
    setThemeId(nextThemeId)
  }, [])

  const theme = useMemo(
    () => getThemeById(themeId),
    [themeId],
  )

  return {
    themeId,
    theme,
    themes: THEMES,
    setTheme,
  }
}
