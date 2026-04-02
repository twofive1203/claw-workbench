/**
 * 主题标识。
 * @author towfive
 */
export type ThemeId =
  | 'default-dark'
  | 'default-dim'
  | 'default-light'
  | 'github-light'
  | 'default-system'

/**
 * 主题明暗类型。
 * @author towfive
 */
export type ThemeAppearance = 'light' | 'dark' | 'system'

/**
 * 主题色板定义。
 * @param userBubble 用户气泡颜色。
 * @param background 页面背景颜色。
 * @param surface 面板表面颜色。
 * @param primary 主强调色。
 * @param secondary 次级中性色。
 * @param accent 辅助强调色。
 */
export interface ThemePalette {
  userBubble: string
  background: string
  surface: string
  primary: string
  secondary: string
  accent: string
}

/**
 * 单个主题定义。
 * @param id 主题唯一标识。
 * @param name 主题名称。
 * @param appearance 主题明暗类型。
 * @param description 主题描述。
 * @param uiFont UI 字体。
 * @param codeFont 代码字体。
 * @param palette 主题预览色板。
 */
export interface ThemeDefinition {
  id: ThemeId
  name: string
  appearance: ThemeAppearance
  description: string
  uiFont: string
  codeFont: string
  palette: ThemePalette
}

/**
 * 主题分组展示顺序。
 */
export const THEME_APPEARANCE_ORDER: ThemeAppearance[] = ['dark', 'light', 'system']

/**
 * 主题分组名称映射。
 */
export const THEME_APPEARANCE_LABELS: Record<ThemeAppearance, string> = {
  light: '亮色主题',
  dark: '暗色主题',
  system: '系统主题',
}

/**
 * 默认主题标识。
 */
export const DEFAULT_THEME_ID: ThemeId = 'default-dark'

/**
 * 全部可用主题。
 */
export const THEMES: ThemeDefinition[] = [
  {
    id: 'default-dark',
    name: 'Workbench Dark',
    appearance: 'dark',
    description: '桌面工作台深色主题，冷蓝高亮与半透明层次更明显。',
    uiFont: 'System UI',
    codeFont: 'Cascadia Mono',
    palette: {
      userBubble: '#4b8fff',
      background: '#071018',
      surface: '#111c2a',
      primary: '#8bc3ff',
      secondary: '#6f8198',
      accent: '#6cd6c3',
    },
  },
  {
    id: 'default-dim',
    name: 'Workbench Dim',
    appearance: 'dark',
    description: '更柔和的灰蓝工作台，适合长时间浏览高密度信息。',
    uiFont: 'System UI',
    codeFont: 'Cascadia Mono',
    palette: {
      userBubble: '#5c98ff',
      background: '#121923',
      surface: '#1b2431',
      primary: '#9cc8ff',
      secondary: '#7f90a6',
      accent: '#78d8b7',
    },
  },
  {
    id: 'default-light',
    name: 'Workbench Light',
    appearance: 'light',
    description: '浅色磨砂工作台，保留同样的面板层级与冷蓝激活态。',
    uiFont: 'System UI',
    codeFont: 'Cascadia Mono',
    palette: {
      userBubble: '#377eff',
      background: '#eef4fb',
      surface: '#f7fbff',
      primary: '#3e82f6',
      secondary: '#70839d',
      accent: '#2da78d',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    appearance: 'light',
    description: 'GitHub 风格亮色主题，白底、浅灰边框与蓝色主强调更接近 GitHub Light。',
    uiFont: 'GitHub Sans',
    codeFont: 'ui-monospace',
    palette: {
      userBubble: '#0969da',
      background: '#f6f8fa',
      surface: '#ffffff',
      primary: '#0969da',
      secondary: '#656d76',
      accent: '#2da44e',
    },
  },
  {
    id: 'default-system',
    name: 'Follow System',
    appearance: 'system',
    description: '跟随系统明暗切换，始终保持工作台分层和冷蓝强调。',
    uiFont: 'System UI',
    codeFont: 'Cascadia Mono',
    palette: {
      userBubble: '#268bd2',
      background: '#eef4fb',
      surface: '#f7fbff',
      primary: '#3e82f6',
      secondary: '#70839d',
      accent: '#2da78d',
    },
  },
]

const THEME_ID_SET = new Set<ThemeId>(THEMES.map(item => item.id))

/**
 * 判断传入值是否为合法主题 ID。
 * @param value 任意值。
 */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_ID_SET.has(value as ThemeId)
}

/**
 * 根据主题 ID 获取主题定义。
 * @param themeId 主题 ID。
 */
export function getThemeById(themeId: ThemeId): ThemeDefinition {
  return THEMES.find(item => item.id === themeId) ?? THEMES[0]
}

/**
 * 根据明暗类型筛选主题。
 * @param appearance 主题明暗类型。
 */
export function getThemesByAppearance(appearance: ThemeAppearance): ThemeDefinition[] {
  return THEMES.filter(item => item.appearance === appearance)
}
