/**
 * 公共解析函数。
 * 说明：统一收口常用的对象判断、文本提取与错误文本格式化逻辑。
 */

/**
 * 判断值是否为对象记录。
 * @param value 待判断值。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 将 unknown 转为非空文本。
 * @param value 原始值。
 */
export function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

/**
 * 将 unknown 转为非空文本，空值返回 undefined。
 * @param value 原始值。
 */
export function toOptionalText(value: unknown): string | undefined {
  return toText(value) ?? undefined
}

/**
 * 将错误对象转换为可展示文本。
 * @param error 错误对象。
 */
export function toErrorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}
