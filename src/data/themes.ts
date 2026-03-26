/**
 * 主题标识。
 * @author towfive
 */
export type ThemeId =
  | 'default-dark'
  | 'one-dark-pro'
  | 'dracula'
  | 'catppuccin-mocha'
  | 'nord'
  | 'tokyo-night'
  | 'claude'
  | 'vercel'
  | 'dark-matter'
  | 'catppuccin-latte'
  | 'github-light'
  | 'rose-pine-dawn'
  | 'solarized-light'

/**
 * 主题明暗类型。
 * @author towfive
 */
export type ThemeAppearance = 'light' | 'dark'

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
export const THEME_APPEARANCE_ORDER: ThemeAppearance[] = ['light', 'dark']

/**
 * 主题分组名称映射。
 */
export const THEME_APPEARANCE_LABELS: Record<ThemeAppearance, string> = {
  light: '亮色主题',
  dark: '暗色主题',
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
    name: 'Default Dark',
    appearance: 'dark',
    description: '项目原始深色风格，蓝色强调更稳重。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#2563eb',
      background: '#030712',
      surface: '#111827',
      primary: '#3b82f6',
      secondary: '#6b7280',
      accent: '#86efac',
    },
  },
  {
    id: 'one-dark-pro',
    name: 'One Dark Pro',
    appearance: 'dark',
    description: '柔和深灰底，经典长时间编码配色。',
    uiFont: 'Inter',
    codeFont: 'Fira Code',
    palette: {
      userBubble: '#528bff',
      background: '#282c34',
      surface: '#2c313a',
      primary: '#61afef',
      secondary: '#636d83',
      accent: '#98c379',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    appearance: 'dark',
    description: '深紫蓝底，高饱和强调色更有个性。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#ff79c6',
      background: '#282a36',
      surface: '#21222c',
      primary: '#bd93f9',
      secondary: '#6272a4',
      accent: '#50fa7b',
    },
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    appearance: 'dark',
    description: '柔和粉彩暗色，整体观感更轻盈。',
    uiFont: 'Inter',
    codeFont: 'Cascadia Code',
    palette: {
      userBubble: '#cba6f7',
      background: '#1e1e2e',
      surface: '#181825',
      primary: '#89b4fa',
      secondary: '#6c7086',
      accent: '#a6e3a1',
    },
  },
  {
    id: 'nord',
    name: 'Nord',
    appearance: 'dark',
    description: '冷调极地蓝灰，清爽克制且稳定。',
    uiFont: 'Inter',
    codeFont: 'Source Code Pro',
    palette: {
      userBubble: '#5e81ac',
      background: '#2e3440',
      surface: '#3b4252',
      primary: '#88c0d0',
      secondary: '#7d8799',
      accent: '#a3be8c',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    appearance: 'dark',
    description: '深蓝紫夜景，霓虹科技感更明显。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#bb9af7',
      background: '#1a1b26',
      surface: '#24283b',
      primary: '#7aa2f7',
      secondary: '#565f89',
      accent: '#2ac3de',
    },
  },
  {
    id: 'claude',
    name: 'Claude',
    appearance: 'dark',
    description: '温暖橙色系，整体气质偏柔和。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#d97706',
      background: '#1c1917',
      surface: '#292524',
      primary: '#f59e0b',
      secondary: '#78716c',
      accent: '#a8a29e',
    },
  },
  {
    id: 'vercel',
    name: 'Vercel',
    appearance: 'dark',
    description: '简约黑白品牌风格，层次非常克制。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#0070f3',
      background: '#000000',
      surface: '#171717',
      primary: '#0070f3',
      secondary: '#737373',
      accent: '#ffffff',
    },
  },
  {
    id: 'dark-matter',
    name: 'Dark Matter',
    appearance: 'dark',
    description: '深邃黑底，紫色科技强调更突出。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#8b5cf6',
      background: '#050505',
      surface: '#0a0a0a',
      primary: '#8b5cf6',
      secondary: '#3f3f46',
      accent: '#a78bfa',
    },
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    appearance: 'light',
    description: '奶油浅底配粉彩点缀，阅读感受轻柔。',
    uiFont: 'Inter',
    codeFont: 'Cascadia Code',
    palette: {
      userBubble: '#7287fd',
      background: '#eff1f5',
      surface: '#ccd0da',
      primary: '#1e66f5',
      secondary: '#7c7f93',
      accent: '#40a02b',
    },
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    appearance: 'light',
    description: '干净白底配冷灰蓝，接近文档工作区观感。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#0969da',
      background: '#ffffff',
      surface: '#f6f8fa',
      primary: '#0969da',
      secondary: '#6e7781',
      accent: '#2da44e',
    },
  },
  {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    appearance: 'light',
    description: '暖粉米色底，复古柔和，层次比较细腻。',
    uiFont: 'Inter',
    codeFont: 'JetBrains Mono',
    palette: {
      userBubble: '#56949f',
      background: '#faf4ed',
      surface: '#f2e9de',
      primary: '#907aa9',
      secondary: '#797593',
      accent: '#d7827e',
    },
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    appearance: 'light',
    description: '经典米黄色底，代码和文档都更耐看。',
    uiFont: 'Inter',
    codeFont: 'Source Code Pro',
    palette: {
      userBubble: '#268bd2',
      background: '#fdf6e3',
      surface: '#eee8d5',
      primary: '#268bd2',
      secondary: '#657b83',
      accent: '#859900',
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
