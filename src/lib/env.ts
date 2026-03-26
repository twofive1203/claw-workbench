/**
 * 运行环境检测工具。
 * @author towfive
 */

/**
 * 判断当前是否运行在 Tauri 环境中。
 */
export function isTauri(): boolean {
  return '__TAURI_INTERNALS__' in window
}

export const IS_TAURI = isTauri()

/**
 * 安全调用 Tauri Command。
 * 浏览器环境下返回 undefined，Tauri 环境下动态导入 @tauri-apps/api/core 并执行 invoke。
 * @param cmd 命令名称。
 * @param args 命令参数。
 */
export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri()) return undefined
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}
