import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy, Download, Globe, Loader2, Menu, Paperclip, RefreshCw, Send, Type } from 'lucide-react'
import { AppMainHeader } from './components/app/AppMainHeader'
import { AppPrimaryPanel } from './components/app/AppPrimaryPanel'
import { AppSidebar } from './components/app/AppSidebar'
import { isMainContentPanel, toggleActivePanel, type ActivePanel, type ToggleablePanel } from './components/app/activePanel'
import { CommandPalette } from './components/CommandPalette'
import { ImagePreview } from './components/ImagePreview'
import { MultiModelConversationPane } from './components/MultiModelConversationPane'
import { ToolCallBlock } from './components/ToolCallBlock'
import { ExecApprovalToast } from './components/ExecApprovalToast'
import { SystemNotification } from './components/SystemNotification'
import { ConfirmModal } from './components/ConfirmModal'
import { SubagentPanel } from './components/SubagentPanel'
import { useConfigStore } from './hooks/useConfigStore'
import { useOpenClaw } from './hooks/useOpenClaw'
import { useNotification } from './hooks/useNotification'
import { useServerStore } from './hooks/useServerStore'
import { useThemeStore } from './hooks/useThemeStore'
import { useCommandDetection, insertCommand } from './hooks/useCommandDetection'
import { useWebServer } from './hooks/useWebServer'
import { IS_TAURI, safeInvoke } from './lib/env'
import { cn } from './lib/utils'
import { getFilesFromClipboard, getImagesFromDrop, fileToImageAttachment, isImageMime, inlineTextAttachments } from './lib/imageUtils'
import type { ImageAttachment } from './lib/imageUtils'
import type { SlashCommand } from './data/slashCommands'
import type { Agent, ChatMediaItem, ChatMessage, SessionSummary } from './types'
import { isRecord, type OpenClawConfig } from './types/config'
import { useI18n } from './i18n/useI18n'
import type { I18nParams } from './i18n/messages'

const USER_METADATA_BLOCK_RE = /\s*[^\n]*\(untrusted[^)]*metadata\):\s*\n```[a-zA-Z0-9_-]*\n[\s\S]*?\n```\s*/gi
const USER_TIMESTAMP_LINE_RE = /^\s*\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+[^\]]+\]\s*/gm
const USER_CURRENT_MESSAGE_MARKER = '[Current message - respond to this]'

const FILE_INLINE_BLOCK_RE = /<file\s+name="[^"]*">\s*```[a-zA-Z0-9_-]*\s[\s\S]*?```\s*<\/file>\s*/g
const FILE_NAME_EXTRACT_RE = /<file\s+name="([^"]*)">/g
const DEFAULT_THINKING_LEVEL_OPTIONS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
const TOOL_CALL_VISIBILITY_STORAGE_KEY = 'openclaw-show-tool-calls'
const CHAT_VIEW_MODE_STORAGE_KEY = 'openclaw-chat-view-mode'
const CHAT_FONT_SIZE_STORAGE_KEY = 'openclaw-chat-font-size'
const MESSAGE_EXPORT_SUCCESS_RESET_MS = 2000
const MESSAGE_ACTION_SUCCESS_RESET_MS = 2000
const MESSAGE_ACTION_BUTTON_CLASS = 'wb-mini-button'
const USER_SENDER_NAME = 'You'
const SYSTEM_SENDER_NAME = 'System'
const DEFAULT_ASSISTANT_SENDER_NAME = 'Agent'
const MULTI_MODEL_MODE_MIN_COUNT = 2
const MULTI_MODEL_MODE_MAX_COUNT = 4

type ChatFontSizePreset = 'compact' | 'default' | 'comfortable' | 'large' | 'xlarge'

const CHAT_FONT_SIZE_PRESETS: Record<
  ChatFontSizePreset,
  {
    body: number
    meta: number
    code: number
    input: number
    bodyLineHeight: number
    codeLineHeight: number
    inputLineHeight: number
  }
> = {
  compact: {
    body: 11,
    meta: 9.5,
    code: 9.5,
    input: 11,
    bodyLineHeight: 1.62,
    codeLineHeight: 1.56,
    inputLineHeight: 1.5,
  },
  default: {
    body: 12,
    meta: 10,
    code: 10,
    input: 12,
    bodyLineHeight: 1.66,
    codeLineHeight: 1.6,
    inputLineHeight: 1.54,
  },
  comfortable: {
    body: 13,
    meta: 10.5,
    code: 10.5,
    input: 13,
    bodyLineHeight: 1.7,
    codeLineHeight: 1.64,
    inputLineHeight: 1.56,
  },
  large: {
    body: 14,
    meta: 11,
    code: 11,
    input: 14,
    bodyLineHeight: 1.74,
    codeLineHeight: 1.68,
    inputLineHeight: 1.6,
  },
  xlarge: {
    body: 15,
    meta: 12,
    code: 12,
    input: 15,
    bodyLineHeight: 1.78,
    codeLineHeight: 1.72,
    inputLineHeight: 1.64,
  },
}

/**
 * 多模型卡片状态。
 * @param id 卡片唯一标识。
 * @param sessionKey 绑定的会话 key。
 * @param model 当前选中的模型。
 */
interface MultiModelPaneState {
  id: string
  sessionKey: string
  model: string
}

/**
 * 构建助手消息的通知去重签名。
 * @param message 助手消息。
 */
function buildAssistantNotifySignature(message: ChatMessage): string {
  const runId = message.runId?.trim()
  if (runId) return `run:${runId}`

  const normalizedContent = message.content.replace(/\s+/g, ' ').trim().slice(0, 120)
  return `fallback:${message.timestamp}:${normalizedContent}`
}

/**
 * 从 localStorage 读取工具调用展示开关。
 */
function loadToolCallVisibilitySetting(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(TOOL_CALL_VISIBILITY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 持久化工具调用展示开关。
 * @param enabled 是否展示工具调用详情。
 */
function saveToolCallVisibilitySetting(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TOOL_CALL_VISIBILITY_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // localStorage 不可用时静默失败。
  }
}

type ChatViewMode = 'simple' | 'detailed'

/**
 * 从 localStorage 读取对话模式。
 */
function loadChatViewMode(): ChatViewMode {
  if (typeof window === 'undefined') return 'detailed'
  try {
    const value = window.localStorage.getItem(CHAT_VIEW_MODE_STORAGE_KEY)
    return value === 'simple' ? 'simple' : 'detailed'
  } catch {
    return 'detailed'
  }
}

/**
 * 持久化对话模式。
 * @param mode 对话模式。
 */
function saveChatViewMode(mode: ChatViewMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHAT_VIEW_MODE_STORAGE_KEY, mode)
  } catch {
    // localStorage 不可用时静默失败。
  }
}

/**
 * 从 localStorage 读取聊天字体大小档位。
 */
function loadChatFontSizePreset(): ChatFontSizePreset {
  if (typeof window === 'undefined') return 'default'
  try {
    const value = window.localStorage.getItem(CHAT_FONT_SIZE_STORAGE_KEY)
    if (value === 'compact' || value === 'comfortable' || value === 'large' || value === 'xlarge') return value
    return 'default'
  } catch {
    return 'default'
  }
}

/**
 * 持久化聊天字体大小档位。
 * @param preset 字体大小档位。
 */
function saveChatFontSizePreset(preset: ChatFontSizePreset): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(CHAT_FONT_SIZE_STORAGE_KEY, preset)
  } catch {
    // localStorage 不可用时静默失败。
  }
}

/**
 * 提取最后一段 inbound 时间戳行之后的正文（显示层兜底）。
 * @param content 原始文本。
 */
function extractUserBodyAfterLastTimestamp(content: string): string {
  USER_TIMESTAMP_LINE_RE.lastIndex = 0
  let lastMatch: RegExpExecArray | null = null

  while (true) {
    const matched = USER_TIMESTAMP_LINE_RE.exec(content)
    if (!matched) break
    lastMatch = matched
  }

  if (!lastMatch) return content
  const next = content.slice(lastMatch.index + lastMatch[0].length)
  return next.trim() ? next : content
}

/**
 * 清理用户消息中的 inbound 包裹信息（仅用于显示）。
 * @param content 原始文本。
 */
function sanitizeUserDisplayContent(content: string): string {
  let next = content.replace(/\r\n/g, '\n')

  const markerIndex = next.lastIndexOf(USER_CURRENT_MESSAGE_MARKER)
  if (markerIndex >= 0) {
    next = next.slice(markerIndex + USER_CURRENT_MESSAGE_MARKER.length)
  }

  next = next.replace(USER_METADATA_BLOCK_RE, '\n')
  next = extractUserBodyAfterLastTimestamp(next)
  next = next.replace(/^(?:\s*System:\s*\[[^\]]+\][^\n]*\n)+/i, '')
  next = next.replace(FILE_INLINE_BLOCK_RE, '')
  return next.trimStart()
}

/**
 * 清理用户消息中的 inbound 包裹信息，用于重试时恢复原始可发送内容。
 * @param content 原始文本。
 */
function sanitizeUserRetryContent(content: string): string {
  let next = content.replace(/\r\n/g, '\n')

  const markerIndex = next.lastIndexOf(USER_CURRENT_MESSAGE_MARKER)
  if (markerIndex >= 0) {
    next = next.slice(markerIndex + USER_CURRENT_MESSAGE_MARKER.length)
  }

  next = next.replace(USER_METADATA_BLOCK_RE, '\n')
  next = extractUserBodyAfterLastTimestamp(next)
  next = next.replace(/^(?:\s*System:\s*\[[^\]]+\][^\n]*\n)+/i, '')
  return next.trim()
}

/**
 * 判断两个日期是否为同一天（本地时区）。
 * @param dateA 日期 A。
 * @param dateB 日期 B。
 */
function isSameCalendarDate(dateA: Date, dateB: Date): boolean {
  return (
    dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate()
  )
}

/**
 * 将数字补齐为两位字符串。
 * @param value 数字值。
 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 将毫秒时间戳格式化为更易读的时间文本。
 * @param ts 毫秒时间戳。
 * @param nowTs 当前时间戳（毫秒）。
 */
function formatMessageTime(ts: number, nowTs = Date.now(), isEnglish = false): string {
  const date = new Date(ts)
  const now = new Date(nowTs)
  const hh = pad2(date.getHours())
  const mm = pad2(date.getMinutes())
  const time = `${hh}:${mm}`

  if (isSameCalendarDate(date, now)) {
    return time
  }

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameCalendarDate(date, yesterday)) {
    return isEnglish ? `Yesterday ${time}` : `昨天 ${time}`
  }

  const month = pad2(date.getMonth() + 1)
  const day = pad2(date.getDate())
  if (date.getFullYear() === now.getFullYear()) {
    return `${month}-${day} ${time}`
  }

  return `${date.getFullYear()}-${month}-${day} ${time}`
}

/**
 * 解析消息展示用模型名（优先消息级，回退会话级）。
 * @param role 消息角色。
 * @param messageModel 消息级模型名。
 * @param sessionModel 会话级模型名。
 */
function resolveMessageModel(
  role: 'user' | 'assistant' | 'system',
  messageModel?: string,
  sessionModel?: string,
): string | null {
  if (role !== 'assistant') return null
  const normalizedMessageModel = messageModel?.trim()
  if (normalizedMessageModel) return normalizedMessageModel
  const normalizedSessionModel = sessionModel?.trim()
  return normalizedSessionModel ?? null
}

/**
 * 解析助手消息状态文案。
 * @param message 聊天消息。
 */
function resolveAssistantStatusLabel(message: ChatMessage, tr: (key: string, params?: I18nParams) => string): string | null {
  if (message.role !== 'assistant') return null
  if (message.messageState === 'streaming') return tr('app.status.generating')
  if (message.messageState === 'aborted') return tr('app.status.aborted')
  if (message.messageState === 'error') {
    const errorText = message.errorMessage?.trim() ?? ''
    if (!errorText) return tr('app.status.failed')
    const shortText = errorText.length > 48 ? `${errorText.slice(0, 48)}...` : errorText
    return tr('app.status.failed_with_reason', { reason: shortText })
  }
  if (message.stopReason && message.stopReason !== 'stop') return tr('app.status.ended_with_reason', { reason: message.stopReason })
  return null
}

/**
 * 格式化 token 数值。
 * @param value token 数值。
 */
function formatTokenValue(value: number | undefined, formatter: Intl.NumberFormat): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return formatter.format(Math.round(value))
}

/**
 * 生成会话设置标签列表。
 * @param session 当前会话。
 */
function resolveSessionSettingTags(session: SessionSummary | null, tr: (key: string, params?: I18nParams) => string): string[] {
  if (!session) return []
  const tags: string[] = []
  if (session.thinkingLevel) tags.push(tr('app.setting.thinking', { level: session.thinkingLevel }))
  if (session.verboseLevel) tags.push(tr('app.setting.verbose', { level: session.verboseLevel }))
  if (session.reasoningLevel) tags.push(tr('app.setting.reasoning', { level: session.reasoningLevel }))
  if (session.elevatedLevel) tags.push(tr('app.setting.elevated', { level: session.elevatedLevel }))
  if (session.sendPolicy === 'allow') tags.push(tr('app.setting.send_allow'))
  if (session.sendPolicy === 'deny') tags.push(tr('app.setting.send_deny'))
  return tags
}

/**
 * 生成会话 token 摘要文本。
 * @param session 当前会话。
 */
function resolveSessionTokenSummary(
  session: SessionSummary | null,
  formatter: Intl.NumberFormat,
  tr: (key: string, params?: I18nParams) => string,
): string | null {
  if (!session) return null
  const total = formatTokenValue(session.totalTokens, formatter)
  const input = formatTokenValue(session.inputTokens, formatter)
  const output = formatTokenValue(session.outputTokens, formatter)
  if (!total && !input && !output) return null

  const parts: string[] = []
  if (total) {
    const suffix = session.totalTokensFresh === false ? tr('app.token.estimated') : ''
    parts.push(tr('app.token.total', { total, suffix }))
  }
  if (input) parts.push(tr('app.token.input', { input }))
  if (output) parts.push(tr('app.token.output', { output }))
  return `Token ${parts.join(' · ')}`
}

/**
 * 从会话 key 解析 agent id（仅显示层使用）。
 * @param sessionKey 会话 key。
 */
function parseAgentIdFromSessionKeyForDisplay(sessionKey: string): string | null {
  const matched = sessionKey.match(/^agent:([^:]+):/)
  return matched?.[1] ?? null
}

/**
 * 构建 agent 显示名称映射。
 * @param agentList agent 列表。
 */
function buildAgentDisplayNameMap(agentList: Agent[]): Map<string, string> {
  const next = new Map<string, string>()
  for (const agent of agentList) {
    const displayName = agent.name?.trim() || agent.identity?.name?.trim() || agent.id
    if (!displayName) continue
    next.set(agent.id, displayName)
  }
  return next
}

/**
 * 解析消息展示用发送者名称。
 * @param message 聊天消息。
 * @param agentDisplayNameMap agent 显示名映射。
 * @param fallbackAssistantName 当前会话兜底助手名称。
 */
function resolveMessageSenderName(
  message: ChatMessage,
  agentDisplayNameMap: Map<string, string>,
  fallbackAssistantName: string | null,
): string {
  if (message.role === 'user') return USER_SENDER_NAME
  if (message.role === 'system') return SYSTEM_SENDER_NAME

  const speakerName = message.speakerName?.trim()
  if (speakerName) return speakerName

  const speakerAgentId = message.speakerAgentId?.trim()
  if (speakerAgentId) {
    return agentDisplayNameMap.get(speakerAgentId) ?? speakerAgentId
  }

  const sessionAgentId = parseAgentIdFromSessionKeyForDisplay(message.sessionKey)
  if (sessionAgentId) {
    return agentDisplayNameMap.get(sessionAgentId) ?? sessionAgentId
  }

  if (fallbackAssistantName) return fallbackAssistantName
  return DEFAULT_ASSISTANT_SENDER_NAME
}

/**
 * 列表去重并保留原始顺序。
 * @param items 原始字符串列表。
 */
function uniqueNonEmptyStrings(items: string[]): string[] {
  const next: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    next.push(normalized)
  }
  return next
}

/**
 * 读取对象 key 列表。
 * @param value 目标对象。
 */
function getRecordKeys(value: unknown): string[] {
  if (!isRecord(value)) return []
  return Object.keys(value)
}

/**
 * 读取当前 Agent 允许切换的模型列表。
 * @param config 当前配置对象。
 * @param agentId 当前聚焦的 Agent id。
 */
function resolveAllowedModelsFromAgentConfig(
  config: OpenClawConfig,
  agentId: string | null,
): string[] {
  const agentList = Array.isArray(config.agents?.list) ? config.agents.list : []
  const selectedAgent = agentId ? agentList.find(item => item.id === agentId) : null
  const agentModels = getRecordKeys(selectedAgent?.models)
  if (agentModels.length > 0) return uniqueNonEmptyStrings(agentModels)
  const defaultsModels = getRecordKeys(config.agents?.defaults?.models)
  return uniqueNonEmptyStrings(defaultsModels)
}

/**
 * 读取 models.providers 中配置的模型 id 列表。
 * @param config 当前配置对象。
 */
function resolveModelsFromProviders(config: OpenClawConfig): string[] {
  const providers = config.models?.providers
  if (!isRecord(providers)) return []
  const modelIds: string[] = []
  for (const [providerId, provider] of Object.entries(providers)) {
    if (!isRecord(provider)) continue
    const models = provider.models
    if (!Array.isArray(models)) continue
    for (const model of models) {
      if (!isRecord(model)) continue
      if (typeof model.id !== 'string') continue
      const normalizedProviderId = providerId.trim()
      const normalizedModelId = model.id.trim()
      if (!normalizedModelId) continue
      modelIds.push(
        normalizedProviderId && !normalizedModelId.startsWith(`${normalizedProviderId}/`)
          ? `${normalizedProviderId}/${normalizedModelId}`
          : normalizedModelId,
      )
    }
  }
  return uniqueNonEmptyStrings(modelIds)
}

/**
 * 生成多模型卡片唯一标识。
 */
function buildMultiModelPaneId(): string {
  return `pane-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 解析多模型卡片默认模型。
 * @param modelOptions 当前可选模型列表。
 * @param index 当前卡片下标。
 * @param fallbackModel 回退模型。
 */
function resolveMultiModelDefaultModel(
  modelOptions: string[],
  index: number,
  fallbackModel?: string,
): string {
  const mergedModels = uniqueNonEmptyStrings([
    fallbackModel ?? '',
    ...modelOptions,
  ])
  if (mergedModels.length === 0) return ''
  return mergedModels[index] ?? mergedModels[0] ?? ''
}

/**
 * 构建多模型弹窗草稿中的模型列表。
 * @param targetCount 目标对话数量。
 * @param existingModels 已选择模型列表。
 * @param modelOptions 当前可选模型列表。
 * @param fallbackModel 回退模型。
 */
function buildMultiModelDraftModels(
  targetCount: number,
  existingModels: string[],
  modelOptions: string[],
  fallbackModel?: string,
): string[] {
  const safeCount = Math.min(
    MULTI_MODEL_MODE_MAX_COUNT,
    Math.max(MULTI_MODEL_MODE_MIN_COUNT, targetCount),
  )

  return Array.from({ length: safeCount }, (_, index) => {
    const existingModel = existingModels[index]?.trim() ?? ''
    if (existingModel) return existingModel
    return resolveMultiModelDefaultModel(modelOptions, index, fallbackModel)
  })
}

/**
 * 解析会话 model 下拉候选项。
 * @param config 当前配置对象。
 * @param agentId 当前聚焦的 Agent id。
 * @param currentModel 当前生效的会话 model。
 */
function resolveSessionModelOptions(
  config: OpenClawConfig,
  agentId: string | null,
  currentModel?: string,
): string[] {
  const fromAgentAllowList = resolveAllowedModelsFromAgentConfig(config, agentId)
  const fromProviders = resolveModelsFromProviders(config)
  const options = fromAgentAllowList.length > 0 ? fromAgentAllowList : fromProviders
  const normalizedCurrentModel = currentModel?.trim() ?? ''
  if (!normalizedCurrentModel) return options
  return uniqueNonEmptyStrings([normalizedCurrentModel, ...options])
}

/**
 * 从 OpenClaw 配置中解析 Agent 的默认模型。
 * @param config 当前配置对象。
 * @param agentId 当前聚焦的 Agent id。
 */
function resolveAgentDefaultModel(config: OpenClawConfig, agentId: string | null): string {
  const agentList = Array.isArray(config.agents?.list) ? config.agents.list : []
  const selectedAgent = agentId ? agentList.find(item => item.id === agentId) : null
  if (selectedAgent?.model) {
    if (typeof selectedAgent.model === 'string') return selectedAgent.model
    if (typeof selectedAgent.model === 'object' && selectedAgent.model.primary) return selectedAgent.model.primary
  }
  const defaultModel = config.agents?.defaults?.model
  if (defaultModel?.primary) return defaultModel.primary
  return ''
}

/**
 * 解析会话 thinkingLevel 下拉候选项。
 * @param sessionThinkingLevel 当前会话 thinkingLevel。
 */
function resolveSessionThinkingLevelOptions(sessionThinkingLevel?: string): string[] {
  const currentThinkingLevel = sessionThinkingLevel?.trim() ?? ''
  if (!currentThinkingLevel) {
    return [...DEFAULT_THINKING_LEVEL_OPTIONS]
  }
  return uniqueNonEmptyStrings([currentThinkingLevel, ...DEFAULT_THINKING_LEVEL_OPTIONS])
}

/**
 * 从消息内容中提取内联的文件名列表。
 * @param content 原始文本。
 */
function extractInlineFileNames(content: string): string[] {
  FILE_NAME_EXTRACT_RE.lastIndex = 0
  const names: string[] = []
  let match: RegExpExecArray | null
  while ((match = FILE_NAME_EXTRACT_RE.exec(content)) !== null) {
    if (match[1]) names.push(match[1])
  }
  return names
}

/**
 * 判断媒体项是否有可渲染的图片地址。
 * @param item 媒体项。
 */
function hasRenderableMediaSrc(item: ChatMediaItem): boolean {
  if (item.omitted) return false
  const src = item.src.trim().toLowerCase()
  if (!src) return false
  return (
    src.startsWith('data:image/')
    || src.startsWith('http://')
    || src.startsWith('https://')
    || src.startsWith('blob:')
  )
}

/**
 * 判断媒体地址是否像本地文件路径。
 * @param src 原始地址。
 */
function isLikelyLocalMediaPath(src: string): boolean {
  const trimmed = src.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('file://')) return true
  if (trimmed.startsWith('/')) return true
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('~')) return true
  return /^[a-zA-Z]:[\\/]/.test(trimmed)
}

/**
 * 规范化外部链接，仅允许 http/https 协议。
 * @param rawHref 原始链接地址。
 */
function normalizeExternalHttpUrl(rawHref: string | undefined): string | null {
  const trimmed = rawHref?.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.toString()
  } catch {
    return null
  }
}

/**
 * 清理文件名片段，避免出现非法字符。
 * @param value 原始文本。
 * @param fallback 兜底名称。
 */
function sanitizeFileNameSegment(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim()
  if (!trimmed) return fallback

  const withoutControlChars = Array.from(trimmed, char => {
    const codePoint = char.codePointAt(0) ?? 0
    return codePoint < 32 ? '-' : char
  }).join('')

  const normalized = withoutControlChars
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return normalized.slice(0, 48) || fallback
}

/**
 * 生成两位数时间片段。
 * @param value 数值。
 */
function padExportDateSegment(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 将时间戳格式化为导出文件名中的时间片段。
 * @param timestamp 消息时间戳。
 */
function buildMessageExportTimestamp(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = padExportDateSegment(date.getMonth() + 1)
  const day = padExportDateSegment(date.getDate())
  const hour = padExportDateSegment(date.getHours())
  const minute = padExportDateSegment(date.getMinutes())
  const second = padExportDateSegment(date.getSeconds())
  return `${year}${month}${day}-${hour}${minute}${second}`
}

/**
 * 构建 assistant 消息导出的 Markdown 文件名。
 * @param message 当前消息。
 * @param senderName 发送者名称。
 */
function buildAssistantMessageExportFileName(message: ChatMessage, senderName: string): string {
  const senderSegment = sanitizeFileNameSegment(senderName, 'agent')
  const timestampSegment = buildMessageExportTimestamp(message.timestamp)
  return `${senderSegment}-reply-${timestampSegment}.md`
}

/**
 * 格式化导出用的绝对时间。
 * @param timestamp 时间戳。
 */
function formatExportDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = padExportDateSegment(date.getMonth() + 1)
  const day = padExportDateSegment(date.getDate())
  const hour = padExportDateSegment(date.getHours())
  const minute = padExportDateSegment(date.getMinutes())
  const second = padExportDateSegment(date.getSeconds())
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

/**
 * 构建整段会话导出的 Markdown 文件名。
 * @param sessionLabel 会话名称。
 * @param exportedAt 导出时间。
 */
function buildSessionExportFileName(sessionLabel: string, exportedAt: number): string {
  const sessionSegment = sanitizeFileNameSegment(sessionLabel, 'session')
  const timestampSegment = buildMessageExportTimestamp(exportedAt)
  return `${sessionSegment}-session-${timestampSegment}.md`
}

/**
 * 将 Markdown 文本转换为便于复制的纯文本。
 * @param content Markdown 原文。
 */
function stripMarkdownSyntax(content: string): string {
  const fencedBlocks: string[] = []
  let next = content.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => {
    const token = `__OPENCLAW_CODE_BLOCK_${fencedBlocks.length}__`
    fencedBlocks.push(code.trimEnd())
    return token
  })

  next = next
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, '')
    .replace(/^\s*([-*_]){3,}\s*$/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')

  next = fencedBlocks.reduce((result, block, index) => {
    const token = `__OPENCLAW_CODE_BLOCK_${index}__`
    return result.replace(token, block)
  }, next)

  return next.replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * 查找 assistant 消息对应的上一条用户消息。
 * @param list 当前会话消息列表。
 * @param targetMessageId 目标 assistant 消息 id。
 */
function findPreviousUserMessage(list: ChatMessage[], targetMessageId: string): ChatMessage | null {
  const targetIndex = list.findIndex(item => item.id === targetMessageId)
  if (targetIndex <= 0) return null

  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    if (list[index].role === 'user') return list[index]
  }

  return null
}

/**
 * 主界面。
 */
function App() {
  const { isEnglish, tr } = useI18n()
  const [input, setInput] = useState('')
  const [cursorPosition, setCursorPosition] = useState(0)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [showCreatePanel, setShowCreatePanel] = useState(false)
  const [activePanel, setActivePanel] = useState<ActivePanel>('none')
  const [showSubagentPanel, setShowSubagentPanel] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [newAgentWorkspace, setNewAgentWorkspace] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [renameSessionKey, setRenameSessionKey] = useState<string | null>(null)
  const [renameSessionName, setRenameSessionName] = useState('')
  const [renameSessionError, setRenameSessionError] = useState<string | null>(null)
  const [deleteSessionKey, setDeleteSessionKey] = useState<string | null>(null)
  const [deleteSessionLabel, setDeleteSessionLabel] = useState('')
  const [pendingImages, setPendingImages] = useState<ImageAttachment[]>([])
  const [isMultiModelMode, setIsMultiModelMode] = useState(false)
  const [multiModelCount, setMultiModelCount] = useState<number>(MULTI_MODEL_MODE_MIN_COUNT)
  const [multiModelPanes, setMultiModelPanes] = useState<MultiModelPaneState[]>([])
  const [showMultiModelConfirmModal, setShowMultiModelConfirmModal] = useState(false)
  const [showMultiModelExitModal, setShowMultiModelExitModal] = useState(false)
  const [multiModelExitKeepSessionKeys, setMultiModelExitKeepSessionKeys] = useState<string[]>([])
  const [isMultiModelExitProcessing, setIsMultiModelExitProcessing] = useState(false)
  const [multiModelDraftCount, setMultiModelDraftCount] = useState<number>(MULTI_MODEL_MODE_MIN_COUNT)
  const [multiModelDraftModels, setMultiModelDraftModels] = useState<string[]>(() => Array.from({ length: MULTI_MODEL_MODE_MIN_COUNT }, () => ''))
  const [singleModeSessionKeyBeforeMultiModel, setSingleModeSessionKeyBeforeMultiModel] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [localMediaDataUrlMap, setLocalMediaDataUrlMap] = useState<Record<string, string>>({})
  const [showToolCallDetails, setShowToolCallDetails] = useState<boolean>(() => loadToolCallVisibilitySetting())
  const [chatViewMode, setChatViewMode] = useState<ChatViewMode>(() => loadChatViewMode())
  const [chatFontSizePreset, setChatFontSizePreset] = useState<ChatFontSizePreset>(() => loadChatFontSizePreset())
  const [copyingMarkdownMessageId, setCopyingMarkdownMessageId] = useState<string | null>(null)
  const [copiedMarkdownMessageId, setCopiedMarkdownMessageId] = useState<string | null>(null)
  const [copyingPlainTextMessageId, setCopyingPlainTextMessageId] = useState<string | null>(null)
  const [copiedPlainTextMessageId, setCopiedPlainTextMessageId] = useState<string | null>(null)
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null)
  const [retriedMessageId, setRetriedMessageId] = useState<string | null>(null)
  const [exportingMessageId, setExportingMessageId] = useState<string | null>(null)
  const [exportedMessageId, setExportedMessageId] = useState<string | null>(null)
  const [isExportingSession, setIsExportingSession] = useState(false)
  const [isSessionExported, setIsSessionExported] = useState(false)
  const resolvingLocalMediaRef = useRef<Set<string>>(new Set())
  const copyMarkdownSuccessTimerRef = useRef<number | null>(null)
  const copyPlainTextSuccessTimerRef = useRef<number | null>(null)
  const retrySuccessTimerRef = useRef<number | null>(null)
  const exportSuccessTimerRef = useRef<number | null>(null)
  const sessionExportSuccessTimerRef = useRef<number | null>(null)

  const {
    servers,
    activeServerId,
    activeServer,
    activeWsUrl,
    isWebRemote,
    addServer,
    detectLocalOpenClawServer,
    updateServer,
    removeServer,
    setActiveServerId,
  } = useServerStore()
  const { themeId, setTheme } = useThemeStore()
  const tokenNumberFormatter = useMemo(
    () => new Intl.NumberFormat(isEnglish ? 'en-US' : 'zh-CN'),
    [isEnglish],
  )

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const modelSelectRef = useRef<HTMLSelectElement | null>(null)
  const modelInputRef = useRef<HTMLInputElement | null>(null)
  const thinkingSelectRef = useRef<HTMLSelectElement | null>(null)
  const renameInputRef = useRef<HTMLInputElement | null>(null)

  // 命令检测
  const commandDetection = useCommandDetection(input, cursorPosition)

  const {
    isConnected,
    isSending,
    error,
    agents,
    sessions,
    messages,
    focusedAgentId,
    focusedSessionKey,
    isTyping,
    isLoadingSessions,
    isLoadingHistory,
    focusAgent,
    focusSession,
    refreshAgents,
    refreshSessions,
    getSessionMessages,
    getSessionTyping,
    getSessionLoadingHistory,
    sendMessage,
    sendMessageToSession,
    createAgent,
    createDetachedSession,
    resetFocusedSession,
    deleteSession,
    patchSessionModel,
    patchFocusedSessionModel,
    patchFocusedSessionThinkingLevel,
    renameSession,
    abortSession,
    abortFocusedSession,
    pendingApprovals,
    respondApproval,
    shutdownNotification,
    updateNotification,
    dismissUpdateNotification,
    gatewayHealth,
    presenceList,
    refreshHealth,
    refreshPresence,
    tailLogs,
    searchMemory,
    listMemory,
    deleteMemory,
    listCronJobs,
    addCronJob,
    updateCronJob,
    removeCronJob,
    runCronJob,
    listCronRuns,
    onCronEvent,
    subagentTasks,
    abortSubagent,
    clearCompletedSubagents,
    resetDeviceIdentity,
    callRpc,
  } = useOpenClaw(activeWsUrl, {
    // 开关仅控制展示，工具调用数据始终尝试保留，避免关闭后被 history 覆盖丢失。
    keepToolCallsInHistory: true,
  })

  const configStore = useConfigStore({
    activeServerId,
    isConnected,
    callRpc,
  })

  const { notify } = useNotification()

  const webServer = useWebServer(activeWsUrl, activeServer?.name ?? '')

  const currentAgent = useMemo(
    () => agents.find(item => item.id === focusedAgentId) ?? null,
    [agents, focusedAgentId],
  )
  const agentDisplayNameMap = useMemo(
    () => buildAgentDisplayNameMap(agents),
    [agents],
  )
  const currentAgentDisplayName = currentAgent?.name?.trim()
    || currentAgent?.identity?.name?.trim()
    || currentAgent?.id
    || null

  const currentSession = useMemo(
    () => sessions.find(item => item.key === focusedSessionKey) ?? null,
    [sessions, focusedSessionKey],
  )
  const effectiveSessionModel = useMemo(
    () => currentSession?.model ?? resolveAgentDefaultModel(configStore.config, focusedAgentId),
    [currentSession?.model, configStore.config, focusedAgentId],
  )
  const sessionModelOptions = useMemo(
    () => resolveSessionModelOptions(configStore.config, focusedAgentId, effectiveSessionModel),
    [configStore.config, focusedAgentId, effectiveSessionModel],
  )
  const sessionThinkingLevelOptions = useMemo(
    () => resolveSessionThinkingLevelOptions(currentSession?.thinkingLevel),
    [currentSession?.thinkingLevel],
  )
  const sessionSettingTags = useMemo(
    () => resolveSessionSettingTags(currentSession, tr),
    [currentSession, tr],
  )
  const sessionTokenSummary = useMemo(
    () => resolveSessionTokenSummary(currentSession, tokenNumberFormatter, tr),
    [currentSession, tokenNumberFormatter, tr],
  )
  const sessionSummaryMap = useMemo(
    () => new Map(sessions.map((session) => [session.key, session] as const)),
    [sessions],
  )
  const multiModelPaneViews = useMemo(() => {
    return multiModelPanes.map((pane, index) => ({
      ...pane,
      title: tr('app.multi_model.conversation_title', { index: index + 1 }),
      session: sessionSummaryMap.get(pane.sessionKey) ?? {
        key: pane.sessionKey,
        agentId: focusedAgentId ?? '',
        displayName: pane.sessionKey.split(':').slice(2).join(':') || pane.sessionKey,
      },
      messages: getSessionMessages(pane.sessionKey),
      isTyping: getSessionTyping(pane.sessionKey),
      isLoadingHistory: getSessionLoadingHistory(pane.sessionKey),
    }))
  }, [focusedAgentId, getSessionLoadingHistory, getSessionMessages, getSessionTyping, multiModelPanes, sessionSummaryMap, tr])
  const canUseMultiModelMode = Boolean(focusedAgentId && focusedSessionKey)
  const hasTypingTarget = isMultiModelMode
    ? multiModelPaneViews.some((pane) => pane.isTyping)
    : isTyping
  const canSubmitMessage = Boolean(
    (input.trim() || pendingImages.length > 0)
    && isConnected
    && !isSending
    && !hasTypingTarget
    && (isMultiModelMode ? multiModelPaneViews.length > 0 : focusedSessionKey),
  )
  const exportableSessionMessages = useMemo(
    () => messages.filter(message => {
      const hasText = message.content.trim().length > 0
      const hasToolCalls = Boolean(message.toolCalls && message.toolCalls.length > 0)
      const hasAttachments = Boolean(message.attachments && message.attachments.length > 0)
      const hasMediaItems = Boolean(message.mediaItems && message.mediaItems.length > 0)
      if (message.role === 'assistant' && !hasText && !hasToolCalls && !hasAttachments && !hasMediaItems) return false
      return hasText || hasToolCalls || hasAttachments || hasMediaItems
    }),
    [messages],
  )
  const latestAssistantMessageId = useMemo(
    () => [...messages].reverse().find(message => message.role === 'assistant')?.id ?? null,
    [messages],
  )
  const approvalList = useMemo(
    () => [...pendingApprovals].sort((a, b) => b.receivedAt - a.receivedAt),
    [pendingApprovals],
  )
  const runningSubagentCount = useMemo(
    () => subagentTasks.filter(item => item.status === 'running').length,
    [subagentTasks],
  )
  const supportsLogsTail = useMemo(() => {
    const methods = gatewayHealth?.features?.methods
    if (!methods || methods.length === 0) return true
    return methods.includes('logs.tail')
  }, [gatewayHealth])

  /**
   * 同步工具调用展示开关到 localStorage。
   */
  useEffect(() => {
    saveToolCallVisibilitySetting(showToolCallDetails)
  }, [showToolCallDetails])

  /**
   * 同步对话模式到 localStorage。
   */
  useEffect(() => {
    saveChatViewMode(chatViewMode)
  }, [chatViewMode])

  /**
   * 同步聊天字体大小到 localStorage。
   */
  useEffect(() => {
    saveChatFontSizePreset(chatFontSizePreset)
  }, [chatFontSizePreset])

  const chatTypographyStyle = useMemo<CSSProperties>(() => {
    const preset = CHAT_FONT_SIZE_PRESETS[chatFontSizePreset]
    return {
      '--wb-chat-font-size': `${preset.body}px`,
      '--wb-chat-line-height': String(preset.bodyLineHeight),
      '--wb-chat-meta-font-size': `${preset.meta}px`,
      '--wb-chat-code-font-size': `${preset.code}px`,
      '--wb-chat-code-line-height': String(preset.codeLineHeight),
      '--wb-chat-input-font-size': `${preset.input}px`,
      '--wb-chat-input-line-height': String(preset.inputLineHeight),
    } as CSSProperties
  }, [chatFontSizePreset])

  /**
   * 打开重命名弹窗时自动聚焦输入框。
   */
  useEffect(() => {
    if (!renameSessionKey) return
    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [renameSessionKey])

  /**
   * 在 Tauri 环境尝试把网关本地图片路径转换为 data URL（同机场景兜底）。
   */
  useEffect(() => {
    if (!IS_TAURI) return

    const pendingPaths = new Set<string>()
    for (const msg of messages) {
      const mediaItems = msg.mediaItems ?? []
      for (const item of mediaItems) {
        const src = item.src.trim()
        if (!src) continue
        if (src.startsWith('data:image/') || src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
          continue
        }
        if (!isLikelyLocalMediaPath(src)) continue
        if (localMediaDataUrlMap[src]) continue
        if (resolvingLocalMediaRef.current.has(src)) continue
        pendingPaths.add(src)
      }
    }

    if (pendingPaths.size === 0) return

    let disposed = false
    const run = async () => {
      for (const src of pendingPaths) {
        if (disposed) break
        resolvingLocalMediaRef.current.add(src)
        try {
          const resolved = await safeInvoke<string>('resolve_media_path_to_data_url', { path: src })
          const dataUrl = typeof resolved === 'string' ? resolved.trim() : ''
          if (!dataUrl.startsWith('data:image/')) continue
          if (disposed) break
          setLocalMediaDataUrlMap((prev) => {
            if (prev[src] === dataUrl) return prev
            return {
              ...prev,
              [src]: dataUrl,
            }
          })
        } catch {
          // 本地路径不可读时保持静默，继续使用占位提示。
        } finally {
          resolvingLocalMediaRef.current.delete(src)
        }
      }
    }

    void run()
    return () => {
      disposed = true
    }
  }, [messages, localMediaDataUrlMap])

  /**
   * 在移动端关闭侧边栏抽屉。
   */
  const closeSidebarDrawer = () => {
    setSidebarOpen(false)
  }

  /**
   * 关闭当前互斥面板。
   */
  const closeActivePanel = useCallback(() => {
    setActivePanel('none')
  }, [])

  /**
   * 切换当前互斥面板。
   * @param panel 目标面板。
   */
  const handleTogglePanel = useCallback((panel: ToggleablePanel) => {
    setActivePanel(prev => toggleActivePanel(prev, panel))
  }, [])

  /**
   * 聚焦 Agent 并在移动端收起侧边栏。
   * @param agentId Agent id。
   */
  const handleFocusAgent = (agentId: string) => {
    focusAgent(agentId)
    closeSidebarDrawer()
  }

  /**
   * 聚焦会话，关闭右侧面板，并在移动端收起侧边栏。
   * @param sessionKey 会话 key。
   */
  const handleFocusSession = (sessionKey: string) => {
    setActivePanel(prev => (isMainContentPanel(prev) ? 'none' : prev))
    focusSession(sessionKey)
    closeSidebarDrawer()
  }

  /**
   * 统一执行异步动作，并捕获错误提示。
   * @param runner 动作函数。
   */
  const runAction = useCallback(async (runner: () => Promise<void>) => {
    setActionError(null)
    try {
      await runner()
    } catch (runnerError) {
      const nextError = runnerError instanceof Error ? runnerError.message : String(runnerError)
      setActionError(nextError)
    }
  }, [])

  /**
   * 构建多模型卡片列表。
   * @param targetCount 目标卡片数量。
   * @param reuseExisting 是否复用现有卡片。
   */
  const buildMultiModelPanes = useCallback((
    targetCount: number,
    reuseExisting: boolean,
    anchorSessionKey?: string | null,
    preferredModels?: string[],
  ): MultiModelPaneState[] => {
    if (!focusedAgentId) return []

    const safeCount = Math.min(
      MULTI_MODEL_MODE_MAX_COUNT,
      Math.max(MULTI_MODEL_MODE_MIN_COUNT, targetCount),
    )
    const previousPanes = reuseExisting
      ? (() => {
        const anchorIndex = multiModelPanes.findIndex((pane) => pane.sessionKey === focusedSessionKey)
        if (anchorIndex <= 0) return multiModelPanes
        const anchorPane = multiModelPanes[anchorIndex]
        const remainingPanes = multiModelPanes.filter((_, index) => index !== anchorIndex)
        return [anchorPane, ...remainingPanes]
      })()
      : []

    return Array.from({ length: safeCount }, (_, index) => {
      const previousPane = previousPanes[index]
      const shouldUseAnchorSession = Boolean(anchorSessionKey) && index === 0 && !reuseExisting
      const preferredModel = Array.isArray(preferredModels) ? (preferredModels[index] ?? undefined) : undefined
      const sessionKey = shouldUseAnchorSession
        ? (anchorSessionKey as string)
        : (previousPane?.sessionKey ?? createDetachedSession(focusedAgentId))

      return {
        id: previousPane?.id ?? buildMultiModelPaneId(),
        sessionKey,
        model: previousPane?.model ?? preferredModel ?? resolveMultiModelDefaultModel(
          sessionModelOptions,
          index,
          shouldUseAnchorSession ? currentSession?.model : undefined,
        ),
      }
    })
  }, [createDetachedSession, currentSession?.model, focusedAgentId, focusedSessionKey, multiModelPanes, sessionModelOptions])

  /**
   * 批量应用多模型卡片的模型设置。
   * @param panes 目标卡片列表。
   */
  const applyMultiModelPaneModels = useCallback(async (panes: MultiModelPaneState[]) => {
    const results = await Promise.allSettled(panes.map(async (pane) => {
      await patchSessionModel(pane.sessionKey, pane.model || null)
    }))

    const failedCount = results.filter((item) => item.status === 'rejected').length
    if (failedCount > 0) {
      throw new Error(`多模型模式初始化失败，共 ${failedCount} 个对话未完成模型设置`)
    }
  }, [patchSessionModel])

  /**
   * 修改多模型弹窗中的对话数量。
   * @param nextCount 目标数量。
   */
  const handleChangeMultiModelDraftCount = (nextCount: number) => {
    const safeCount = Math.min(
      MULTI_MODEL_MODE_MAX_COUNT,
      Math.max(MULTI_MODEL_MODE_MIN_COUNT, nextCount),
    )
    setMultiModelDraftCount(safeCount)
    setMultiModelDraftModels((prev) => buildMultiModelDraftModels(
      safeCount,
      prev,
      sessionModelOptions,
      currentSession?.model,
    ))
  }

  /**
   * 修改多模型弹窗中的单路模型。
   * @param index 对话下标。
   * @param model 目标模型。
   */
  const handleChangeMultiModelDraftModel = (index: number, model: string) => {
    setMultiModelDraftModels((prev) => {
      const next = buildMultiModelDraftModels(
        multiModelDraftCount,
        prev,
        sessionModelOptions,
        currentSession?.model,
      )
      next[index] = model
      return next
    })
  }

  /**
   * 打开多模型模式确认弹窗。
   */
  const openMultiModelConfirmModal = () => {
    if (!canUseMultiModelMode) return
    setMultiModelDraftCount(multiModelCount)
    setMultiModelDraftModels(buildMultiModelDraftModels(
      multiModelCount,
      multiModelDraftModels,
      sessionModelOptions,
      currentSession?.model,
    ))
    setShowMultiModelConfirmModal(true)
  }

  /**
   * 关闭多模型模式确认弹窗。
   */
  const closeMultiModelConfirmModal = () => {
    setShowMultiModelConfirmModal(false)
  }

  /**
   * 点击多模型确认弹窗遮罩层关闭弹窗。
   * 仅当按下发生在遮罩层本身时触发，避免拖拽选择文本时误关闭。
   * @param event 指针事件。
   */
  const handleMultiModelConfirmBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    closeMultiModelConfirmModal()
  }

  /**
   * 确认开启多模型模式。
   */
  const confirmEnableMultiModelMode = () => {
    if (!focusedSessionKey) return

    const nextCount = Math.min(
      MULTI_MODEL_MODE_MAX_COUNT,
      Math.max(MULTI_MODEL_MODE_MIN_COUNT, multiModelDraftCount),
    )
    const nextModels = buildMultiModelDraftModels(
      nextCount,
      multiModelDraftModels,
      sessionModelOptions,
      currentSession?.model,
    )

    setSingleModeSessionKeyBeforeMultiModel(focusedSessionKey)
    setMultiModelCount(nextCount)
    const nextPanes = buildMultiModelPanes(nextCount, false, null, nextModels)
    setMultiModelPanes(nextPanes)
    setIsMultiModelMode(true)
    closeMultiModelConfirmModal()

    const nextFocusedSessionKey = nextPanes[0]?.sessionKey
    if (nextFocusedSessionKey) {
      focusSession(nextFocusedSessionKey)
    }

    void runAction(async () => {
      await applyMultiModelPaneModels(nextPanes)
    })
  }

  /**
   * 退出多模型模式（仅恢复 UI 状态，不包含删除会话逻辑）。
   */
  const exitMultiModelMode = () => {
    setShowMultiModelConfirmModal(false)
    setIsMultiModelMode(false)
    setMultiModelPanes([])
    const previousSessionKey = singleModeSessionKeyBeforeMultiModel
    setSingleModeSessionKeyBeforeMultiModel(null)
    if (previousSessionKey) {
      focusSession(previousSessionKey)
    }
  }

  /**
   * 打开退出多模型模式确认弹窗，并默认勾选“保留全部会话”。
   */
  const openMultiModelExitModal = () => {
    const seen = new Set<string>()
    const nextKeys: string[] = []
    for (const pane of multiModelPanes) {
      if (seen.has(pane.sessionKey)) continue
      seen.add(pane.sessionKey)
      nextKeys.push(pane.sessionKey)
    }
    setMultiModelExitKeepSessionKeys(nextKeys)
    setShowMultiModelExitModal(true)
  }

  /**
   * 关闭退出多模型模式确认弹窗。
   */
  const closeMultiModelExitModal = () => {
    setShowMultiModelExitModal(false)
  }

  /**
   * 点击退出多模型确认弹窗遮罩层关闭弹窗。
   * 仅当按下发生在遮罩层本身时触发，避免拖拽选择文本时误关闭。
   * @param event 指针事件。
   */
  const handleMultiModelExitBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (isMultiModelExitProcessing) return
    closeMultiModelExitModal()
  }

  /**
   * 切换退出多模型弹窗中的“保留会话”勾选状态。
   * @param sessionKey 会话 key。
   */
  const handleToggleMultiModelExitKeepSession = (sessionKey: string) => {
    setMultiModelExitKeepSessionKeys((prev) => {
      if (prev.includes(sessionKey)) {
        return prev.filter(item => item !== sessionKey)
      }
      return [...prev, sessionKey]
    })
  }

  /**
   * 退出多模型模式，并删除未勾选保留的会话。
   */
  const confirmExitMultiModelMode = () => {
    const keepKeys = new Set(multiModelExitKeepSessionKeys)
    const deleteKeys = Array.from(new Set(multiModelPanes
      .map(pane => pane.sessionKey)
      .filter(sessionKey => !keepKeys.has(sessionKey) && sessionKey !== singleModeSessionKeyBeforeMultiModel)))

    void runAction(async () => {
      setIsMultiModelExitProcessing(true)
      try {
        const results = await Promise.allSettled(deleteKeys.map(async (sessionKey) => {
          await deleteSession(sessionKey)
        }))
        const failed = results
          .map((result, index) => ({ result, sessionKey: deleteKeys[index] }))
          .filter((item): item is { result: PromiseRejectedResult; sessionKey: string } => item.result.status === 'rejected')

        if (failed.length > 0) {
          const message = failed[0].result.reason instanceof Error
            ? failed[0].result.reason.message
            : String(failed[0].result.reason)
          throw new Error(tr('app.multi_model.exit_dialog_delete_failed', { count: failed.length, message }))
        }

        closeMultiModelExitModal()
        exitMultiModelMode()
      } finally {
        setIsMultiModelExitProcessing(false)
      }
    })
  }

  /**
   * 切换多模型模式。
   */
  const handleToggleMultiModelMode = () => {
    if (isMultiModelMode) {
      if (multiModelPanes.length === 0) {
        exitMultiModelMode()
        return
      }
      setShowMultiModelConfirmModal(false)
      openMultiModelExitModal()
      return
    }

    openMultiModelConfirmModal()
  }

  /**
   * 修改多模型卡片模型。
   * @param paneId 卡片 id。
   * @param sessionKey 目标会话 key。
   * @param model 目标模型。
   */
  const handleChangeMultiModelPaneModel = (paneId: string, sessionKey: string, model: string) => {
    setMultiModelPanes((prev) => prev.map((pane) => {
      if (pane.id !== paneId) return pane
      return {
        ...pane,
        model,
      }
    }))

    void runAction(async () => {
      await patchSessionModel(sessionKey, model || null)
    })
  }

  /**
   * 同步多模型卡片与当前聚焦会话。
   */
  useEffect(() => {
    if (!isMultiModelMode || !focusedSessionKey) return
    if (isMultiModelExitProcessing) return

    const firstPaneSessionKey = multiModelPanes[0]?.sessionKey ?? null
    const containsFocusedPane = multiModelPanes.some((pane) => pane.sessionKey === focusedSessionKey)
    if (!containsFocusedPane) return
    if (firstPaneSessionKey === focusedSessionKey && multiModelPanes.length === multiModelCount) return

    const shouldReuseExisting = true
    const nextPanes = buildMultiModelPanes(multiModelCount, shouldReuseExisting)
    setMultiModelPanes(nextPanes)
    void runAction(async () => {
      await applyMultiModelPaneModels(nextPanes)
    })
  }, [applyMultiModelPaneModels, buildMultiModelPanes, focusedSessionKey, isMultiModelExitProcessing, isMultiModelMode, multiModelCount, multiModelPanes, runAction])

  /**
   * 将 Markdown 链接交给系统默认浏览器打开，避免当前窗口被跳转。
   * @param href Markdown 链接地址。
   */
  const openMarkdownLinkInExternalBrowser = async (href?: string) => {
    const normalizedUrl = normalizeExternalHttpUrl(href)
    if (!normalizedUrl) {
      throw new Error('仅支持打开 http/https 链接')
    }

    if (IS_TAURI) {
      const opened = await safeInvoke<boolean>('open_external_url', { url: normalizedUrl })
      if (opened !== true) {
        throw new Error('外部浏览器打开失败，请稍后重试')
      }
      return
    }

    window.open(normalizedUrl, '_blank', 'noopener,noreferrer')
  }

  /**
   * 处理 Markdown 链接点击事件，拦截应用内跳转。
   * @param event 点击事件。
   * @param href Markdown 链接地址。
   */
  const handleMarkdownLinkClick = (event: MouseEvent<HTMLAnchorElement>, href?: string) => {
    event.preventDefault()
    void runAction(async () => {
      await openMarkdownLinkInExternalBrowser(href)
    })
  }

  /**
   * 使用浏览器下载方式导出 Markdown。
   * @param content Markdown 文本内容。
   * @param fileName 导出文件名。
   */
  const downloadMarkdownByBrowser = (content: string, fileName: string) => {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = fileName
    anchor.click()
    URL.revokeObjectURL(href)
  }

  /**
   * 标记某条消息已完成导出，用于短暂展示成功状态。
   * @param messageId 消息 id。
   */
  const markMessageExported = (messageId: string) => {
    if (exportSuccessTimerRef.current !== null) {
      window.clearTimeout(exportSuccessTimerRef.current)
    }
    setExportedMessageId(messageId)
    exportSuccessTimerRef.current = window.setTimeout(() => {
      setExportedMessageId(current => (current === messageId ? null : current))
      exportSuccessTimerRef.current = null
    }, MESSAGE_EXPORT_SUCCESS_RESET_MS)
  }

  /**
   * 标记整段会话已完成导出，用于短暂展示成功状态。
   */
  const markSessionExported = () => {
    if (sessionExportSuccessTimerRef.current !== null) {
      window.clearTimeout(sessionExportSuccessTimerRef.current)
    }
    setIsSessionExported(true)
    sessionExportSuccessTimerRef.current = window.setTimeout(() => {
      setIsSessionExported(false)
      sessionExportSuccessTimerRef.current = null
    }, MESSAGE_EXPORT_SUCCESS_RESET_MS)
  }

  /**
   * 复制文本到剪贴板。
   * @param content 需要复制的文本内容。
   */
  const copyTextToClipboard = async (content: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content)
      return
    }

    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }

  /**
   * 标记某条消息已复制 Markdown。
   * @param messageId 消息 id。
   */
  const markMessageMarkdownCopied = (messageId: string) => {
    if (copyMarkdownSuccessTimerRef.current !== null) {
      window.clearTimeout(copyMarkdownSuccessTimerRef.current)
    }
    setCopiedMarkdownMessageId(messageId)
    copyMarkdownSuccessTimerRef.current = window.setTimeout(() => {
      setCopiedMarkdownMessageId(current => (current === messageId ? null : current))
      copyMarkdownSuccessTimerRef.current = null
    }, MESSAGE_ACTION_SUCCESS_RESET_MS)
  }

  /**
   * 标记某条消息已复制纯文本。
   * @param messageId 消息 id。
   */
  const markMessagePlainTextCopied = (messageId: string) => {
    if (copyPlainTextSuccessTimerRef.current !== null) {
      window.clearTimeout(copyPlainTextSuccessTimerRef.current)
    }
    setCopiedPlainTextMessageId(messageId)
    copyPlainTextSuccessTimerRef.current = window.setTimeout(() => {
      setCopiedPlainTextMessageId(current => (current === messageId ? null : current))
      copyPlainTextSuccessTimerRef.current = null
    }, MESSAGE_ACTION_SUCCESS_RESET_MS)
  }

  /**
   * 标记某条消息已完成重试发送。
   * @param messageId 消息 id。
   */
  const markMessageRetried = (messageId: string) => {
    if (retrySuccessTimerRef.current !== null) {
      window.clearTimeout(retrySuccessTimerRef.current)
    }
    setRetriedMessageId(messageId)
    retrySuccessTimerRef.current = window.setTimeout(() => {
      setRetriedMessageId(current => (current === messageId ? null : current))
      retrySuccessTimerRef.current = null
    }, MESSAGE_ACTION_SUCCESS_RESET_MS)
  }

  /**
   * 复制 assistant 消息的 Markdown 原文。
   * @param message 当前 assistant 消息。
   */
  const handleCopyAssistantMarkdown = async (message: ChatMessage) => {
    const normalizedContent = message.content.replace(/\r\n/g, '\n').trimEnd()
    if (!normalizedContent || copyingMarkdownMessageId === message.id) return

    setActionError(null)
    setCopyingMarkdownMessageId(message.id)
    try {
      await copyTextToClipboard(normalizedContent)
      markMessageMarkdownCopied(message.id)
    } catch (copyError) {
      const errorText = copyError instanceof Error ? copyError.message : String(copyError)
      setActionError(errorText || '复制 Markdown 失败')
    } finally {
      setCopyingMarkdownMessageId(current => (current === message.id ? null : current))
    }
  }

  /**
   * 复制 assistant 消息的纯文本内容。
   * @param message 当前 assistant 消息。
   */
  const handleCopyAssistantPlainText = async (message: ChatMessage) => {
    const normalizedContent = stripMarkdownSyntax(message.content.replace(/\r\n/g, '\n'))
    if (!normalizedContent || copyingPlainTextMessageId === message.id) return

    setActionError(null)
    setCopyingPlainTextMessageId(message.id)
    try {
      await copyTextToClipboard(normalizedContent)
      markMessagePlainTextCopied(message.id)
    } catch (copyError) {
      const errorText = copyError instanceof Error ? copyError.message : String(copyError)
      setActionError(errorText || '复制纯文本失败')
    } finally {
      setCopyingPlainTextMessageId(current => (current === message.id ? null : current))
    }
  }

  /**
   * 将 assistant 消息导出为 Markdown 文件。
   * @param message 当前 assistant 消息。
   * @param senderName 发送者名称。
   */
  const exportAssistantMessageAsMarkdown = async (message: ChatMessage, senderName: string) => {
    const normalizedContent = message.content.replace(/\r\n/g, '\n').trimEnd()
    if (!normalizedContent) return false

    const fileName = buildAssistantMessageExportFileName(message, senderName)
    const fileContent = `${normalizedContent}\n`

    if (IS_TAURI) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const selectedPath = await save({
        defaultPath: fileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (typeof selectedPath !== 'string' || !selectedPath.trim()) return false

      const saved = await safeInvoke<boolean>('save_text_file', {
        path: selectedPath,
        content: fileContent,
      })
      if (saved !== true) {
        throw new Error('导出 Markdown 失败，请稍后重试')
      }
      return true
    }

    downloadMarkdownByBrowser(fileContent, fileName)
    return true
  }

  /**
   * 构建整段会话的 Markdown 内容。
   * @param exportedAt 导出时间。
   */
  const buildSessionExportMarkdown = (exportedAt: number): string => {
    const sessionLabel = currentSession?.displayName?.trim()
      || currentAgentDisplayName
      || focusedSessionKey
      || tr('app.conversation')

    const lines: string[] = [
      `# ${sessionLabel}`,
      '',
      `- Agent：${currentAgentDisplayName ?? DEFAULT_ASSISTANT_SENDER_NAME}`,
      `- ${tr('app.export.session')}：${focusedSessionKey ?? tr('app.session.unselected')}`,
      `- ${tr('app.export.time')}：${formatExportDateTime(exportedAt)}`,
    ]

    if (sessionSettingTags.length > 0) {
      lines.push(`- ${tr('app.export.settings')}：${sessionSettingTags.join(' / ')}`)
    }
    if (sessionTokenSummary) {
      lines.push(`- ${sessionTokenSummary}`)
    }

    lines.push('', '---', '')

    for (const message of exportableSessionMessages) {
      const senderName = resolveMessageSenderName(message, agentDisplayNameMap, currentAgentDisplayName)
      const messageModel = resolveMessageModel(message.role, message.model, currentSession?.model)
      const statusLabel = resolveAssistantStatusLabel(message, tr)
      const attachmentNames = (message.attachments ?? []).map(item => item.filename ?? item.fileName ?? tr('common.file'))
      const inlineFileNames = message.role === 'user' && attachmentNames.length === 0
        ? extractInlineFileNames(message.content)
        : []
      const visibleFileNames = [...attachmentNames, ...inlineFileNames]
      const visibleMediaCount = message.mediaItems?.length ?? 0
      const metaParts = [
        tr('app.export.role', { role: message.role }),
        tr('app.export.timestamp', { time: formatExportDateTime(message.timestamp) }),
        messageModel ? tr('app.export.model', { model: messageModel }) : null,
        statusLabel ? tr('app.export.status', { status: statusLabel }) : null,
      ].filter((item): item is string => Boolean(item))

      lines.push(`## ${senderName}`)
      lines.push('')
      lines.push(`> ${metaParts.join(' · ')}`)

      if (visibleFileNames.length > 0) {
        lines.push(`> ${tr('app.export.attachments', { names: visibleFileNames.join('，') })}`)
      }
      if (visibleMediaCount > 0) {
        lines.push(`> ${tr('app.export.images', { count: visibleMediaCount })}`)
      }

      if (message.toolCalls && message.toolCalls.length > 0) {
        lines.push('', `### ${tr('app.export.tool_calls')}`, '')
        for (const call of message.toolCalls) {
          const toolMeta = [
            tr('app.export.tool_phase', { phase: call.phase }),
            call.startedAt ? tr('app.export.tool_started', { time: formatExportDateTime(call.startedAt) }) : null,
            call.endedAt ? tr('app.export.tool_ended', { time: formatExportDateTime(call.endedAt) }) : null,
          ].filter((item): item is string => Boolean(item))

          lines.push(`- \`${call.name}\``)
          if (toolMeta.length > 0) {
            lines.push(`  - ${toolMeta.join(' · ')}`)
          }
          if (call.error) {
            lines.push(`  - 错误：${call.error}`)
          }
        }
      }

      const normalizedContent = message.role === 'user'
        ? sanitizeUserDisplayContent(message.content).replace(/\r\n/g, '\n').trimEnd()
        : message.content.replace(/\r\n/g, '\n').trimEnd()

      if (normalizedContent) {
        lines.push('')
        if (message.role === 'assistant') {
          lines.push(normalizedContent)
        } else {
          lines.push('```text')
          lines.push(normalizedContent)
          lines.push('```')
        }
      }

      lines.push('', '---', '')
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
  }

  /**
   * 将整段会话导出为 Markdown 文件。
   */
  const exportSessionAsMarkdown = async () => {
    if (!focusedSessionKey || exportableSessionMessages.length === 0) return false

    const exportedAt = Date.now()
    const sessionLabel = currentSession?.displayName?.trim()
      || currentAgentDisplayName
      || focusedSessionKey
      || '会话'
    const fileName = buildSessionExportFileName(sessionLabel, exportedAt)
    const fileContent = buildSessionExportMarkdown(exportedAt)

    if (IS_TAURI) {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const selectedPath = await save({
        defaultPath: fileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (typeof selectedPath !== 'string' || !selectedPath.trim()) return false

      const saved = await safeInvoke<boolean>('save_text_file', {
        path: selectedPath,
        content: fileContent,
      })
      if (saved !== true) {
        throw new Error('导出整段会话失败，请稍后重试')
      }
      return true
    }

    downloadMarkdownByBrowser(fileContent, fileName)
    return true
  }

  /**
   * 处理 assistant 消息导出操作。
   * @param message 当前 assistant 消息。
   * @param senderName 发送者名称。
   */
  const handleExportAssistantMessage = async (message: ChatMessage, senderName: string) => {
    if (exportingMessageId === message.id) return

    setActionError(null)
    setExportingMessageId(message.id)
    try {
      const saved = await exportAssistantMessageAsMarkdown(message, senderName)
      if (saved) {
        markMessageExported(message.id)
      }
    } catch (exportError) {
      const errorText = exportError instanceof Error ? exportError.message : String(exportError)
      setActionError(errorText || '导出 Markdown 失败')
    } finally {
      setExportingMessageId(current => (current === message.id ? null : current))
    }
  }

  /**
   * 重新发送 assistant 消息对应的上一条用户消息。
   * 仅用于最新一条失败/中止的 assistant 回复。
   * @param message 当前 assistant 消息。
   */
  const handleRetryAssistantMessage = async (message: ChatMessage) => {
    if (retryingMessageId === message.id) return

    const previousUserMessage = findPreviousUserMessage(messages, message.id)
    if (!previousUserMessage) return

    const retryText = sanitizeUserRetryContent(previousUserMessage.content)
    const retryAttachments = previousUserMessage.attachments && previousUserMessage.attachments.length > 0
      ? [...previousUserMessage.attachments]
      : undefined

    if (!retryText && !retryAttachments) return

    let wireMessage: string | undefined
    let wireAttachments = retryAttachments
    if (retryAttachments && retryAttachments.length > 0) {
      const inlined = inlineTextAttachments(retryText, retryAttachments)
      wireMessage = inlined.message
      wireAttachments = inlined.imageAttachments.length > 0 ? inlined.imageAttachments : undefined
    }

    setActionError(null)
    setRetryingMessageId(message.id)
    try {
      await sendMessage(retryText, retryAttachments, wireMessage, wireAttachments)
      markMessageRetried(message.id)
    } catch (retryError) {
      const errorText = retryError instanceof Error ? retryError.message : String(retryError)
      setActionError(errorText || '重试发送失败')
    } finally {
      setRetryingMessageId(current => (current === message.id ? null : current))
    }
  }

  /**
   * 处理整段会话导出操作。
   */
  const handleExportSession = async () => {
    if (isExportingSession || !focusedSessionKey) return

    setActionError(null)
    setIsExportingSession(true)
    try {
      const saved = await exportSessionAsMarkdown()
      if (saved) {
        markSessionExported()
      }
    } catch (exportError) {
      const errorText = exportError instanceof Error ? exportError.message : String(exportError)
      setActionError(errorText || '导出整段会话失败')
    } finally {
      setIsExportingSession(false)
    }
  }

  /**
   * 发送消息。
   */
  const handleSend = () => {
    if (hasTypingTarget) return
    if (!input.trim() && pendingImages.length === 0) return
    const allAttachments = pendingImages.length > 0 ? [...pendingImages] : undefined

    // 文本文件内联到发送消息，图片仍走 attachments
    let wireMessage: string | undefined
    let wireAttachments = allAttachments
    if (allAttachments && allAttachments.length > 0) {
      const { message, imageAttachments } = inlineTextAttachments(input, allAttachments)
      wireMessage = message
      wireAttachments = imageAttachments.length > 0 ? imageAttachments : undefined
    }

    void runAction(async () => {
      // 显示用原始 input + 全部 attachments，发送用 wireMessage + 仅图片 attachments
      if (isMultiModelMode && multiModelPanes.length > 0) {
        const broadcastTargets = [...multiModelPanes]
        const results = await Promise.allSettled(broadcastTargets.map(async (pane) => {
          await patchSessionModel(pane.sessionKey, pane.model || null)
          await sendMessageToSession(pane.sessionKey, input, allAttachments, wireMessage, wireAttachments)
        }))

        const failedCount = results.filter((item) => item.status === 'rejected').length
        if (failedCount > 0) {
          throw new Error(`已发送到部分对话，但有 ${failedCount} 个对话未成功完成`) 
        }
      } else {
        await sendMessage(input, allAttachments, wireMessage, wireAttachments)
      }

      setInput('')
      setCursorPosition(0)
      setSelectedCommandIndex(0)
      setPendingImages([])
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }
    })
  }

  /**
   * 处理命令选择。
   * @param command 选中的命令。
   */
  const handleSelectCommand = (command: SlashCommand) => {
    if (!textareaRef.current) return

    // 如果当前输入精确命中别名，优先保留别名写法。
    const normalizedQuery = commandDetection.query.trim().toLowerCase()
    const matchedAlias = normalizedQuery
      ? command.aliases?.find(alias => alias.toLowerCase() === normalizedQuery)
      : undefined

    const { newValue, newCursorPos } = insertCommand(
      command,
      input,
      commandDetection.slashPosition,
      cursorPosition,
      matchedAlias ?? command.name,
    )

    setInput(newValue)
    setSelectedCommandIndex(0)

    // 延迟设置光标位置，确保 DOM 更新完成
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos)
        setCursorPosition(newCursorPos)
      }
    }, 0)
  }

  /**
   * 关闭命令面板。
   */
  const handleCloseCommandPalette = () => {
    setSelectedCommandIndex(0)
    textareaRef.current?.focus()
  }

  /**
   * 处理输入框按键事件。
   * @param e 键盘事件。
   */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // 如果命令面板显示，拦截导航键、Tab 补全、Enter 选择
    if (commandDetection.shouldShow) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex(i => Math.min(i + 1, commandDetection.filteredCommands.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault()
        const selectedCommand = commandDetection.filteredCommands[selectedCommandIndex]
        if (selectedCommand) {
          handleSelectCommand(selectedCommand)
        }
        return
      }
    }

    // 正常发送消息
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /**
   * 处理输入框高度自适应。
   * @param value 输入文本。
   */
  const handleInput = (value: string) => {
    setInput(value)
    if (!textareaRef.current) return

    // 更新光标位置
    setCursorPosition(textareaRef.current.selectionStart)

    textareaRef.current.style.height = 'auto'
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`
  }

  /**
   * 处理光标位置变化。
   */
  const handleSelectionChange = () => {
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart)
    }
  }

  /**
   * 添加图片到待发送列表。
   * @param files 图片文件数组。
   */
  const addImageFiles = async (files: File[]) => {
    try {
      const attachments = await Promise.all(files.map(fileToImageAttachment))
      setPendingImages(prev => [...prev, ...attachments])
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '图片处理失败')
    }
  }

  /**
   * 处理粘贴事件（Ctrl+V 粘贴图片）。
   * @param e 剪贴板事件。
   */
  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (!e.clipboardData) return
    const files = getFilesFromClipboard(e.clipboardData)
    if (files.length > 0) {
      e.preventDefault()
      void addImageFiles(files)
    }
  }

  /**
   * 处理拖拽悬停。
   * @param e 拖拽事件。
   */
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  /**
   * 处理拖拽离开。
   */
  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  /**
   * 处理拖拽放下。
   * @param e 拖拽事件。
   */
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const imageFiles = getImagesFromDrop(e.dataTransfer)
    if (imageFiles.length > 0) {
      void addImageFiles(imageFiles)
    }
  }

  /**
   * 移除待发送图片。
   * @param index 图片下标。
   */
  const handleRemoveImage = (index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index))
  }

  /**
   * 创建 Agent。
   */
  const handleCreateAgent = () => {
    void runAction(async () => {
      await createAgent(newAgentName, newAgentWorkspace)
      setNewAgentName('')
      setNewAgentWorkspace('')
      setShowCreatePanel(false)
    })
  }

  /**
   * 删除会话。
   * @param sessionKey 会话 key。
   */
  const handleDeleteSession = (sessionKey: string) => {
    const currentSession = sessions.find(item => item.key === sessionKey)
    const currentName = currentSession?.displayName ?? sessionKey.split(':').slice(2).join(':')
    setDeleteSessionKey(sessionKey)
    setDeleteSessionLabel(currentName)
  }

  /**
   * 关闭删除会话确认弹窗。
   */
  const closeDeleteSessionModal = () => {
    setDeleteSessionKey(null)
    setDeleteSessionLabel('')
  }

  /**
   * 确认删除会话。
   */
  const confirmDeleteSession = () => {
    if (!deleteSessionKey) return
    const targetKey = deleteSessionKey
    void runAction(async () => {
      await deleteSession(targetKey)
      closeDeleteSessionModal()
    })
  }

  /**
   * 打开会话重命名弹窗。
   * @param sessionKey 会话 key。
   */
  const openRenameSessionModal = (sessionKey: string) => {
    const currentSession = sessions.find(item => item.key === sessionKey)
    const currentName = currentSession?.displayName ?? sessionKey.split(':').slice(2).join(':')
    setRenameSessionKey(sessionKey)
    setRenameSessionName(currentName)
    setRenameSessionError(null)
  }

  /**
   * 关闭会话重命名弹窗。
   */
  const closeRenameSessionModal = () => {
    setRenameSessionKey(null)
    setRenameSessionName('')
    setRenameSessionError(null)
  }

  /**
   * 点击会话重命名弹窗遮罩层关闭弹窗。
   * 仅当按下发生在遮罩层本身时触发，避免拖拽选择文本时误关闭。
   * @param event 指针事件。
   */
  const handleRenameSessionBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    closeRenameSessionModal()
  }

  /**
   * 提交会话重命名。
   * @param event 表单事件。
   */
  const handleRenameSessionSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameSessionKey) return
    const trimmedName = renameSessionName.trim()
    if (!trimmedName) {
      setRenameSessionError('请输入会话名称')
      return
    }

    setRenameSessionError(null)
    const targetKey = renameSessionKey
    void (async () => {
      try {
        await renameSession(targetKey, trimmedName)
        closeRenameSessionModal()
      } catch (renameError) {
        const message = renameError instanceof Error ? renameError.message : String(renameError)
        setRenameSessionError(message)
      }
    })()
  }

  /**
   * 重命名会话。
   * @param sessionKey 会话 key。
   */
  const handleRenameSession = (sessionKey: string) => {
    openRenameSessionModal(sessionKey)
  }

  /**
   * 应用当前会话模型与思考级别设置。
   */
  const handleApplySessionSettings = () => {
    void runAction(async () => {
      const nextModel = sessionModelOptions.length > 0
        ? (modelSelectRef.current?.value ?? null)
        : (modelInputRef.current?.value ?? null)
      await patchFocusedSessionModel(nextModel)
      if (thinkingSelectRef.current) {
        await patchFocusedSessionThinkingLevel(thinkingSelectRef.current?.value ?? null)
      }
    })
  }

  // 新消息桌面通知：当最新消息来自 assistant 且窗口不在焦点时
  const lastAssistantNotifySignatureBySessionRef = useRef<Map<string, string>>(new Map())
  // 记录已完成首次历史加载的 session，避免重启时把历史消息当新消息通知
  const initializedSessionsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!focusedSessionKey || messages.length === 0) return
    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'assistant') return
    const signature = buildAssistantNotifySignature(lastMsg)
    const signatureMap = lastAssistantNotifySignatureBySessionRef.current

    if (!initializedSessionsRef.current.has(focusedSessionKey)) {
      // 首次加载该 session 的历史，静默记录最新签名，不发通知
      initializedSessionsRef.current.add(focusedSessionKey)
      signatureMap.set(focusedSessionKey, signature)
      return
    }

    const lastSignature = signatureMap.get(focusedSessionKey)
    if (signature === lastSignature) return
    signatureMap.set(focusedSessionKey, signature)

    const agentName = currentAgent?.name ?? currentAgent?.id ?? 'Agent'
    const preview = lastMsg.content.slice(0, 60) || '新消息'
    void notify(agentName, preview)
  }, [messages, focusedSessionKey, currentAgent, notify])

  // 审批请求桌面通知
  const lastApprovalCountRef = useRef(0)
  useEffect(() => {
    if (pendingApprovals.length > lastApprovalCountRef.current) {
      const newest = pendingApprovals[pendingApprovals.length - 1]
      const toolName = newest.toolName ?? '未知工具'
      void notify('执行审批', `${toolName} 需要审批`)
    }
    lastApprovalCountRef.current = pendingApprovals.length
  }, [pendingApprovals, notify])

  useEffect(() => {
    return () => {
      if (copyMarkdownSuccessTimerRef.current !== null) {
        window.clearTimeout(copyMarkdownSuccessTimerRef.current)
      }
      if (copyPlainTextSuccessTimerRef.current !== null) {
        window.clearTimeout(copyPlainTextSuccessTimerRef.current)
      }
      if (retrySuccessTimerRef.current !== null) {
        window.clearTimeout(retrySuccessTimerRef.current)
      }
      if (exportSuccessTimerRef.current !== null) {
        window.clearTimeout(exportSuccessTimerRef.current)
      }
      if (sessionExportSuccessTimerRef.current !== null) {
        window.clearTimeout(sessionExportSuccessTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setCopiedMarkdownMessageId(null)
    setCopiedPlainTextMessageId(null)
    setRetriedMessageId(null)
    setIsSessionExported(false)
    if (copyMarkdownSuccessTimerRef.current !== null) {
      window.clearTimeout(copyMarkdownSuccessTimerRef.current)
      copyMarkdownSuccessTimerRef.current = null
    }
    if (copyPlainTextSuccessTimerRef.current !== null) {
      window.clearTimeout(copyPlainTextSuccessTimerRef.current)
      copyPlainTextSuccessTimerRef.current = null
    }
    if (retrySuccessTimerRef.current !== null) {
      window.clearTimeout(retrySuccessTimerRef.current)
      retrySuccessTimerRef.current = null
    }
    if (sessionExportSuccessTimerRef.current !== null) {
      window.clearTimeout(sessionExportSuccessTimerRef.current)
      sessionExportSuccessTimerRef.current = null
    }
  }, [focusedSessionKey])

  // 消息滚动到底部
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isTyping, focusedSessionKey])

  const combinedError = error ?? actionError

  return (
    <div
      data-theme={themeId}
      className="wb-app-shell flex h-screen text-[var(--app-text-primary)]"
      style={chatTypographyStyle}
    >
      <AppSidebar
        sidebarOpen={sidebarOpen}
        tr={tr}
        chatViewMode={chatViewMode}
        onToggleChatViewMode={() => setChatViewMode(prev => prev === 'simple' ? 'detailed' : 'simple')}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebarCollapsed={() => setSidebarCollapsed(prev => !prev)}
        serverSelectorProps={{
          servers,
          activeServerId,
          activeServer,
          isConnected,
          readonly: isWebRemote,
          onSelectServer: setActiveServerId,
          onAddServer: addServer,
          onDetectLocalServer: detectLocalOpenClawServer,
          onUpdateServer: updateServer,
          onRemoveServer: removeServer,
        }}
        activePanel={activePanel}
        supportsLogsTail={supportsLogsTail}
        gatewayHealthOk={gatewayHealth?.ok}
        webServerRunning={Boolean(webServer.webServerInfo?.running)}
        combinedError={combinedError}
        onResetDeviceIdentity={() => void resetDeviceIdentity()}
        onTogglePanel={handleTogglePanel}
        onClosePanel={closeActivePanel}
        onUnsupportedLogs={() => setActionError(tr('panel.logs.unsupported_detail'))}
        onCloseSidebarDrawer={closeSidebarDrawer}
        onRefreshAgents={() => void runAction(refreshAgents)}
        showCreatePanel={showCreatePanel}
        onToggleCreatePanel={() => setShowCreatePanel(prev => !prev)}
        newAgentName={newAgentName}
        newAgentWorkspace={newAgentWorkspace}
        onNewAgentNameChange={setNewAgentName}
        onNewAgentWorkspaceChange={setNewAgentWorkspace}
        onCreateAgent={handleCreateAgent}
        onCloseCreatePanel={() => setShowCreatePanel(false)}
        agents={agents}
        focusedAgentId={focusedAgentId}
        currentAgent={currentAgent}
        onFocusAgent={handleFocusAgent}
        onRefreshSessions={() => {
          if (focusedAgentId) void runAction(() => refreshSessions(focusedAgentId))
        }}
        onResetFocusedSession={() => {
          closeSidebarDrawer()
          void runAction(resetFocusedSession)
        }}
        isLoadingSessions={isLoadingSessions}
        sessions={sessions}
        focusedSessionKey={focusedSessionKey}
        onFocusSession={handleFocusSession}
        onRenameSession={handleRenameSession}
        onDeleteSession={handleDeleteSession}
        healthPanelProps={{
          health: gatewayHealth,
          presence: presenceList,
        }}
        onRefreshHealth={() => void runAction(async () => {
          await refreshHealth()
          await refreshPresence()
        })}
        cronPanelProps={{
          listCronJobs,
          addCronJob,
          updateCronJob,
          removeCronJob,
          runCronJob,
          listCronRuns,
          onCronEvent,
          agents,
        }}
        webServerPanelProps={{
          activeWsUrl,
          activeServerName: activeServer?.name ?? '',
        }}
      />

      <div className="flex min-w-0 flex-1 p-0 md:p-3">
        <div className="flex min-w-0 flex-1 gap-0 xl:gap-3">
          <div className="wb-main-shell wb-grid-noise relative flex min-w-0 flex-1 flex-col">
            <div className="wb-mobile-topbar flex items-center gap-2 border-b border-[var(--border-default)] px-3 py-3 md:hidden">
              <button
                type="button"
                className="wb-icon-button"
                onClick={() => setSidebarOpen(true)}
                title={tr('app.sidebar.open')}
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--text-strong)]">
                  {currentAgent?.name ?? currentAgent?.id ?? tr('app.agent.unselected')}
                </div>
                <div className="truncate text-[11px] text-[var(--text-faint)]">
                  {focusedSessionKey ?? tr('app.session.unselected')}
                </div>
              </div>
              <span className={cn('wb-chip-muted', isConnected ? 'text-[var(--color-emerald-200)]' : 'text-[var(--color-red-200)]')}>
                <span
                  className={cn(
                    'inline-block h-2 w-2 rounded-full',
                    isConnected ? 'bg-[var(--color-emerald-500)]' : 'bg-[var(--color-red-500)]',
                  )}
                />
                {isConnected ? tr('common.connected') : tr('common.disconnected')}
              </span>
            </div>

            {isWebRemote && (
              <div className="px-3 pt-3 md:px-4 md:pt-4">
                <div className="wb-info-banner text-xs">
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span>{tr('app.remote.web_mode')} · {tr('app.remote.connect_to')} {activeServer?.name ?? tr('app.remote.server')}</span>
                </div>
              </div>
            )}

            {(shutdownNotification || updateNotification) && (
              <div className="px-3 pt-3 md:px-4 md:pt-4">
                <SystemNotification
                  key={`${shutdownNotification?.receivedAt ?? 'none'}-${updateNotification?.receivedAt ?? 'none'}`}
                  shutdown={shutdownNotification}
                  update={updateNotification}
                  onDismissUpdate={dismissUpdateNotification}
                />
              </div>
            )}

            <AppPrimaryPanel
              activePanel={activePanel}
              tr={tr}
              configPanelProps={{
                store: configStore,
                callRpc,
                themeId,
                onThemeChange: setTheme,
              }}
              memoryPanelProps={{
                focusedAgentId,
                searchMemory,
                listMemory,
                deleteMemory,
              }}
              logsPanelProps={{
                isConnected,
                supportsLogsTail,
                tailLogs,
              }}
              onClosePanel={closeActivePanel}
            />
        {!isMainContentPanel(activePanel) && (
          <>
            <AppMainHeader
              tr={tr}
              chatViewMode={chatViewMode}
              currentAgentLabel={currentAgent?.name ?? currentAgent?.id ?? tr('app.agent.unselected')}
              focusedSessionKey={focusedSessionKey}
              showSubagentPanel={showSubagentPanel}
              runningSubagentCount={runningSubagentCount}
              onToggleSubagentPanel={() => setShowSubagentPanel(prev => !prev)}
              canAbortFocusedSession={Boolean(focusedSessionKey && isConnected && isTyping)}
              onAbortFocusedSession={() => void runAction(abortFocusedSession)}
              sessionModelOptions={sessionModelOptions}
              currentSessionModel={effectiveSessionModel}
              modelSelectRef={modelSelectRef}
              modelInputRef={modelInputRef}
              onApplySessionSettings={handleApplySessionSettings}
              sessionThinkingLevelOptions={sessionThinkingLevelOptions}
              currentSessionThinkingLevel={currentSession?.thinkingLevel ?? ''}
              thinkingSelectRef={thinkingSelectRef}
              chatFontSizePreset={chatFontSizePreset}
              onChatFontSizePresetChange={setChatFontSizePreset}
              isMultiModelMode={isMultiModelMode}
              multiModelPaneCount={multiModelPaneViews.length}
              canUseMultiModelMode={canUseMultiModelMode}
              onToggleMultiModelMode={handleToggleMultiModelMode}
              showToolCallDetails={showToolCallDetails}
              onShowToolCallDetailsChange={setShowToolCallDetails}
              sessionSettingTags={sessionSettingTags}
              sessionTokenSummary={sessionTokenSummary}
              canExportSession={Boolean(focusedSessionKey && exportableSessionMessages.length > 0 && !isExportingSession)}
              isExportingSession={isExportingSession}
              isSessionExported={isSessionExported}
              onExportSession={() => {
                void handleExportSession()
              }}
            />

        <main className="flex-1 overflow-y-auto px-4 pb-8 pt-6 md:px-6 md:pb-10 md:pt-8">
          {!focusedSessionKey && (
            <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center py-12">
              <div className="wb-empty-state w-full px-6 py-16 text-center text-sm">
                {tr('app.message.select_agent_and_session')}
              </div>
            </div>
          )}

          {focusedSessionKey && isMultiModelMode && (
            <div className="mx-auto max-w-7xl space-y-4">
              <div className="wb-info-banner text-xs">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                {tr('app.message.multi_model_broadcast', { count: multiModelPaneViews.length })}
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {multiModelPaneViews.map((pane) => (
                  <MultiModelConversationPane
                    key={pane.id}
                    title={pane.title}
                    session={pane.session}
                    messages={pane.messages}
                    modelOptions={sessionModelOptions}
                    selectedModel={pane.model}
                    isTyping={pane.isTyping}
                    isLoadingHistory={pane.isLoadingHistory}
                    showToolCallDetails={showToolCallDetails}
                    assistantName={currentAgentDisplayName ?? DEFAULT_ASSISTANT_SENDER_NAME}
                    onSelectModel={(model) => handleChangeMultiModelPaneModel(pane.id, pane.sessionKey, model)}
                    onFocus={() => handleFocusSession(pane.sessionKey)}
                    onAbort={() => {
                      void runAction(async () => {
                        await abortSession(pane.sessionKey)
                      })
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {focusedSessionKey && !isMultiModelMode && (
            <div className="wb-message-stack">
              {isLoadingHistory && (
                <div className="wb-chip">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {tr('app.message.loading_history')}
                </div>
              )}

              {messages.length === 0 && !isLoadingHistory && (
                <div className="wb-empty-state px-6 py-16 text-center text-sm">{tr('app.message.start_chat')}</div>
              )}

              {messages.map(msg => {
                const hasText = msg.content.trim().length > 0
                const visibleToolCalls = showToolCallDetails ? (msg.toolCalls ?? []) : []
                const hasVisibleToolCalls = visibleToolCalls.length > 0
                const hasAttachments = Boolean(msg.attachments && msg.attachments.length > 0)
                const hasMediaItems = Boolean(msg.mediaItems && msg.mediaItems.length > 0)
                const statusLabel = resolveAssistantStatusLabel(msg, tr)

                // 注意：工具调用详情开关仅控制 ToolCallBlock 展示，不应影响“生成中/失败/已中止”等状态提示。
                const shouldHideEmptyAssistant = msg.role === 'assistant'
                  && !hasText
                  && !hasVisibleToolCalls
                  && !hasAttachments
                  && !hasMediaItems
                  && !statusLabel
                if (shouldHideEmptyAssistant) return null
                const messageModel = resolveMessageModel(msg.role, msg.model, currentSession?.model)
                const messageTimeText = formatMessageTime(msg.timestamp, Date.now(), isEnglish)
                const truncatedLabel = msg.isTruncated
                  ? (msg.truncatedReason
                    ? tr('app.message.history_truncated_with_reason', { reason: msg.truncatedReason })
                    : tr('app.message.history_truncated'))
                  : null
                const kindLabel = msg.messageKind === 'compaction' ? tr('app.message.compaction') : null
                const senderName = resolveMessageSenderName(msg, agentDisplayNameMap, currentAgentDisplayName)
                const senderBadgeText = senderName.slice(0, 1).toUpperCase()
                const isUserMessage = msg.role === 'user'
                const isSystemMessage = msg.role === 'system'
                const roleClass = isUserMessage ? 'user' : isSystemMessage ? 'system' : 'assistant'
                const canExportMarkdown = msg.role === 'assistant' && hasText && msg.messageState !== 'streaming'
                const canCopyMarkdown = canExportMarkdown
                const canCopyPlainText = canExportMarkdown
                const retrySourceMessage = msg.role === 'assistant'
                  ? findPreviousUserMessage(messages, msg.id)
                  : null
                const canRetryMessage = msg.role === 'assistant'
                  && msg.id === latestAssistantMessageId
                  && (msg.messageState === 'error' || msg.messageState === 'aborted')
                  && retrySourceMessage !== null
                  && !isTyping
                const isCopyingMarkdownThisMessage = copyingMarkdownMessageId === msg.id
                const isCopiedMarkdownThisMessage = copiedMarkdownMessageId === msg.id
                const isCopyingPlainTextThisMessage = copyingPlainTextMessageId === msg.id
                const isCopiedPlainTextThisMessage = copiedPlainTextMessageId === msg.id
                const isRetryingThisMessage = retryingMessageId === msg.id
                const isRetriedThisMessage = retriedMessageId === msg.id
                const isExportingThisMessage = exportingMessageId === msg.id
                const isExportedThisMessage = exportedMessageId === msg.id
                const messageMetaText = [
                  messageTimeText,
                  messageModel,
                  statusLabel,
                  truncatedLabel,
                  kindLabel,
                ].filter((item): item is string => Boolean(item)).join(' · ')

                return (
                  <div key={msg.id} className={cn('wb-message-row', roleClass)}>
                    <div className={cn('wb-message-block', roleClass)}>
                      <div className="wb-message-meta">
                        <span
                          className={cn(
                            'wb-message-avatar',
                            isUserMessage
                              ? 'bg-[color-mix(in_srgb,var(--color-pink-400)_24%,transparent)] text-[var(--color-pink-100)]'
                              : isSystemMessage
                                ? 'bg-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] text-[var(--color-red-100)]'
                                : 'text-[var(--text-loud)]',
                          )}
                        >
                          {senderBadgeText}
                        </span>
                        <span className="font-medium text-[var(--text-subtle)]">{senderName}</span>
                        {messageMetaText && <span>{messageMetaText}</span>}
                      </div>

                      <div className={cn('wb-message-card', roleClass)}>
                        {/* 附件 */}
                        {(() => {
                          const hasAttachments = msg.attachments && msg.attachments.length > 0
                          const mediaItems = msg.mediaItems ?? []
                          const hasMediaItems = mediaItems.length > 0
                          const inlineFileNames = !hasAttachments && msg.role === 'user'
                            ? extractInlineFileNames(msg.content)
                            : []
                          const showFiles = hasAttachments || inlineFileNames.length > 0 || hasMediaItems

                          if (!showFiles) return null
                          return (
                            <div className="mb-3 flex flex-wrap gap-2">
                              {hasMediaItems && mediaItems.map((item, i) => (
                                (() => {
                                  const originalSrc = item.src.trim()
                                  const resolvedSrc = localMediaDataUrlMap[originalSrc] ?? originalSrc
                                  const renderItem: ChatMediaItem = resolvedSrc === originalSrc
                                    ? item
                                    : {
                                      ...item,
                                      src: resolvedSrc,
                                    }
                                  const isRenderable = hasRenderableMediaSrc(renderItem)
                                  const isResolvingLocalPath = !item.omitted
                                    && isLikelyLocalMediaPath(originalSrc)
                                    && resolvingLocalMediaRef.current.has(originalSrc)

                                  return isRenderable ? (
                                    <img
                                      key={`media-${i}-${item.src.slice(0, 24)}`}
                                      src={renderItem.src}
                                      alt={renderItem.sourceType ? tr('app.message.image_alt_with_source', { source: renderItem.sourceType }) : tr('common.image')}
                                      className="max-h-56 max-w-full rounded-2xl border border-[var(--border-default)] object-cover shadow-[var(--shadow-soft)]"
                                    />
                                  ) : (
                                    <div
                                      key={`media-omitted-${i}`}
                                      className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-3 py-2 text-xs text-[var(--text-subtle)]"
                                    >
                                      {item.omitted
                                        ? (typeof item.bytes === 'number'
                                          ? tr('app.message.image_omitted_with_size', { sizeKb: Math.round(item.bytes / 1024) })
                                          : tr('app.message.image_omitted'))
                                        : (isResolvingLocalPath
                                          ? tr('app.message.reading_local_image')
                                          : tr('app.message.image_unreachable'))}
                                    </div>
                                  )
                                })()
                              ))}
                              {hasAttachments && msg.attachments!.map((att, i) =>
                                isImageMime(att.mimeType) ? (
                                  <img
                                    key={i}
                                    src={att.data}
                                    alt={att.filename ?? tr('common.image')}
                                    className="max-h-56 max-w-full rounded-2xl border border-[var(--border-default)] object-cover shadow-[var(--shadow-soft)]"
                                  />
                                ) : (
                                  <div
                                    key={i}
                                    className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-3 py-2 text-xs text-[var(--text-subtle)]"
                                  >
                                    📎 {att.filename ?? tr('common.file')}
                                  </div>
                                ),
                              )}
                              {inlineFileNames.map((name, i) => (
                                <div
                                  key={`inline-${i}`}
                                  className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)] px-3 py-2 text-xs text-[var(--text-subtle)]"
                                >
                                  📎 {name}
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                        {/* 文本内容 */}
                        {msg.role === 'assistant' && visibleToolCalls.length > 0 && (
                          <div className="mb-3 space-y-2">
                            {visibleToolCalls.map(call => (
                              <ToolCallBlock
                                key={`${call.toolCallId}-${call.startedAt}`}
                                call={call}
                              />
                            ))}
                          </div>
                        )}
                        {msg.role === 'assistant' ? (
                          <div className="markdown">
                            <Markdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                table: ({ ...props }) => (
                                  <div className="markdown-table-wrap">
                                    <table {...props} />
                                  </div>
                                ),
                                a: ({ href, ...props }) => (
                                  <a
                                    {...props}
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={event => handleMarkdownLinkClick(event, href)}
                                  />
                                ),
                              }}
                            >
                              {msg.content}
                            </Markdown>
                          </div>
                        ) : msg.content.trim() ? (
                          <span className="whitespace-pre-wrap break-words">
                            {msg.role === 'user' ? sanitizeUserDisplayContent(msg.content) : msg.content}
                          </span>
                        ) : null}
                        {(canCopyMarkdown || canCopyPlainText || canRetryMessage || canExportMarkdown) && (
                          <div className="wb-message-actions">
                            {canCopyMarkdown && (
                              <button
                                type="button"
                                className={MESSAGE_ACTION_BUTTON_CLASS}
                                onClick={() => {
                                  void handleCopyAssistantMarkdown(msg)
                                }}
                                disabled={isCopyingMarkdownThisMessage}
                                title={tr('common.copy_markdown')}
                                aria-label={tr('common.copy_markdown')}
                              >
                                {isCopyingMarkdownThisMessage ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isCopiedMarkdownThisMessage ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                                <span>{isCopyingMarkdownThisMessage ? tr('common.copying') : isCopiedMarkdownThisMessage ? tr('common.copied') : tr('common.copy_md')}</span>
                              </button>
                            )}
                            {canCopyPlainText && (
                              <button
                                type="button"
                                className={MESSAGE_ACTION_BUTTON_CLASS}
                                onClick={() => {
                                  void handleCopyAssistantPlainText(msg)
                                }}
                                disabled={isCopyingPlainTextThisMessage}
                                title={tr('common.copy_plain_text')}
                                aria-label={tr('common.copy_plain_text')}
                              >
                                {isCopyingPlainTextThisMessage ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isCopiedPlainTextThisMessage ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Type className="h-3 w-3" />
                                )}
                                <span>{isCopyingPlainTextThisMessage ? tr('common.copying') : isCopiedPlainTextThisMessage ? tr('common.copied') : tr('common.copy_text')}</span>
                              </button>
                            )}
                            {canRetryMessage && (
                              <button
                                type="button"
                                className={MESSAGE_ACTION_BUTTON_CLASS}
                                onClick={() => {
                                  void handleRetryAssistantMessage(msg)
                                }}
                                disabled={isRetryingThisMessage}
                                title={tr('重新发送上一条用户消息')}
                                aria-label={tr('common.retry')}
                              >
                                {isRetryingThisMessage ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isRetriedThisMessage ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                <span>{isRetryingThisMessage ? tr('common.retrying') : isRetriedThisMessage ? tr('common.resent') : tr('common.retry')}</span>
                              </button>
                            )}
                            {canExportMarkdown && (
                              <button
                                type="button"
                                className={MESSAGE_ACTION_BUTTON_CLASS}
                                onClick={() => {
                                  void handleExportAssistantMessage(msg, senderName)
                                }}
                                disabled={isExportingThisMessage}
                                title={tr('common.export_markdown')}
                                aria-label={tr('common.export_markdown')}
                              >
                                {isExportingThisMessage ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isExportedThisMessage ? (
                                  <Check className="h-3 w-3" />
                                ) : (
                                  <Download className="h-3 w-3" />
                                )}
                                <span>{isExportingThisMessage ? tr('common.exporting') : isExportedThisMessage ? tr('common.exported') : tr('common.export_md')}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {isTyping && messages[messages.length - 1]?.role !== 'assistant' && (
                <div className="wb-message-row assistant">
                  <div className="wb-message-block assistant">
                    <div className="wb-message-card assistant">
                      <div
                        className="mb-1 text-[var(--text-faint)]"
                        style={{ fontSize: 'var(--wb-chat-meta-font-size)' }}
                      >
                        {currentAgentDisplayName ?? DEFAULT_ASSISTANT_SENDER_NAME}
                      </div>
                      <span
                        className="typing-dots text-[var(--text-muted)]"
                        style={{
                          fontSize: 'var(--wb-chat-font-size)',
                          lineHeight: 'var(--wb-chat-line-height)',
                        }}
                      >
                        {tr('思考中')}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <footer className="wb-composer-shell safe-bottom px-3 pb-3 md:px-4 md:pb-4">
          <div
            className={cn(
              'relative mx-auto transition-transform',
              isMultiModelMode ? 'max-w-7xl' : 'max-w-4xl',
            )}
          >
            {commandDetection.shouldShow && (
              <CommandPalette
                commands={commandDetection.filteredCommands}
                selectedIndex={selectedCommandIndex}
                query={commandDetection.query}
                onSelectIndex={setSelectedCommandIndex}
                onSelectCommand={handleSelectCommand}
                onClose={handleCloseCommandPalette}
              />
            )}

            <div
              className={cn('wb-composer-frame', isMultiModelMode && 'wide')}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {isDragOver && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[24px] border border-dashed border-[var(--border-accent)] bg-[color-mix(in_srgb,var(--surface-active)_78%,transparent)] backdrop-blur-sm">
                  <span className="text-sm text-[var(--color-blue-200)]">{tr('松开以添加文件')}</span>
                </div>
              )}

              <ImagePreview images={pendingImages} onRemove={handleRemoveImage} />

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? [])
                  if (files.length > 0) void addImageFiles(files)
                  e.target.value = ''
                }}
              />

              <div className="wb-composer-input-row">
                <button
                  type="button"
                  className="wb-icon-button mt-1 h-10 w-10 shrink-0 rounded-full"
                  title={tr('上传文件')}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </button>

                <div className="wb-composer-input-surface">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    rows={1}
                    placeholder={isMultiModelMode
                      ? tr('输入消息… 将同时发送到全部多模型对话（Shift+Enter 换行）')
                      : tr('输入消息… (Shift+Enter 换行，/ 触发命令，📎 上传文件)')}
                    className="wb-textarea min-h-[94px] border-none bg-transparent px-4 py-4 shadow-none"
                    onChange={e => handleInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    onSelect={handleSelectionChange}
                    onClick={handleSelectionChange}
                  />
                </div>

                <button
                  type="button"
                  disabled={!canSubmitMessage}
                  className="wb-primary-button h-11 w-11 shrink-0 rounded-full px-0"
                  onClick={handleSend}
                >
                  {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>

              <div className="wb-composer-meta">
                <span className="wb-chip-muted">{currentAgent?.name ?? currentAgent?.id ?? tr('app.agent.unselected')}</span>
                {focusedSessionKey && <span className="wb-chip-muted" data-no-i18n>{focusedSessionKey}</span>}
                <span className={cn('wb-chip-muted', isConnected ? 'text-[var(--color-emerald-200)]' : 'text-[var(--color-red-200)]')}>
                  {isConnected ? tr('common.connected') : tr('common.disconnected')}
                </span>
                {isMultiModelMode && (
                  <span className="wb-chip">
                    {tr('app.multi_model.enabled_count', { count: multiModelPaneViews.length })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </footer>

          </>
        )}
          </div>

          {!isMainContentPanel(activePanel) && showSubagentPanel && (
            <aside className="wb-right-rail hidden xl:flex xl:w-[360px] xl:shrink-0">
              <SubagentPanel
                subagentTasks={subagentTasks}
                abortSubagent={(sessionKey) => runAction(() => abortSubagent(sessionKey))}
                clearCompletedSubagents={clearCompletedSubagents}
                onClose={() => setShowSubagentPanel(false)}
              />
            </aside>
          )}
        </div>
      </div>

      {!isMainContentPanel(activePanel) && showSubagentPanel && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-overlay" onClick={() => setShowSubagentPanel(false)} />
          <div className="absolute inset-x-3 bottom-3 top-16">
            <SubagentPanel
              subagentTasks={subagentTasks}
              abortSubagent={(sessionKey) => runAction(() => abortSubagent(sessionKey))}
              clearCompletedSubagents={clearCompletedSubagents}
              onClose={() => setShowSubagentPanel(false)}
            />
          </div>
        </div>
      )}

      {deleteSessionKey && (
        <ConfirmModal
          title={tr('app.session.delete')}
          description={tr('app.session.delete_description', { name: deleteSessionLabel || deleteSessionKey })}
          confirmText={tr('common.delete')}
          variant="danger"
          onCancel={closeDeleteSessionModal}
          onConfirm={confirmDeleteSession}
        />
      )}

      {showMultiModelConfirmModal && (
        <div
          className="wb-modal-backdrop"
          onPointerDown={handleMultiModelConfirmBackdropPointerDown}
        >
          <div
            className="wb-modal-card w-full max-w-lg space-y-4"
            onClick={event => event.stopPropagation()}
          >
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[var(--text-strong)]">{tr('app.multi_model.dialog_title')}</div>
              <div className="text-xs leading-6 text-[var(--text-subtle)]">
                {tr('app.multi_model.dialog_description')}
              </div>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-[var(--text-faint)]">{tr('app.multi_model.dialog_count')}</label>
                <select
                  value={String(multiModelDraftCount)}
                  onChange={(event) => handleChangeMultiModelDraftCount(Number(event.target.value))}
                  className="wb-select"
                >
                  <option value="2">{tr('app.multi_model.count_option', { count: 2 })}</option>
                  <option value="3">{tr('app.multi_model.count_option', { count: 3 })}</option>
                  <option value="4">{tr('app.multi_model.count_option', { count: 4 })}</option>
                </select>
              </div>

              <div className="space-y-2">
                {Array.from({ length: multiModelDraftCount }, (_, index) => (
                  <div key={`multi-model-draft-${index}`} className="space-y-1">
                    <label className="text-xs text-[var(--text-faint)]">{tr('app.multi_model.dialog_conversation_model', { index: index + 1 })}</label>
                    {sessionModelOptions.length > 0 ? (
                      <select
                        value={multiModelDraftModels[index] ?? ''}
                        onChange={(event) => handleChangeMultiModelDraftModel(index, event.target.value)}
                        className="wb-select"
                      >
                        <option value="">{tr('common.default_model')}</option>
                        {sessionModelOptions.map((modelId) => (
                          <option key={`draft-model-${index}-${modelId}`} value={modelId}>
                            {modelId}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={multiModelDraftModels[index] ?? ''}
                        onChange={(event) => handleChangeMultiModelDraftModel(index, event.target.value)}
                        placeholder={tr('app.multi_model.default_model_hint')}
                        className="wb-input"
                      />
                    )}
                  </div>
                ))}
              </div>

              <div className="wb-inline-note rounded-[16px] border-[color-mix(in_srgb,var(--color-blue-700)_30%,transparent)] px-3 py-2 text-[11px] leading-5 text-[var(--color-blue-200)]">
                {tr('app.multi_model.dialog_confirm_note', { count: multiModelDraftCount })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="wb-ghost-button"
                onClick={closeMultiModelConfirmModal}
              >
                {tr('common.cancel')}
              </button>
              <button
                type="button"
                className="wb-primary-button"
                onClick={confirmEnableMultiModelMode}
              >
                {tr('app.multi_model.dialog_confirm_create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showMultiModelExitModal && (
        <div
          className="wb-modal-backdrop"
          onPointerDown={handleMultiModelExitBackdropPointerDown}
        >
          <div
            className="wb-modal-card w-full max-w-lg space-y-4"
            onClick={event => event.stopPropagation()}
          >
            <div className="space-y-1">
              <div className="text-sm font-semibold text-[var(--text-strong)]">{tr('app.multi_model.exit_dialog_title')}</div>
              <div className="text-xs leading-6 text-[var(--text-subtle)]">
                {tr('app.multi_model.exit_dialog_description')}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-[var(--text-faint)]">{tr('app.multi_model.exit_dialog_keep_label')}</div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isMultiModelExitProcessing}
                    className="wb-ghost-button disabled:opacity-60"
                    onClick={() => setMultiModelExitKeepSessionKeys(Array.from(new Set(multiModelPanes.map(pane => pane.sessionKey))))}
                  >
                    {tr('app.multi_model.exit_dialog_select_all')}
                  </button>
                  <button
                    type="button"
                    disabled={isMultiModelExitProcessing}
                    className="wb-ghost-button disabled:opacity-60"
                    onClick={() => setMultiModelExitKeepSessionKeys([])}
                  >
                    {tr('app.multi_model.exit_dialog_select_none')}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {multiModelPaneViews.map((pane) => {
                  const checked = multiModelExitKeepSessionKeys.includes(pane.sessionKey)
                  const modelLabel = pane.model?.trim() ? pane.model : tr('common.default_model')
                  const sessionLabel = pane.session?.displayName ?? pane.sessionKey
                  const showRemoveHint = !checked
                  return (
                    <label
                      key={`multi-model-exit-${pane.id}`}
                      className={cn(
                        'flex cursor-pointer items-start gap-2 rounded-[16px] border px-3 py-3 transition',
                        showRemoveHint
                          ? 'border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_42%,transparent)]'
                          : 'border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)] hover:border-[var(--border-strong)]',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 accent-[var(--color-blue-500)]"
                        checked={checked}
                        disabled={isMultiModelExitProcessing}
                        onChange={() => handleToggleMultiModelExitKeepSession(pane.sessionKey)}
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs font-medium text-[var(--text-loud)]">{pane.title}</div>
                          <div data-no-i18n className="text-[11px] text-[var(--text-faint)]">{modelLabel}</div>
                        </div>
                        <div data-no-i18n className="truncate text-[11px] text-[var(--text-faint)]">{sessionLabel}</div>
                        <div data-no-i18n className="truncate text-[11px] text-[var(--text-faint)]">{pane.sessionKey}</div>
                      </div>
                    </label>
                  )
                })}
              </div>

              {(() => {
                const uniqueSessionKeys = Array.from(new Set(multiModelPanes.map(pane => pane.sessionKey)))
                const keepSet = new Set(multiModelExitKeepSessionKeys)
                const removeCount = uniqueSessionKeys.filter(key => !keepSet.has(key)).length
                const keepCount = Math.max(0, uniqueSessionKeys.length - removeCount)
                return (
                  <div
                    className={cn(
                      'rounded-[16px] border px-3 py-2 text-[11px] leading-5',
                      removeCount > 0
                        ? 'border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_42%,transparent)] text-[var(--color-red-200)]'
                        : 'border-[color-mix(in_srgb,var(--color-blue-700)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-blue-950)_30%,transparent)] text-[var(--color-blue-200)]',
                    )}
                  >
                    {tr('app.multi_model.exit_dialog_summary', { keep: keepCount, remove: removeCount })}
                  </div>
                )
              })()}
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isMultiModelExitProcessing}
                className="wb-ghost-button disabled:opacity-60"
                onClick={closeMultiModelExitModal}
              >
                {tr('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isMultiModelExitProcessing}
                className={cn(
                  'inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60',
                  (() => {
                    const uniqueSessionKeys = Array.from(new Set(multiModelPanes.map(pane => pane.sessionKey)))
                    const keepSet = new Set(multiModelExitKeepSessionKeys)
                    const removeCount = uniqueSessionKeys.filter(key => !keepSet.has(key)).length
                    return removeCount > 0
                      ? 'wb-danger-button'
                      : 'wb-primary-button'
                  })(),
                )}
                onClick={confirmExitMultiModelMode}
              >
                {isMultiModelExitProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                {(() => {
                  const uniqueSessionKeys = Array.from(new Set(multiModelPanes.map(pane => pane.sessionKey)))
                  const keepSet = new Set(multiModelExitKeepSessionKeys)
                  const removeCount = uniqueSessionKeys.filter(key => !keepSet.has(key)).length
                  return removeCount > 0
                    ? tr('app.multi_model.exit_dialog_confirm_exit_and_delete', { remove: removeCount })
                    : tr('app.multi_model.exit_dialog_confirm_exit')
                })()}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameSessionKey && (
        <div
          className="wb-modal-backdrop"
          onPointerDown={handleRenameSessionBackdropPointerDown}
        >
          <form
            className="wb-modal-card w-full max-w-sm space-y-4"
            onSubmit={handleRenameSessionSubmit}
            onClick={event => event.stopPropagation()}
          >
            <div className="text-sm font-semibold text-[var(--text-strong)]">{tr('app.session.rename')}</div>

            <div className="space-y-1">
              <label className="text-xs text-[var(--text-faint)]">{tr('app.session.name')}</label>
              <input
                ref={renameInputRef}
                type="text"
                value={renameSessionName}
                onChange={event => {
                  setRenameSessionName(event.target.value)
                  if (renameSessionError) setRenameSessionError(null)
                }}
                className="wb-input"
                placeholder={tr('app.session.name_placeholder')}
              />
              <div className="break-all text-[11px] text-[var(--text-faint)]">
                {tr('app.session.identifier', { sessionKey: renameSessionKey })}
              </div>
            </div>

            {renameSessionError && (
              <div className="rounded-[16px] border border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_42%,transparent)] px-3 py-2 text-xs text-[var(--color-red-200)]">
                {renameSessionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                className="wb-ghost-button"
                onClick={closeRenameSessionModal}
              >
                {tr('common.cancel')}
              </button>
              <button
                type="submit"
                className="wb-primary-button"
              >
                {tr('common.confirm')}
              </button>
            </div>
          </form>
        </div>
      )}

      {approvalList.length > 0 && (
        <div className="fixed inset-x-3 top-3 z-50 flex flex-col gap-2 md:inset-x-auto md:right-4 md:top-16">
          {approvalList.map(request => (
            <ExecApprovalToast
              key={request.requestId}
              request={request}
              onApprove={() => void runAction(() => respondApproval(request.requestId, true))}
              onReject={() => void runAction(() => respondApproval(request.requestId, false))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default App
