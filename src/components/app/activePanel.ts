/**
 * 互斥主面板标识。
 */
export type ActivePanel = 'none' | 'config' | 'health' | 'memory' | 'cron' | 'logs' | 'webServer'

/**
 * 可切换的具体面板。
 */
export type ToggleablePanel = Exclude<ActivePanel, 'none'>

/**
 * 切换当前激活面板。
 * @param current 当前面板。
 * @param next 目标面板。
 */
export function toggleActivePanel(current: ActivePanel, next: ToggleablePanel): ActivePanel {
  return current === next ? 'none' : next
}

/**
 * 判断是否为主内容区面板。
 * @param panel 当前面板。
 */
export function isMainContentPanel(panel: ActivePanel): panel is 'config' | 'memory' | 'logs' {
  return panel === 'config' || panel === 'memory' || panel === 'logs'
}
