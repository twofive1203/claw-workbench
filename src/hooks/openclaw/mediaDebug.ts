/**
 * 媒体调试日志与结构摘要工具。
 *
 * @author towfive
 */

import { isRecord, toText } from '../../lib/parsers'
import type { ChatMediaItem, ChatAttachment } from '../../types'

export const MEDIA_DEBUG_STORAGE_KEY = 'openclaw-debug-media'
export const MEDIA_DEBUG_LOG_PREFIX = '[OpenClawMedia]'

/**
 * 生成内容字段的调试摘要（不含原始大体积数据）。
 * @param content 原始 content 字段。
 */
export function summarizeContentForDebug(content: unknown): Record<string, unknown> {
  if (typeof content === 'string') {
    return {
      kind: 'string',
      textChars: content.length,
      preview: content.slice(0, 120),
    }
  }

  if (!Array.isArray(content)) {
    return {
      kind: typeof content,
    }
  }

  let textChars = 0
  const blockTypes: string[] = []
  let imageBlockCount = 0
  let inputImageBlockCount = 0
  let imageUrlBlockCount = 0
  let dataChars = 0

  for (const block of content) {
    if (!isRecord(block)) continue
    const type = toText(block.type)?.toLowerCase() ?? 'unknown'
    blockTypes.push(type)
    if (type === 'text') {
      if (typeof block.text === 'string') {
        textChars += block.text.length
      } else if (isRecord(block.text) && typeof block.text.value === 'string') {
        textChars += block.text.value.length
      }
    }

    if (type === 'image') {
      imageBlockCount += 1
      if (typeof block.data === 'string') dataChars += block.data.length
      const source = isRecord(block.source) ? block.source : null
      if (typeof source?.data === 'string') dataChars += source.data.length
    }
    if (type === 'input_image') {
      inputImageBlockCount += 1
      const source = isRecord(block.source) ? block.source : null
      if (typeof source?.data === 'string') dataChars += source.data.length
    }
    if (type === 'image_url') imageUrlBlockCount += 1
  }

  return {
    kind: 'array',
    blockCount: content.length,
    blockTypes,
    textChars,
    imageBlockCount,
    imageUrlBlockCount,
    inputImageBlockCount,
    dataChars,
  }
}

/**
 * 生成消息对象调试摘要。
 * @param message 原始消息对象。
 */
export function summarizeMessageForDebug(message: unknown): Record<string, unknown> {
  if (!isRecord(message)) {
    return {
      kind: typeof message,
    }
  }

  const contentSummary = summarizeContentForDebug(message.content)
  const textFieldChars = typeof message.text === 'string' ? message.text.length : 0

  return {
    id: toText(message.id) ?? toText(message.messageId) ?? toText(message.message_id) ?? undefined,
    role: toText(message.role) ?? undefined,
    hasTextField: typeof message.text === 'string',
    textFieldChars,
    content: contentSummary,
  }
}

/**
 * 生成媒体项调试摘要。
 * @param mediaItems 媒体项列表。
 */
export function summarizeMediaItemsForDebug(mediaItems: ChatMediaItem[]): Array<Record<string, unknown>> {
  return mediaItems.map((item, index) => ({
    index,
    sourceType: item.sourceType,
    mimeType: item.mimeType,
    omitted: item.omitted === true,
    bytes: item.bytes ?? undefined,
    srcKind: item.src.startsWith('data:') ? 'data-url' : (item.src.startsWith('http') ? 'url' : 'unknown'),
    srcChars: item.src.length,
  }))
}

/**
 * 生成附件调试摘要。
 * @param attachments 附件列表。
 */
export function summarizeAttachmentsForDebug(attachments: ChatAttachment[] | undefined): Array<Record<string, unknown>> {
  if (!attachments || attachments.length === 0) return []
  return attachments.map((attachment, index) => ({
    index,
    mimeType: attachment.mimeType,
    filename: attachment.filename ?? attachment.fileName ?? undefined,
    dataIsDataUrl: attachment.data.startsWith('data:'),
    dataChars: attachment.data.length,
    contentChars: attachment.content.length,
  }))
}

/**
 * 生成未知值的结构调试摘要（限制递归深度，避免日志过大）。
 * @param value 原始值。
 * @param depth 当前递归深度。
 */
export function summarizeUnknownForDebug(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 3) {
    return {
      kind: 'max-depth',
    }
  }

  if (value === null) {
    return {
      kind: 'null',
    }
  }
  if (value === undefined) {
    return {
      kind: 'undefined',
    }
  }
  if (typeof value === 'string') {
    return {
      kind: 'string',
      chars: value.length,
      preview: value.slice(0, 120),
      looksLikeJson: value.trim().startsWith('{') || value.trim().startsWith('['),
      containsDataUrlImage: value.includes('data:image/'),
      containsMarkdownImage: value.includes('![') && value.includes(']('),
    }
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return {
      kind: typeof value,
      value,
    }
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, 3).map((item) => summarizeUnknownForDebug(item, depth + 1))
    return {
      kind: 'array',
      length: value.length,
      head,
    }
  }
  if (!isRecord(value)) {
    return {
      kind: typeof value,
    }
  }

  const keys = Object.keys(value)
  const summary: Record<string, unknown> = {
    kind: 'object',
    keyCount: keys.length,
    keys: keys.slice(0, 30),
  }

  if (depth < 2) {
    const importantFields = [
      'type',
      'name',
      'role',
      'phase',
      'mimeType',
      'media_type',
      'contentType',
      'content_type',
    ] as const
    for (const field of importantFields) {
      if (field in value) {
        const text = toText(value[field])
        if (text) summary[field] = text
      }
    }

    const mediaUrls = Array.isArray(value.mediaUrls) ? value.mediaUrls : null
    if (mediaUrls) {
      summary.mediaUrlsCount = mediaUrls.length
      summary.mediaUrlsPreview = mediaUrls
        .slice(0, 3)
        .map((item) => toText(item))
        .filter((item): item is string => Boolean(item))
    }
    const mediaUrl = toText(value.mediaUrl)
    if (mediaUrl) {
      summary.mediaUrl = mediaUrl
    }
    const bufferText = toText(value.buffer)
    if (bufferText) {
      summary.bufferChars = bufferText.length
      summary.bufferLooksLikeDataUrl = bufferText.startsWith('data:image/')
    }
  }

  return summary
}

/**
 * 判断是否开启媒体调试日志。
 *
 * 启用方式（浏览器控制台执行）：
 * localStorage.setItem('openclaw-debug-media', '1')
 *
 * 关闭方式：
 * localStorage.removeItem('openclaw-debug-media')
 */
export function isMediaDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(MEDIA_DEBUG_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * 输出媒体调试日志（默认关闭）。
 * @param topic 日志主题。
 * @param payload 日志载荷。
 */
export function mediaDebugLog(topic: string, payload: Record<string, unknown>): void {
  if (!isMediaDebugEnabled()) return
  try {
    console.info(`${MEDIA_DEBUG_LOG_PREFIX} ${topic}`, payload)
  } catch {
    // 调试日志失败不影响主流程
  }
}
