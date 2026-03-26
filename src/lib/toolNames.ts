/**
 * 工具显示名映射。
 * @param key 工具 id。
 * @param value 工具中文显示名。
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  apply_patch: '应用补丁',
  exec: '执行命令',
  bash: '运行 Shell',
  web_search: '搜索网页',
  web_fetch: '获取网页',
  memory_search: '搜索记忆',
  memory_get: '获取记忆',
  browser: '浏览器',
  canvas: '画布',
  image: '图片理解',
  message: '发送消息',
  sessions_list: '列出会话',
  sessions_send: '会话发送',
  sessions_spawn: '启动子代理',
  cron: '定时任务',
  gateway: '网关操作',
  process: '进程管理',
}

/**
 * 获取工具显示名。
 * @param toolId 工具 id。
 */
export function getToolDisplayName(toolId: string): string {
  return TOOL_DISPLAY_NAMES[toolId] ?? toolId
}
