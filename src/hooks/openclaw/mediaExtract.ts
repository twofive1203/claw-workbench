/**
 * 媒体/图片提取纯函数。
 *
 * 从各种格式递归提取图片/媒体项。
 *
 * @author towfive
 */

import { isRecord, toText } from '../../lib/parsers'
import { toNumber } from './protocol'
import type { ChatMediaItem, ToolCallRecord } from '../../types'

// ===================== 类型 =====================

/**
 * 从富文本结构提取纯文本。
 * @param content 消息内容。
 */
export interface ExtractedContentPayload {
  text: string
  mediaItems: ChatMediaItem[]
}

// ===================== 正则常量 =====================

export const UNTRUSTED_METADATA_BLOCK_RE = /\s*[^\n]*\(untrusted[^)]*metadata\):\s*\n```[a-zA-Z0-9_-]*\n[\s\S]*?\n```\s*/gi
export const INBOUND_TIMESTAMP_LINE_RE = /^\s*\[[A-Za-z]{3}\s+\d{4}-\d{2}-\d{2}\s+[^\]]+\]\s*/gm
export const CURRENT_MESSAGE_MARKER = '[Current message - respond to this]'

// ===================== 基础工具 =====================

/**
 * 规范化图片 MIME 类型。
 * @param value 原始 MIME 值。
 */
export function normalizeImageMimeType(value: unknown): string | undefined {
  const text = toText(value)
  if (!text) return undefined
  const normalized = text.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!normalized.startsWith('image/')) return undefined
  return normalized
}

/**
 * 将 base64 图片数据转换为 data URL。
 * @param data 原始 base64 文本或 data URL。
 * @param mimeType 图片 MIME 类型。
 */
export function toImageDataUrl(data: string, mimeType?: string): string {
  const trimmed = data.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:')) return trimmed
  const normalizedMime = normalizeImageMimeType(mimeType) ?? 'image/png'
  return `data:${normalizedMime};base64,${trimmed}`
}

/**
 * 从 image_url 结构提取 URL。
 * @param value image_url 字段值。
 */
export function extractImageUrl(value: unknown): string | null {
  const direct = toText(value)
  if (direct) return direct
  if (!isRecord(value)) return null
  return toText(value.url) ?? toText(value.href)
}

/**
 * 判断文本是否可能是 base64 图片数据。
 * @param value 待判断文本。
 */
export function isLikelyBase64ImagePayload(value: string): boolean {
  const compact = value.replace(/\s+/g, '')
  if (compact.length < 64) return false
  if (!/^[A-Za-z0-9+/=]+$/.test(compact)) return false
  return compact.length % 4 === 0
}

/**
 * 判断字符串是否可能是本地文件路径。
 * @param value 原始字符串。
 */
export function isLikelyLocalFilePath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('file://')) return true
  if (trimmed.startsWith('/')) return true
  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('~')) return true
  if (/^[a-zA-Z]:[\\/]/.test(trimmed)) return true
  return false
}

/**
 * 根据路径推断常见图片 MIME 类型。
 * @param value 路径或 URL。
 */
export function inferImageMimeTypeFromPath(value: string): string | undefined {
  const normalized = value.split('?')[0]?.split('#')[0]?.toLowerCase() ?? ''
  if (normalized.endsWith('.png')) return 'image/png'
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg'
  if (normalized.endsWith('.webp')) return 'image/webp'
  if (normalized.endsWith('.gif')) return 'image/gif'
  if (normalized.endsWith('.bmp')) return 'image/bmp'
  if (normalized.endsWith('.svg')) return 'image/svg+xml'
  if (normalized.endsWith('.avif')) return 'image/avif'
  return undefined
}

// ===================== 提取函数 =====================

/**
 * 从单个内容块提取图片项。
 * @param block 内容块对象。
 */
export function extractMediaItemFromContentBlock(block: Record<string, unknown>): ChatMediaItem | null {
  const type = toText(block.type)?.toLowerCase() ?? ''
  if (!type) return null

  if (type === 'image') {
    const source = isRecord(block.source) ? block.source : null
    const mimeType = normalizeImageMimeType(source?.media_type)
      ?? normalizeImageMimeType(source?.mimeType)
      ?? normalizeImageMimeType(block.media_type)
      ?? normalizeImageMimeType(block.mimeType)
      ?? normalizeImageMimeType(block.contentType)

    const sourceData = toText(source?.data)
    if (sourceData) {
      return {
        src: toImageDataUrl(sourceData, mimeType),
        mimeType,
        sourceType: type,
      }
    }

    const data = toText(block.data)
    if (data) {
      return {
        src: toImageDataUrl(data, mimeType),
        mimeType,
        sourceType: type,
      }
    }

    const sourceUrl = toText(source?.url)
    if (sourceUrl) {
      return {
        src: sourceUrl,
        mimeType,
        sourceType: type,
      }
    }

    const imageUrl = extractImageUrl(block.image_url)
    if (imageUrl) {
      return {
        src: imageUrl,
        mimeType,
        sourceType: type,
      }
    }

    const omitted = block.omitted === true || source?.omitted === true
    if (omitted) {
      return {
        src: '',
        mimeType,
        sourceType: type,
        omitted: true,
        bytes: toNumber(block.bytes) ?? toNumber(source?.bytes) ?? undefined,
      }
    }
  }

  if (type === 'output_image') {
    const mimeType = normalizeImageMimeType(block.mimeType)
      ?? normalizeImageMimeType(block.media_type)
      ?? normalizeImageMimeType(block.contentType)
      ?? normalizeImageMimeType(block.content_type)
    const raw = toText(block.data) ?? toText(block.buffer) ?? toText(block.content)
    if (!raw) return null
    const trimmed = raw.trim()
    if (!trimmed) return null
    if (!trimmed.startsWith('data:image/') && !isLikelyBase64ImagePayload(trimmed)) return null
    return {
      src: toImageDataUrl(trimmed.replace(/\s+/g, ''), mimeType),
      mimeType,
      sourceType: type,
    }
  }

  if (type === 'image_url') {
    const src = extractImageUrl(block.image_url) ?? toText(block.url)
    if (!src) return null
    return {
      src,
      mimeType: normalizeImageMimeType(block.mimeType) ?? normalizeImageMimeType(block.contentType),
      sourceType: type,
    }
  }

  if (type === 'input_image') {
    const source = isRecord(block.source) ? block.source : null
    const sourceType = toText(source?.type)?.toLowerCase()
    const mimeType = normalizeImageMimeType(source?.media_type)
      ?? normalizeImageMimeType(source?.mimeType)
      ?? normalizeImageMimeType(block.mimeType)
      ?? normalizeImageMimeType(block.contentType)
    if (sourceType === 'base64') {
      const data = toText(source?.data)
      if (!data) return null
      return {
        src: toImageDataUrl(data, mimeType),
        mimeType,
        sourceType: type,
      }
    }
    if (sourceType === 'url') {
      const src = toText(source?.url)
      if (!src) return null
      return {
        src,
        mimeType,
        sourceType: type,
      }
    }
  }

  return null
}

/**
 * 按内容对图片项去重。
 * @param items 原始图片项列表。
 */
export function dedupeMediaItems(items: ChatMediaItem[]): ChatMediaItem[] {
  const seen = new Set<string>()
  const next: ChatMediaItem[] = []

  for (const item of items) {
    const src = item.src.trim()
    const key = `${item.sourceType ?? ''}|${src}|${item.mimeType ?? ''}|${item.omitted === true ? '1' : '0'}|${item.bytes ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    next.push({
      ...item,
      src,
    })
  }

  return next
}

/**
 * 从字符串中提取 markdown 图片 URL。
 * @param text 原始文本。
 */
export function extractMarkdownImageUrls(text: string): string[] {
  const next: string[] = []
  const markdownImageRe = /!\[[^\]]*]\((data:image\/[^)\s]+|https?:\/\/[^)\s]+)\)/gi
  let match: RegExpExecArray | null
  while ((match = markdownImageRe.exec(text)) !== null) {
    const url = toText(match[1])
    if (url) next.push(url)
  }
  return next
}

/**
 * 从字符串中提取 data URL 图片。
 * @param text 原始文本。
 */
export function extractDataUrlImages(text: string): string[] {
  const next: string[] = []
  const dataUrlRe = /(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)/g
  let match: RegExpExecArray | null
  while ((match = dataUrlRe.exec(text)) !== null) {
    const dataUrl = toText(match[1])
    if (dataUrl) next.push(dataUrl)
  }
  return next
}

/**
 * 从 read 工具的 <output_image> 标签中提取图片。
 * @param text 原始文本。
 */
export function extractOutputImageTagMediaItems(text: string): ChatMediaItem[] {
  const mediaItems: ChatMediaItem[] = []
  const mimeHint = normalizeImageMimeType(text.match(/\[(image\/[a-zA-Z0-9.+-]+)]/i)?.[1])
  const outputImageRe = /<output_image[^>]*>([\s\S]*?)<\/output_image>/gi
  let match: RegExpExecArray | null
  while ((match = outputImageRe.exec(text)) !== null) {
    const raw = toText(match[1])?.trim() ?? ''
    if (!raw) continue

    if (raw.startsWith('data:image/')) {
      mediaItems.push({
        src: raw,
        mimeType: normalizeImageMimeType(raw.slice(5, raw.indexOf(';'))),
        sourceType: 'tool-result-output-image',
      })
      continue
    }

    if (!isLikelyBase64ImagePayload(raw)) continue
    mediaItems.push({
      src: toImageDataUrl(raw.replace(/\s+/g, ''), mimeHint),
      mimeType: mimeHint,
      sourceType: 'tool-result-output-image',
    })
  }
  return dedupeMediaItems(mediaItems)
}

/**
 * 从纯字符串中提取直接图片地址（整段即 URL）。
 * @param text 原始文本。
 */
export function extractDirectImageUrl(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:image/')) return trimmed
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed
  return null
}

/**
 * 从未知工具结果结构递归提取图片项。
 * @param value 原始值。
 * @param depth 递归深度。
 * @param visited 已访问对象集合。
 */
export function extractMediaItemsFromUnknown(
  value: unknown,
  depth = 0,
  visited?: WeakSet<object>,
): ChatMediaItem[] {
  if (depth > 4) return []
  if (value === null || value === undefined) return []

  if (typeof value === 'string') {
    return extractMediaItemsFromString(value)
  }

  if (Array.isArray(value)) {
    const next: ChatMediaItem[] = []
    for (const item of value) {
      const extracted = extractMediaItemsFromUnknown(item, depth + 1, visited)
      if (extracted.length > 0) next.push(...extracted)
    }
    return dedupeMediaItems(next)
  }

  if (!isRecord(value)) return []

  const nextVisited = visited ?? new WeakSet<object>()
  if (nextVisited.has(value)) return []
  nextVisited.add(value)

  const mediaItems: ChatMediaItem[] = []
  const byBlock = extractMediaItemFromContentBlock(value)
  if (byBlock && (byBlock.omitted || byBlock.src)) {
    mediaItems.push(byBlock)
  }

  const mimeType = normalizeImageMimeType(value.mimeType)
    ?? normalizeImageMimeType(value.media_type)
    ?? normalizeImageMimeType(value.contentType)
    ?? normalizeImageMimeType(value.content_type)
  const rawData = toText(value.data) ?? toText(value.buffer) ?? toText(value.content)
  const rawDataTrimmed = rawData?.trim() ?? ''
  const rawDataIsImageDataUrl = rawDataTrimmed.startsWith('data:image/')
  if (rawDataTrimmed && (mimeType || rawDataIsImageDataUrl)) {
    mediaItems.push({
      src: toImageDataUrl(rawDataTrimmed, mimeType),
      mimeType,
      sourceType: toText(value.type) ?? 'tool-result',
    })
  }

  const urlFromField = extractImageUrl(value.image_url) ?? toText(value.url) ?? toText(value.media)
  if (
    urlFromField
    && (
      urlFromField.startsWith('data:image/')
      || /^https?:\/\//i.test(urlFromField)
      || /^file:\/\//i.test(urlFromField)
      || urlFromField.startsWith('/')
      || urlFromField.startsWith('./')
      || urlFromField.startsWith('../')
      || /^[a-zA-Z]:[\\/]/.test(urlFromField)
    )
  ) {
    mediaItems.push({
      src: urlFromField,
      mimeType: normalizeImageMimeType(value.mimeType)
        ?? normalizeImageMimeType(value.contentType),
      sourceType: toText(value.type) ?? 'tool-result-url',
    })
  }

  const nestedKeys = [
    'content',
    'result',
    'output',
    'payload',
    'message',
    'details',
    'items',
    'images',
    'blocks',
    'parts',
    'media',
    'mediaUrl',
    'mediaUrls',
    'buffer',
    'attachment',
    'attachments',
    'value',
  ] as const
  for (const key of nestedKeys) {
    const nested = value[key]
    if (nested === undefined) continue
    const extracted = extractMediaItemsFromUnknown(nested, depth + 1, nextVisited)
    if (extracted.length > 0) {
      mediaItems.push(...extracted)
    }
  }

  return dedupeMediaItems(mediaItems)
}

/**
 * 从字符串中尝试提取图片项。
 * @param text 原始文本。
 */
export function extractMediaItemsFromString(text: string): ChatMediaItem[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const mediaItems: ChatMediaItem[] = []

  // 优先尝试解析 JSON 字符串（很多 tool result 以 JSON 字符串返回）。
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length <= 800_000) {
    try {
      const parsed = JSON.parse(trimmed)
      const parsedMedia = extractMediaItemsFromUnknown(parsed)
      if (parsedMedia.length > 0) {
        mediaItems.push(...parsedMedia)
      }
    } catch {
      // 非 JSON 字符串时继续做正则提取
    }
  }

  const directImageUrl = extractDirectImageUrl(trimmed)
  if (directImageUrl) {
    mediaItems.push({
      src: directImageUrl,
      sourceType: 'tool-result-direct-url',
      mimeType: normalizeImageMimeType(
        directImageUrl.startsWith('data:')
          ? directImageUrl.slice(5, directImageUrl.indexOf(';'))
          : undefined,
      ),
    })
  }

  const markdownUrls = extractMarkdownImageUrls(trimmed)
  for (const url of markdownUrls) {
    mediaItems.push({
      src: url,
      sourceType: 'tool-result-markdown',
      mimeType: normalizeImageMimeType(url.startsWith('data:') ? url.slice(5, url.indexOf(';')) : undefined),
    })
  }

  const dataUrls = extractDataUrlImages(trimmed)
  for (const dataUrl of dataUrls) {
    mediaItems.push({
      src: dataUrl,
      sourceType: 'tool-result-data-url',
      mimeType: normalizeImageMimeType(dataUrl.slice(5, dataUrl.indexOf(';'))),
    })
  }

  const outputImageItems = extractOutputImageTagMediaItems(trimmed)
  if (outputImageItems.length > 0) {
    mediaItems.push(...outputImageItems)
  }

  return dedupeMediaItems(mediaItems)
}

/**
 * 从事件数据中的媒体 URL 字段提取图片项。
 * @param data 事件数据对象。
 * @param sourceType 来源类型。
 */
export function extractMediaItemsFromMediaFields(
  data: Record<string, unknown>,
  sourceType: string,
): ChatMediaItem[] {
  const candidates = [
    data.mediaUrls,
    data.media_urls,
    data.mediaUrl,
    data.media_url,
    data.media,
    data.buffer,
    data.attachment,
    data.attachments,
  ]
  const mediaItems: ChatMediaItem[] = []
  for (const candidate of candidates) {
    if (candidate === undefined) continue
    const extracted = extractMediaItemsFromUnknown(candidate)
    if (extracted.length === 0) continue
    mediaItems.push(...extracted.map((item) => ({
      ...item,
      sourceType: item.sourceType ?? sourceType,
    })))
  }
  return dedupeMediaItems(mediaItems)
}

/**
 * 从工具 args 中提取潜在图片路径。
 * @param args 工具参数对象。
 * @param sourceType 来源类型。
 */
export function extractMediaItemsFromToolArgs(
  args: Record<string, unknown> | undefined,
  sourceType: string,
): ChatMediaItem[] {
  if (!args) return []

  const candidates = [
    args.path,
    args.file_path,
    args.filePath,
    args.media,
    args.media_path,
    args.mediaPath,
    args.url,
  ]
  const next: ChatMediaItem[] = []

  for (const candidate of candidates) {
    const text = toText(candidate)?.trim() ?? ''
    if (!text) continue
    const mimeType = inferImageMimeTypeFromPath(text)
    const isDirectImageUrl = text.startsWith('data:image/') || /^https?:\/\/\S+$/i.test(text)
    if (!mimeType && !isDirectImageUrl && !isLikelyLocalFilePath(text)) continue
    if (!mimeType && !isDirectImageUrl) continue
    next.push({
      src: text,
      mimeType,
      sourceType,
    })
  }

  return dedupeMediaItems(next)
}

/**
 * 生成 read 工具在图片省略时的路径兜底媒体项。
 * @param toolCalls 当前消息中的工具调用列表。
 * @param toolCallId 当前工具调用 id。
 * @param toolName 工具名称。
 * @param phase 工具阶段。
 * @param toolMediaItems 已提取到的工具媒体项。
 */
export function buildReadToolPathFallbackMediaItems(
  toolCalls: ToolCallRecord[],
  toolCallId: string,
  toolName: string,
  phase: 'start' | 'update' | 'result',
  toolMediaItems: ChatMediaItem[],
): ChatMediaItem[] {
  if (phase !== 'result') return []
  if (toolName.trim().toLowerCase() !== 'read') return []

  const hasRenderableMedia = toolMediaItems.some((item) => item.src.trim().length > 0 && !item.omitted)
  const hasOmittedImage = toolMediaItems.some((item) => item.omitted === true)
  if (hasRenderableMedia || !hasOmittedImage) return []

  const targetCall = toolCalls.find((item) => item.toolCallId === toolCallId)
  return extractMediaItemsFromToolArgs(targetCall?.args, 'tool-read-path')
}

// ===================== 内容解析 =====================

/**
 * 从富文本内容提取文本与图片项。
 * @param content 消息内容。
 */
export function extractContentPayload(content: unknown): ExtractedContentPayload {
  if (typeof content === 'string') {
    const mediaItems = extractMediaItemsFromString(content)
    return {
      text: content,
      mediaItems,
    }
  }

  if (!Array.isArray(content)) {
    return {
      text: '',
      mediaItems: [],
    }
  }

  const textParts: string[] = []
  const mediaItems: ChatMediaItem[] = []

  for (const item of content) {
    if (!isRecord(item)) continue

    if (item.type === 'text') {
      if (typeof item.text === 'string') {
        textParts.push(item.text)
        const mediaFromText = extractMediaItemsFromString(item.text)
        if (mediaFromText.length > 0) mediaItems.push(...mediaFromText)
      } else if (isRecord(item.text) && typeof item.text.value === 'string') {
        textParts.push(item.text.value)
        const mediaFromText = extractMediaItemsFromString(item.text.value)
        if (mediaFromText.length > 0) mediaItems.push(...mediaFromText)
      }
      continue
    }

    const mediaItem = extractMediaItemFromContentBlock(item)
    if (mediaItem) mediaItems.push(mediaItem)
  }

  return {
    text: textParts.join(''),
    mediaItems: dedupeMediaItems(mediaItems),
  }
}

/**
 * 从 chat 事件载荷提取文本与图片项。
 * @param payload chat 事件 payload。
 */
export function extractContentFromChatEvent(payload: Record<string, unknown>): ExtractedContentPayload {
  const message = payload.message
  if (!isRecord(message)) {
    return {
      text: '',
      mediaItems: [],
    }
  }
  const mediaFromFields = extractMediaItemsFromMediaFields(message, 'chat-media-url')

  const directText = toText(message.content)
  if (directText) {
    const mediaFromText = extractMediaItemsFromString(directText)
    return {
      text: directText,
      mediaItems: dedupeMediaItems([...mediaFromText, ...mediaFromFields]),
    }
  }

  const extracted = extractContentPayload(message.content)
  if (extracted.text) {
    return {
      text: extracted.text,
      mediaItems: dedupeMediaItems([...(extracted.mediaItems ?? []), ...mediaFromFields]),
    }
  }

  const fallbackText = toText(message.text) ?? ''
  const mediaFromFallbackText = fallbackText ? extractMediaItemsFromString(fallbackText) : []
  return {
    text: fallbackText,
    mediaItems: dedupeMediaItems([
      ...(extracted.mediaItems ?? []),
      ...mediaFromFields,
      ...mediaFromFallbackText,
    ]),
  }
}

// ===================== 文本清洗 =====================

/**
 * 提取最后一段 inbound 时间戳行之后的正文。
 * @param content 原始文本。
 */
export function extractAfterLastInboundTimestamp(content: string): string {
  INBOUND_TIMESTAMP_LINE_RE.lastIndex = 0
  let lastMatch: RegExpExecArray | null = null

  while (true) {
    const matched = INBOUND_TIMESTAMP_LINE_RE.exec(content)
    if (!matched) break
    lastMatch = matched
  }

  if (!lastMatch) return content
  const next = content.slice(lastMatch.index + lastMatch[0].length)
  return next.trim() ? next : content
}

/**
 * 清理 history 中用户消息的 inbound 包裹文本。
 * @param content 原始文本。
 */
export function stripInboundMetaEnvelope(content: string): string {
  let next = content.replace(/\r\n/g, '\n')

  const markerIndex = next.lastIndexOf(CURRENT_MESSAGE_MARKER)
  if (markerIndex >= 0) {
    next = next.slice(markerIndex + CURRENT_MESSAGE_MARKER.length)
  }

  next = next.replace(UNTRUSTED_METADATA_BLOCK_RE, '\n')
  next = extractAfterLastInboundTimestamp(next)
  next = next.replace(/^(?:\s*System:\s*\[[^\]]+\][^\n]*\n)+/i, '')
  return next.trimStart()
}

// ===================== ID 提取 =====================

/**
 * 从 chat 事件载荷提取 messageId。
 * @param payload chat 事件 payload。
 */
export function extractMessageIdFromChatEvent(payload: Record<string, unknown>): string | null {
  const message = payload.message
  if (!isRecord(message)) return null
  return toText(message.id) ?? toText(message.messageId) ?? toText(message.message_id)
}

/**
 * 从 agent 事件 data 提取 messageId。
 * @param data agent 事件 data。
 */
export function extractMessageIdFromAgentData(data: Record<string, unknown>): string | null {
  return toText(data.messageId) ?? toText(data.message_id)
}

/**
 * 从事件对象中尽量提取 sessionKey。
 * @param value 待解析对象。
 * @param depth 当前递归深度。
 */
export function extractSessionKeyFromUnknown(value: unknown, depth = 0): string | null {
  if (!isRecord(value) || depth > 2) return null

  const directSessionKey = toText(value.sessionKey) ?? toText(value.session_key)
  if (directSessionKey) return directSessionKey

  const nestedSession = isRecord(value.session) ? value.session : null
  if (nestedSession) {
    const nestedSessionKey = toText(nestedSession.key)
      ?? toText(nestedSession.sessionKey)
      ?? toText(nestedSession.session_key)
    if (nestedSessionKey) return nestedSessionKey
  }

  const nestedCandidates = [value.message, value.data, value.meta, value.payload, value.context]
  for (const candidate of nestedCandidates) {
    const nestedSessionKey = extractSessionKeyFromUnknown(candidate, depth + 1)
    if (nestedSessionKey) return nestedSessionKey
  }

  return null
}
