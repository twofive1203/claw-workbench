import { useMemo } from 'react'
import { filterCommands, type SlashCommand } from '../data/slashCommands'
import { useI18n } from '../i18n/useI18n'

/**
 * 命令检测结果
 */
export interface CommandDetectionResult {
  /** 是否应该显示命令面板 */
  shouldShow: boolean
  /** 搜索关键词 */
  query: string
  /** 过滤后的命令列表 */
  filteredCommands: SlashCommand[]
  /** 斜杠符号在输入框中的位置 */
  slashPosition: number
}

/**
 * 命令检测 Hook
 * @author towfive
 */
export function useCommandDetection(
  inputValue: string,
  cursorPosition: number,
): CommandDetectionResult {
  const { locale } = useI18n()

  return useMemo(() => {
    // 如果输入为空，不显示
    if (!inputValue) {
      return {
        shouldShow: false,
        query: '',
        filteredCommands: [],
        slashPosition: -1,
      }
    }

    // 查找光标前最近的斜杠位置
    const textBeforeCursor = inputValue.slice(0, cursorPosition)
    const lastSlashIndex = textBeforeCursor.lastIndexOf('/')

    // 没有找到斜杠，或斜杠不在行首/空格后
    if (lastSlashIndex === -1) {
      return {
        shouldShow: false,
        query: '',
        filteredCommands: [],
        slashPosition: -1,
      }
    }

    // 检查斜杠前是否是行首或空格
    const charBeforeSlash = lastSlashIndex > 0 ? inputValue[lastSlashIndex - 1] : '\n'
    const isValidPosition = charBeforeSlash === '\n' || charBeforeSlash === ' '

    if (!isValidPosition) {
      return {
        shouldShow: false,
        query: '',
        filteredCommands: [],
        slashPosition: -1,
      }
    }

    // 提取斜杠后到光标位置的文本作为查询关键词
    const query = textBeforeCursor.slice(lastSlashIndex + 1)

    // 检查查询中是否包含空格（如果有空格，说明已经输入了参数，不再显示命令面板）
    if (query.includes(' ')) {
      return {
        shouldShow: false,
        query: '',
        filteredCommands: [],
        slashPosition: -1,
      }
    }

    // 过滤命令
    const filtered = filterCommands(query, locale)

    return {
      shouldShow: filtered.length > 0,
      query,
      filteredCommands: filtered,
      slashPosition: lastSlashIndex,
    }
  }, [inputValue, cursorPosition, locale])
}

/**
 * 命令插入逻辑
 * @param command 要插入的命令
 * @param inputValue 当前输入框内容
 * @param slashPosition 斜杠位置
 * @param cursorPosition 当前光标位置
 * @param triggerName 触发词（命令名或别名）
 * @returns 新的输入值和光标位置
 */
export function insertCommand(
  command: SlashCommand,
  inputValue: string,
  slashPosition: number,
  cursorPosition: number,
  triggerName?: string,
): { newValue: string; newCursorPos: number } {
  // 构建命令文本（优先使用触发词，其次使用命令名）
  const normalizedTrigger = triggerName?.trim()
  const commandToken = normalizedTrigger && normalizedTrigger.length > 0 ? normalizedTrigger : command.name
  const commandText = `/${commandToken} `

  // 替换文本：从斜杠位置到光标位置
  const before = inputValue.slice(0, slashPosition)
  const after = inputValue.slice(cursorPosition)
  const newValue = before + commandText + after

  // 光标定位到命令名后面（空格之后）
  const newCursorPos = before.length + commandText.length

  return { newValue, newCursorPos }
}
