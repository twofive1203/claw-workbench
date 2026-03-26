/**
 * 消息状态管理纯函数（追加/合并/patch/history 归一化）。
 *
 * @author towfive
 */

import { isRecord, toText } from '../../lib/parsers'
import type {
  AssistantMessageState,
  ChatAttachment,
  ChatMediaItem,
  ChatMessage,
  ExecRiskLevel,
  ToolCallPhase,
  ToolCallRecord,
} from '../../types'
import { genId, extractMessageSpeakerMeta } from './protocol'
import {
  dedupeMediaItems,
  extractContentPayload,
  stripInboundMetaEnvelope,
} from './mediaExtract'
import {
  mediaDebugLog,
  summarizeMessageForDebug,
  summarizeMediaItemsForDebug,
} from './mediaDebug'

// ===================== 常量 =====================

export const LOCAL_ASSISTANT_MESSAGE_ID_PREFIX = 'local-assistant-msg-'

// ===================== 类型 =====================

export type AssistantStreamSource = 'agent' | 'chat'

// ===================== 工具函数 =====================

/**
 * 生成本地临时 assistant 消息 id。
 */
export function genLocalAssistantMessageId(): string {
  return `${LOCAL_ASSISTANT_MESSAGE_ID_PREFIX}${genId()}`
}

/**
 * 判断是否是本地临时 assistant 消息 id。
 * @param messageId 消息 id。
 */
export function isLocalAssistantMessageId(messageId: string): boolean {
  return messageId.startsWith(LOCAL_ASSISTANT_MESSAGE_ID_PREFIX)
}

/**
 * 构造 system 消息。
 * @param sessionKey 会话 key。
 * @param content 消息文本。
 */
export function buildSystemMessage(sessionKey: string, content: string): ChatMessage {
  return {
    id: genId(),
    sessionKey,
    role: 'system',
    content,
    timestamp: Date.now(),
  }
}

/**
 * 解析工具调用阶段。
 * @param value 原始阶段值。
 */
export function toToolCallPhase(value: unknown): ToolCallPhase | null {
  if (value === 'start' || value === 'update' || value === 'result') return value
  return null
}

/**
 * 解析审批风险等级。
 * @param value 原始值。
 */
export function toExecRiskLevel(value: unknown): ExecRiskLevel | undefined {
  if (value === 'low' || value === 'medium' || value === 'high') return value
  return undefined
}

/**
 * 合并助手文本，兼容 delta/快照两种流式形态。
 * @param previous 已有文本。
 * @param incoming 新收到文本。
 */
export function mergeAssistantContent(previous: string, incoming: string): string {
  if (!previous) return incoming
  if (!incoming || previous === incoming) return previous
  if (incoming.startsWith(previous)) return incoming
  if (previous.endsWith(incoming)) return previous
  return previous + incoming
}

/**
 * 定位可更新的助手消息下标。
 * @param list 消息列表。
 * @param runId 运行 id。
 * @param messageId 服务端消息 id。
 * @param streamSource 当前流式来源。
 */
export function findAssistantMessageIndex(
  list: ChatMessage[],
  runId: string | null,
  messageId: string | null,
  streamSource?: AssistantStreamSource,
): number {
  if (messageId) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const row = list[index]
      if (row?.role === 'assistant' && row.id === messageId) return index
    }
  }

  if (runId) {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const row = list[index]
      if (row?.role !== 'assistant' || row.runId !== runId) continue
      if (streamSource && row.streamSource && row.streamSource !== streamSource) {
        const canPromoteChatPlaceholderToAgent = (
          streamSource === 'agent'
          && row.streamSource === 'chat'
          && isLocalAssistantMessageId(row.id)
        )
        if (!canPromoteChatPlaceholderToAgent) continue
      }

      if (!messageId) return index
      if (isLocalAssistantMessageId(row.id)) return index
    }
  }

  if (messageId) return -1

  const lastIndex = list.length - 1
  const last = list[lastIndex]
  if (
    last?.role === 'assistant'
    && !last.runId
    && (!streamSource || !last.streamSource || last.streamSource === streamSource)
  ) {
    return lastIndex
  }

  return -1
}

/**
 * 解析工具调用的 args 对象。
 * @param value 原始 args。
 */
export function normalizeToolArgs(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return { ...value }
}

/**
 * 追加或更新工具调用记录。
 * @param list 工具调用列表。
 * @param phase 阶段。
 * @param toolCallId 工具调用 id。
 * @param toolName 工具名称。
 * @param data 事件数据。
 */
export function patchToolCalls(
  list: ToolCallRecord[],
  phase: ToolCallPhase,
  toolCallId: string,
  toolName: string,
  data: Record<string, unknown>,
): ToolCallRecord[] {
  const now = Date.now()
  const callIndex = list.findIndex(item => item.toolCallId === toolCallId)
  const next = [...list]

  if (phase === 'start') {
    const nextCall: ToolCallRecord = {
      toolCallId,
      name: toolName,
      args: normalizeToolArgs(data.args),
      phase: 'start',
      startedAt: now,
    }
    if (callIndex >= 0) {
      const existing = next[callIndex]
      next[callIndex] = {
        ...existing,
        ...nextCall,
        startedAt: existing.startedAt ?? now,
      }
      return next
    }
    next.push(nextCall)
    return next
  }

  if (callIndex < 0) {
    const fallback: ToolCallRecord = {
      toolCallId,
      name: toolName,
      phase,
      startedAt: now,
    }
    if (phase === 'update') {
      fallback.partialResult = toText(data.partialResult) ?? undefined
    }
    if (phase === 'result') {
      fallback.result = toText(data.result) ?? undefined
      fallback.error = toText(data.error) ?? undefined
      fallback.endedAt = now
    }
    next.push(fallback)
    return next
  }

  const existing = next[callIndex]
  if (phase === 'update') {
    next[callIndex] = {
      ...existing,
      phase: 'update',
      partialResult: toText(data.partialResult) ?? existing.partialResult,
    }
    return next
  }

  next[callIndex] = {
    ...existing,
    phase: 'result',
    result: toText(data.result) ?? existing.result,
    error: toText(data.error) ?? existing.error,
    endedAt: now,
  }
  return next
}

/**
 * 深拷贝工具调用记录列表（仅复制一层 args，避免状态引用复用）。
 * @param toolCalls 工具调用记录列表。
 */
export function cloneToolCalls(toolCalls: ToolCallRecord[]): ToolCallRecord[] {
  return toolCalls.map((toolCall) => ({
    ...toolCall,
    args: toolCall.args ? { ...toolCall.args } : undefined,
  }))
}

/**
 * 在 history 覆盖时尝试恢复本地工具调用信息。
 *
 * 匹配顺序：
 * 1. 先按消息 id 匹配；
 * 2. 再按 runId 匹配；
 * 3. 最后按"无 runId 的顺序"兜底。
 *
 * @param historyMessages history 归一化后的消息。
 * @param currentMessages 当前内存中的消息。
 */
export function mergeHistoryToolCalls(
  historyMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  if (historyMessages.length === 0 || currentMessages.length === 0) return historyMessages

  interface ToolCallSnapshot {
    cacheKey: string
    toolCalls: ToolCallRecord[]
  }

  const byMessageId = new Map<string, ToolCallSnapshot>()
  const byRunId = new Map<string, ToolCallSnapshot>()
  const fallbackQueue: ToolCallSnapshot[] = []

  let serial = 0
  for (const message of currentMessages) {
    if (message.role !== 'assistant') continue
    if (!message.toolCalls || message.toolCalls.length === 0) continue

    const snapshot: ToolCallSnapshot = {
      cacheKey: `${message.id}|${message.runId ?? ''}|${serial}`,
      toolCalls: cloneToolCalls(message.toolCalls),
    }
    serial += 1
    fallbackQueue.push(snapshot)
    byMessageId.set(message.id, snapshot)
    if (message.runId) {
      byRunId.set(message.runId, snapshot)
    }
  }

  if (byMessageId.size === 0 && byRunId.size === 0 && fallbackQueue.length === 0) {
    return historyMessages
  }

  const consumedSnapshots = new Set<string>()
  const consumedRunIds = new Set<string>()
  let fallbackIndex = 0
  let changed = false

  const next = historyMessages.map((message) => {
    if (message.role !== 'assistant') return message
    if (message.toolCalls && message.toolCalls.length > 0) return message

    let recoveredSnapshot: ToolCallSnapshot | null = null
    const fromMessageId = byMessageId.get(message.id)
    if (fromMessageId && fromMessageId.toolCalls.length > 0) {
      recoveredSnapshot = fromMessageId
    }

    if (!recoveredSnapshot && message.runId) {
      const fromRunId = byRunId.get(message.runId)
      if (fromRunId && fromRunId.toolCalls.length > 0 && !consumedRunIds.has(message.runId)) {
        consumedRunIds.add(message.runId)
        recoveredSnapshot = fromRunId
      }
    }

    if (!recoveredSnapshot) {
      while (fallbackIndex < fallbackQueue.length) {
        const candidate = fallbackQueue[fallbackIndex]
        fallbackIndex += 1
        if (!candidate) continue
        if (consumedSnapshots.has(candidate.cacheKey)) continue
        if (candidate.toolCalls.length === 0) continue
        recoveredSnapshot = candidate
        break
      }
    }

    if (recoveredSnapshot) consumedSnapshots.add(recoveredSnapshot.cacheKey)
    const recoveredToolCalls = recoveredSnapshot
      ? cloneToolCalls(recoveredSnapshot.toolCalls)
      : null
    if (!recoveredToolCalls || recoveredToolCalls.length === 0) return message
    changed = true
    return {
      ...message,
      toolCalls: recoveredToolCalls,
    }
  })

  return changed ? next : historyMessages
}

/**
 * 合并历史消息时保留本地尾部尚未同步的用户消息。
 * @param historyMessages 服务端返回的历史消息。
 * @param currentMessages 当前内存中的消息列表。
 */
export function mergePendingUserMessages(
  historyMessages: ChatMessage[],
  currentMessages: ChatMessage[],
): ChatMessage[] {
  if (currentMessages.length === 0) return historyMessages

  const matchedCurrentIndexes = new Set<number>()
  let currentCursor = 0

  for (const historyMessage of historyMessages) {
    if (historyMessage.role !== 'user') continue

    for (let index = currentCursor; index < currentMessages.length; index += 1) {
      const currentMessage = currentMessages[index]
      if (!isEquivalentUserMessage(historyMessage, currentMessage)) continue
      matchedCurrentIndexes.add(index)
      currentCursor = index + 1
      break
    }
  }

  let tailUserEnd = -1
  for (let index = currentMessages.length - 1; index >= 0; index -= 1) {
    if (currentMessages[index]?.role === 'user') {
      tailUserEnd = index
      break
    }
  }
  if (tailUserEnd < 0) return historyMessages

  let tailUserStart = tailUserEnd
  while (tailUserStart - 1 >= 0 && currentMessages[tailUserStart - 1]?.role === 'user') {
    tailUserStart -= 1
  }

  const pendingTailUsers = currentMessages
    .slice(tailUserStart, tailUserEnd + 1)
    .filter((_, offset) => !matchedCurrentIndexes.has(tailUserStart + offset))

  if (pendingTailUsers.length === 0) return historyMessages
  return [...historyMessages, ...pendingTailUsers]
}

/**
 * 判断历史用户消息与本地用户消息是否可视为同一条消息。
 * @param historyMessage 历史消息。
 * @param currentMessage 当前本地消息。
 */
function isEquivalentUserMessage(historyMessage: ChatMessage, currentMessage: ChatMessage): boolean {
  if (historyMessage.role !== 'user' || currentMessage.role !== 'user') return false

  const historyText = normalizeUserMessageText(historyMessage.content)
  const currentText = normalizeUserMessageText(currentMessage.content)
  const historyAttachments = buildUserAttachmentSignature(historyMessage.attachments)
  const currentAttachments = buildUserAttachmentSignature(currentMessage.attachments)

  if (historyText === currentText) {
    return historyAttachments === currentAttachments || !historyAttachments || !currentAttachments
  }

  if (!currentText || !historyText.startsWith(currentText)) return false
  return !historyAttachments
}

/**
 * 归一化用户消息文本，便于历史合并比对。
 * @param content 原始消息文本。
 */
function normalizeUserMessageText(content: string): string {
  return content.replace(/\r\n/g, '\n').trim()
}

/**
 * 生成用户附件签名，用于历史合并比对。
 * @param attachments 附件列表。
 */
function buildUserAttachmentSignature(attachments?: ChatAttachment[]): string {
  if (!attachments || attachments.length === 0) return ''

  return attachments.map((attachment) => {
    const fileName = attachment.fileName ?? attachment.filename ?? ''
    const payload = attachment.data ?? attachment.content ?? ''
    return `${attachment.mimeType}|${fileName}|${payload.length}|${payload.slice(0, 32)}`
  }).join('||')
}

// ===================== History 解析 =====================

/**
 * 将 history 消息转换为 UI 消息。
 * @param sessionKey 会话 key。
 * @param rawMessages 原始消息数组。
 */
export function normalizeHistoryMessages(sessionKey: string, rawMessages: unknown[]): ChatMessage[] {
  const next: ChatMessage[] = []

  for (const item of rawMessages) {
    if (!isRecord(item)) continue

    const rawRole = toText(item.role)
    let role: ChatMessage['role'] | null = null
    if (rawRole === 'user' || rawRole === 'assistant' || rawRole === 'system') {
      role = rawRole
    } else if (rawRole === 'developer') {
      role = 'system'
    } else {
      continue
    }

    const extractedContent = extractContentPayload(item.content)
    const directText = toText(item.content)
    const parsedText = directText ?? extractedContent.text
    const cleanedText = role === 'user' ? stripInboundMetaEnvelope(parsedText) : parsedText
    if (!cleanedText && extractedContent.mediaItems.length === 0) continue

    const rawTimestamp = item.timestamp
    const timestamp = typeof rawTimestamp === 'number' ? rawTimestamp : Date.now()
    const runId = toText(item.runId)
    const modelProvider = toText(item.modelProvider)
      ?? toText(item.model_provider)
      ?? toText(item.provider)
      ?? undefined
    const rawModel = toText(item.model)
      ?? toText(item.modelName)
      ?? toText(item.model_name)
      ?? toText(item.modelId)
      ?? toText(item.model_id)
      ?? undefined
    const model = rawModel
      ? (modelProvider && !rawModel.startsWith(`${modelProvider}/`) ? `${modelProvider}/${rawModel}` : rawModel)
      : undefined
    const stopReason = toText(item.stopReason) ?? toText(item.stop_reason)
    const errorMessage = toText(item.errorMessage) ?? toText(item.error_message) ?? toText(item.error)
    const openclawMeta = isRecord(item.__openclaw) ? item.__openclaw : null
    const speakerMeta = extractMessageSpeakerMeta(item)

    const message: ChatMessage = {
      id: toText(item.id) ?? genId(),
      sessionKey,
      role,
      content: cleanedText,
      timestamp,
    }
    if (runId) message.runId = runId
    if (modelProvider) message.modelProvider = modelProvider
    if (model) message.model = model
    if (speakerMeta.speakerName) message.speakerName = speakerMeta.speakerName
    if (speakerMeta.speakerAgentId) message.speakerAgentId = speakerMeta.speakerAgentId
    if (role === 'assistant') {
      if (stopReason) {
        message.stopReason = stopReason
        message.messageState = 'final'
      }
      if (errorMessage) {
        message.errorMessage = errorMessage
        message.messageState = 'error'
      }
    }
    if (openclawMeta) {
      if (openclawMeta.truncated === true) {
        message.isTruncated = true
        const reason = toText(openclawMeta.reason)
        if (reason) message.truncatedReason = reason
      }
      if (toText(openclawMeta.kind) === 'compaction') {
        message.messageKind = 'compaction'
      }
    }
    if (extractedContent.mediaItems.length > 0) {
      message.mediaItems = extractedContent.mediaItems
    }

    // 提取附件
    if (Array.isArray(item.attachments) && item.attachments.length > 0) {
      const attachments: ChatAttachment[] = []
      for (const att of item.attachments) {
        if (!isRecord(att)) continue
        const data = toText(att.content) ?? toText(att.data) ?? ''
        const mimeType = toText(att.mimeType) ?? ''
        if (!data || !mimeType) continue
        attachments.push({
          data: data.startsWith('data:') ? data : `data:${mimeType};base64,${data}`,
          content: data,
          mimeType,
          filename: toText(att.fileName) ?? toText(att.filename) ?? undefined,
          fileName: toText(att.fileName) ?? toText(att.filename) ?? undefined,
        })
      }
      if (attachments.length > 0) message.attachments = attachments
    }

    if (extractedContent.mediaItems.length > 0 || (message.attachments?.length ?? 0) > 0) {
      mediaDebugLog('history.message', {
        sessionKey,
        role,
        messageId: message.id,
        rawMessage: summarizeMessageForDebug(item),
        extractedTextChars: cleanedText.length,
        extractedMedia: summarizeMediaItemsForDebug(extractedContent.mediaItems),
        attachmentCount: message.attachments?.length ?? 0,
      })
    }

    next.push(message)
  }

  return next
}

/**
 * 更新助手消息的元信息（状态、停止原因、错误信息）。
 * @param prev 原消息列表。
 * @param runId 运行 id。
 * @param messageId 服务端消息 id。
 * @param streamSource 当前流式来源。
 * @param patch 待更新元信息。
 */
export function patchAssistantMessageMeta(
  prev: ChatMessage[],
  runId: string | null,
  messageId: string | null,
  streamSource: AssistantStreamSource,
  patch: {
    messageState?: AssistantMessageState
    stopReason?: string
    errorMessage?: string
  },
): ChatMessage[] {
  const targetIndex = findAssistantMessageIndex(prev, runId, messageId, streamSource)
  if (targetIndex < 0) return prev

  const target = prev[targetIndex]
  const nextTarget: ChatMessage = { ...target }
  let changed = false

  if (patch.messageState !== undefined && patch.messageState !== target.messageState) {
    nextTarget.messageState = patch.messageState
    changed = true
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'stopReason')) {
    if (patch.stopReason) {
      if (patch.stopReason !== target.stopReason) {
        nextTarget.stopReason = patch.stopReason
        changed = true
      }
    } else if (target.stopReason !== undefined) {
      delete nextTarget.stopReason
      changed = true
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'errorMessage')) {
    if (patch.errorMessage) {
      if (patch.errorMessage !== target.errorMessage) {
        nextTarget.errorMessage = patch.errorMessage
        changed = true
      }
    } else if (target.errorMessage !== undefined) {
      delete nextTarget.errorMessage
      changed = true
    }
  }

  if (!changed) return prev

  const next = [...prev]
  next[targetIndex] = nextTarget
  return next
}

/**
 * 判断两个图片项是否一致。
 * @param left 左侧图片项。
 * @param right 右侧图片项。
 */
export function isSameMediaItem(left: ChatMediaItem, right: ChatMediaItem): boolean {
  return (
    left.src === right.src
    && left.mimeType === right.mimeType
    && left.sourceType === right.sourceType
    && left.omitted === right.omitted
    && left.bytes === right.bytes
  )
}

/**
 * 判断两个图片列表是否一致。
 * @param left 左侧列表。
 * @param right 右侧列表。
 */
export function isSameMediaList(left: ChatMediaItem[] | undefined, right: ChatMediaItem[] | undefined): boolean {
  const leftList = left ?? []
  const rightList = right ?? []
  if (leftList.length !== rightList.length) return false
  for (let index = 0; index < leftList.length; index += 1) {
    const leftItem = leftList[index]
    const rightItem = rightList[index]
    if (!leftItem || !rightItem || !isSameMediaItem(leftItem, rightItem)) return false
  }
  return true
}

/**
 * 合并图片列表并去重。
 * @param current 当前图片列表。
 * @param incoming 新增图片列表。
 */
export function mergeMediaItems(
  current: ChatMediaItem[] | undefined,
  incoming: ChatMediaItem[] | undefined,
): ChatMediaItem[] | undefined {
  const currentList = current ?? []
  const incomingList = incoming ?? []
  if (incomingList.length === 0) return current
  const merged = dedupeMediaItems([...currentList, ...incomingList])
  if (merged.length === 0) return undefined
  return merged
}

/**
 * 更新助手消息中的图片列表。
 * @param prev 原消息列表。
 * @param runId 运行 id。
 * @param messageId 服务端消息 id。
 * @param streamSource 当前流式来源。
 * @param mediaItems 待合并图片列表。
 */
export function patchAssistantMessageMedia(
  prev: ChatMessage[],
  runId: string | null,
  messageId: string | null,
  streamSource: AssistantStreamSource,
  mediaItems: ChatMediaItem[] | undefined,
): ChatMessage[] {
  if (!mediaItems || mediaItems.length === 0) return prev

  const targetIndex = findAssistantMessageIndex(prev, runId, messageId, streamSource)
  if (targetIndex < 0) return prev

  const target = prev[targetIndex]
  const mergedMedia = mergeMediaItems(target.mediaItems, mediaItems)
  if (isSameMediaList(target.mediaItems, mergedMedia)) return prev

  const next = [...prev]
  next[targetIndex] = {
    ...target,
    mediaItems: mergedMedia,
  }
  return next
}

/**
 * 根据 delta 追加助手消息。
 * @param prev 原消息列表。
 * @param delta 增量文本。
 * @param runId 运行 id。
 * @param sessionKey 会话 key。
 * @param messageId 服务端消息 id。
 * @param streamSource 当前流式来源。
 * @param options 追加选项。
 */
export function appendAssistantDelta(
  prev: ChatMessage[],
  delta: string,
  runId: string | null,
  sessionKey: string,
  messageId: string | null,
  streamSource: AssistantStreamSource,
  options?: {
    forceNewMessage?: boolean
    speakerName?: string
    speakerAgentId?: string
  },
): ChatMessage[] {
  const nextSpeakerName = options?.speakerName
  const nextSpeakerAgentId = options?.speakerAgentId

  if (options?.forceNewMessage && !messageId) {
    if (!delta) return prev
    const last = prev[prev.length - 1]
    if (
      last?.role === 'assistant'
      && last.runId === (runId ?? undefined)
      && last.streamSource === streamSource
      && last.content === delta
    ) {
      if (!last) return prev
      const needPatchSpeakerName = Boolean(nextSpeakerName && nextSpeakerName !== last.speakerName)
      const needPatchSpeakerAgentId = Boolean(nextSpeakerAgentId && nextSpeakerAgentId !== last.speakerAgentId)
      if (!needPatchSpeakerName && !needPatchSpeakerAgentId) return prev
      const next = [...prev]
      next[next.length - 1] = {
        ...last,
        ...(needPatchSpeakerName ? { speakerName: nextSpeakerName } : {}),
        ...(needPatchSpeakerAgentId ? { speakerAgentId: nextSpeakerAgentId } : {}),
      }
      return next
    }

    const nextMessage: ChatMessage = {
      id: genLocalAssistantMessageId(),
      sessionKey,
      role: 'assistant',
      content: delta,
      timestamp: Date.now(),
      runId: runId ?? undefined,
      streamSource,
      messageState: 'streaming',
    }
    if (nextSpeakerName) nextMessage.speakerName = nextSpeakerName
    if (nextSpeakerAgentId) nextMessage.speakerAgentId = nextSpeakerAgentId

    return [
      ...prev,
      nextMessage,
    ]
  }

  const targetIndex = findAssistantMessageIndex(prev, runId, messageId, streamSource)
  if (targetIndex >= 0) {
    const target = prev[targetIndex]
    const mergedContent = mergeAssistantContent(target.content, delta)
    const nextId = messageId ?? target.id
    const needPatchSpeakerName = Boolean(nextSpeakerName && nextSpeakerName !== target.speakerName)
    const needPatchSpeakerAgentId = Boolean(nextSpeakerAgentId && nextSpeakerAgentId !== target.speakerAgentId)
    if (
      mergedContent === target.content
      && (runId ?? target.runId) === target.runId
      && nextId === target.id
      && (target.streamSource ?? streamSource) === target.streamSource
      && target.messageState === 'streaming'
      && target.stopReason === undefined
      && target.errorMessage === undefined
      && !needPatchSpeakerName
      && !needPatchSpeakerAgentId
    ) {
      return prev
    }

    const next = [...prev]
    next[targetIndex] = {
      ...target,
      id: nextId,
      content: mergedContent,
      runId: runId ?? target.runId,
      streamSource: target.streamSource ?? streamSource,
      messageState: 'streaming',
      stopReason: undefined,
      errorMessage: undefined,
      ...(needPatchSpeakerName ? { speakerName: nextSpeakerName } : {}),
      ...(needPatchSpeakerAgentId ? { speakerAgentId: nextSpeakerAgentId } : {}),
    }
    return next
  }

  const nextMessage: ChatMessage = {
    id: messageId ?? genLocalAssistantMessageId(),
    sessionKey,
    role: 'assistant',
    content: delta,
    timestamp: Date.now(),
    runId: runId ?? undefined,
    streamSource,
    messageState: 'streaming',
  }
  if (nextSpeakerName) nextMessage.speakerName = nextSpeakerName
  if (nextSpeakerAgentId) nextMessage.speakerAgentId = nextSpeakerAgentId

  return [
    ...prev,
    nextMessage,
  ]
}

/**
 * 根据 final 文本覆盖助手消息。
 * @param prev 原消息列表。
 * @param text 最终文本。
 * @param runId 运行 id。
 * @param sessionKey 会话 key。
 * @param messageId 服务端消息 id。
 * @param streamSource 当前流式来源。
 * @param options 结果元信息。
 */
export function applyAssistantFinal(
  prev: ChatMessage[],
  text: string,
  runId: string | null,
  sessionKey: string,
  messageId: string | null,
  streamSource: AssistantStreamSource,
  options?: {
    messageState?: AssistantMessageState
    stopReason?: string
    errorMessage?: string
    mediaItems?: ChatMediaItem[]
    speakerName?: string
    speakerAgentId?: string
  },
): ChatMessage[] {
  const targetIndex = findAssistantMessageIndex(prev, runId, messageId, streamSource)
  const patchMeta = {
    messageState: options?.messageState ?? 'final',
    stopReason: options?.stopReason,
    errorMessage: options?.errorMessage,
  }
  const nextMedia = mergeMediaItems(undefined, options?.mediaItems)
  if (targetIndex >= 0) {
    const target = prev[targetIndex]
    const nextId = messageId ?? target.id
    let nextList = prev
    let nextTarget = target
    let changed = false
    if (
      text
      && (
        target.content !== text
        || (runId ?? target.runId) !== target.runId
        || nextId !== target.id
        || (target.streamSource ?? streamSource) !== target.streamSource
      )
    ) {
      nextTarget = {
        ...nextTarget,
        id: nextId,
        content: text,
        runId: runId ?? nextTarget.runId,
        streamSource: nextTarget.streamSource ?? streamSource,
      }
      changed = true
    }

    const mergedTargetMedia = mergeMediaItems(nextTarget.mediaItems, nextMedia)
    if (!isSameMediaList(nextTarget.mediaItems, mergedTargetMedia)) {
      nextTarget = {
        ...nextTarget,
        mediaItems: mergedTargetMedia,
      }
      changed = true
    }

    if (options?.speakerName && options.speakerName !== nextTarget.speakerName) {
      nextTarget = {
        ...nextTarget,
        speakerName: options.speakerName,
      }
      changed = true
    }
    if (options?.speakerAgentId && options.speakerAgentId !== nextTarget.speakerAgentId) {
      nextTarget = {
        ...nextTarget,
        speakerAgentId: options.speakerAgentId,
      }
      changed = true
    }

    if (changed) {
      const next = [...prev]
      next[targetIndex] = nextTarget
      nextList = next
    }

    return patchAssistantMessageMeta(nextList, runId, messageId, streamSource, patchMeta)
  }

  if (!text && (!nextMedia || nextMedia.length === 0)) return prev

  const nextMessage: ChatMessage = {
    id: messageId ?? genLocalAssistantMessageId(),
    sessionKey,
    role: 'assistant',
    content: text,
    timestamp: Date.now(),
    runId: runId ?? undefined,
    streamSource,
    messageState: patchMeta.messageState,
  }
  if (patchMeta.stopReason) nextMessage.stopReason = patchMeta.stopReason
  if (patchMeta.errorMessage) nextMessage.errorMessage = patchMeta.errorMessage
  if (nextMedia && nextMedia.length > 0) nextMessage.mediaItems = nextMedia
  if (options?.speakerName) nextMessage.speakerName = options.speakerName
  if (options?.speakerAgentId) nextMessage.speakerAgentId = options.speakerAgentId

  return [
    ...prev,
    nextMessage,
  ]
}
