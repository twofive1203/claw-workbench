/**
 * 聊天附件本地缓存工具。
 * 说明：统一管理附件缓存的持久化、恢复与兼容旧缓存格式。
 * @author towfive
 */

import type { ChatAttachment, ChatMessage } from '../types'
import { isRecord } from './parsers'

export const ATTACHMENTS_STORAGE_KEY = 'openclaw-attachments'

const ATTACHMENTS_CACHE_VERSION = 2
const LEGACY_CONTENT_PREFIX_LENGTH = 100
const MAX_SESSION_ATTACHMENT_ENTRIES = 200

interface AttachmentCacheEntry {
  cacheId: string
  sequence: number
  role: string
  contentHash: string
  messageId?: string
  timestamp?: number
  attachments: ChatAttachment[]
}

interface AttachmentCacheStore {
  version: number
  sessions: Record<string, AttachmentCacheEntry[]>
  legacySessions: Record<string, Record<string, ChatAttachment[]>>
}

/**
 * 附件缓存持久化入参。
 * @param sessionKey 会话 key。
 * @param role 消息角色。
 * @param content 消息文本。
 * @param attachments 附件列表。
 * @param messageId 消息 id。
 * @param timestamp 消息时间戳。
 */
export interface PersistSessionAttachmentsOptions {
  sessionKey: string
  role: string
  content: string
  attachments: ChatAttachment[]
  messageId?: string
  timestamp?: number
}

/**
 * 克隆附件列表，避免外部引用复用。
 * @param attachments 原始附件列表。
 */
function cloneAttachments(attachments: ChatAttachment[]): ChatAttachment[] {
  return attachments.map(attachment => ({ ...attachment }))
}

/**
 * 生成旧版本缓存 key。
 * @param role 消息角色。
 * @param content 消息文本。
 */
function createLegacyAttachmentKey(role: string, content: string): string {
  return `${role}:${content.slice(0, LEGACY_CONTENT_PREFIX_LENGTH)}`
}

/**
 * 计算消息文本哈希。
 * @param content 消息文本。
 */
function hashMessageContent(content: string): string {
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

/**
 * 规范化单条附件缓存记录。
 * @param value 原始记录。
 * @param index 当前顺序索引。
 */
function normalizeAttachmentCacheEntry(value: unknown, index: number): AttachmentCacheEntry | null {
  if (!isRecord(value)) return null
  if (!Array.isArray(value.attachments) || value.attachments.length === 0) return null

  const attachments = value.attachments.filter((item): item is ChatAttachment => {
    if (!isRecord(item)) return false
    return typeof item.data === 'string' && typeof item.content === 'string' && typeof item.mimeType === 'string'
  })

  if (attachments.length === 0) return null

  const role = typeof value.role === 'string' ? value.role : ''
  const contentHash = typeof value.contentHash === 'string' ? value.contentHash : ''
  if (!role || !contentHash) return null

  const sequence = typeof value.sequence === 'number' && Number.isFinite(value.sequence)
    ? value.sequence
    : index + 1

  return {
    cacheId: typeof value.cacheId === 'string' && value.cacheId
      ? value.cacheId
      : `${contentHash}:${sequence}`,
    sequence,
    role,
    contentHash,
    messageId: typeof value.messageId === 'string' && value.messageId ? value.messageId : undefined,
    timestamp: typeof value.timestamp === 'number' && Number.isFinite(value.timestamp) ? value.timestamp : undefined,
    attachments: cloneAttachments(attachments),
  }
}

/**
 * 规范化旧版会话缓存。
 * @param value 原始旧版缓存。
 */
function normalizeLegacySessionCache(value: unknown): Record<string, ChatAttachment[]> {
  if (!isRecord(value)) return {}

  const nextSession: Record<string, ChatAttachment[]> = {}
  for (const [key, rawAttachments] of Object.entries(value)) {
    if (!Array.isArray(rawAttachments) || rawAttachments.length === 0) continue
    const attachments = rawAttachments.filter((item): item is ChatAttachment => {
      if (!isRecord(item)) return false
      return typeof item.data === 'string' && typeof item.content === 'string' && typeof item.mimeType === 'string'
    })
    if (attachments.length === 0) continue
    nextSession[key] = cloneAttachments(attachments)
  }

  return nextSession
}

/**
 * 读取并规范化附件缓存。
 */
function loadAttachmentsCache(): AttachmentCacheStore {
  const emptyStore: AttachmentCacheStore = {
    version: ATTACHMENTS_CACHE_VERSION,
    sessions: {},
    legacySessions: {},
  }

  if (typeof localStorage === 'undefined') return emptyStore

  try {
    const raw = localStorage.getItem(ATTACHMENTS_STORAGE_KEY)
    if (!raw) return emptyStore

    const parsed = JSON.parse(raw)
    if (!isRecord(parsed)) return emptyStore

    if (parsed.version === ATTACHMENTS_CACHE_VERSION && isRecord(parsed.sessions)) {
      const sessions: Record<string, AttachmentCacheEntry[]> = {}
      for (const [sessionKey, rawEntries] of Object.entries(parsed.sessions)) {
        if (!Array.isArray(rawEntries)) continue
        const entries = rawEntries
          .map((entry, index) => normalizeAttachmentCacheEntry(entry, index))
          .filter((entry): entry is AttachmentCacheEntry => Boolean(entry))
          .sort((left, right) => left.sequence - right.sequence)
        if (entries.length === 0) continue
        sessions[sessionKey] = entries
      }

      const legacySessions: Record<string, Record<string, ChatAttachment[]>> = {}
      if (isRecord(parsed.legacySessions)) {
        for (const [sessionKey, value] of Object.entries(parsed.legacySessions)) {
          const legacySession = normalizeLegacySessionCache(value)
          if (Object.keys(legacySession).length === 0) continue
          legacySessions[sessionKey] = legacySession
        }
      }

      return {
        version: ATTACHMENTS_CACHE_VERSION,
        sessions,
        legacySessions,
      }
    }

    const legacySessions: Record<string, Record<string, ChatAttachment[]>> = {}
    for (const [sessionKey, value] of Object.entries(parsed)) {
      const legacySession = normalizeLegacySessionCache(value)
      if (Object.keys(legacySession).length === 0) continue
      legacySessions[sessionKey] = legacySession
    }

    return {
      version: ATTACHMENTS_CACHE_VERSION,
      sessions: {},
      legacySessions,
    }
  } catch {
    return emptyStore
  }
}

/**
 * 保存附件缓存。
 * @param cache 规范化后的缓存对象。
 */
function saveAttachmentsCache(cache: AttachmentCacheStore): void {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // localStorage 满了就静默失败
  }
}

/**
 * 选择最匹配的附件缓存记录。
 * @param message 当前消息。
 * @param entries 会话缓存记录。
 * @param usedCacheIds 已使用的缓存记录集合。
 */
function pickBestAttachmentEntry(
  message: ChatMessage,
  entries: AttachmentCacheEntry[],
  usedCacheIds: Set<string>,
): AttachmentCacheEntry | null {
  if (message.id) {
    const matchedById = entries.find(entry => entry.messageId === message.id && !usedCacheIds.has(entry.cacheId))
    if (matchedById) return matchedById
  }

  const contentHash = hashMessageContent(message.content)
  const candidates = entries.filter(entry => {
    if (usedCacheIds.has(entry.cacheId)) return false
    return entry.role === message.role && entry.contentHash === contentHash
  })

  if (candidates.length === 0) return null

  if (typeof message.timestamp === 'number') {
    const matchedByTime = [...candidates].sort((left, right) => {
      const leftDelta = Math.abs((left.timestamp ?? Number.MAX_SAFE_INTEGER) - message.timestamp)
      const rightDelta = Math.abs((right.timestamp ?? Number.MAX_SAFE_INTEGER) - message.timestamp)
      if (leftDelta !== rightDelta) return leftDelta - rightDelta
      return left.sequence - right.sequence
    })[0]
    if (matchedByTime) return matchedByTime
  }

  return candidates.sort((left, right) => left.sequence - right.sequence)[0] ?? null
}

/**
 * 持久化单条消息的附件缓存。
 * @param options 持久化入参。
 */
export function persistSessionAttachments(options: PersistSessionAttachmentsOptions): void {
  const trimmedSessionKey = options.sessionKey.trim()
  if (!trimmedSessionKey || options.attachments.length === 0) return

  const cache = loadAttachmentsCache()
  const sessionEntries = cache.sessions[trimmedSessionKey] ?? []
  const nextSequence = sessionEntries[sessionEntries.length - 1]?.sequence ?? 0
  const contentHash = hashMessageContent(options.content)

  const entry: AttachmentCacheEntry = {
    cacheId: options.messageId ?? `${contentHash}:${nextSequence + 1}:${options.timestamp ?? Date.now()}`,
    sequence: nextSequence + 1,
    role: options.role,
    contentHash,
    messageId: options.messageId,
    timestamp: options.timestamp,
    attachments: cloneAttachments(options.attachments),
  }

  cache.sessions[trimmedSessionKey] = [...sessionEntries, entry].slice(-MAX_SESSION_ATTACHMENT_ENTRIES)
  saveAttachmentsCache(cache)
}

/**
 * 从缓存中恢复指定会话的消息附件。
 * @param sessionKey 会话 key。
 * @param messages 待恢复的消息列表。
 */
export function restoreSessionAttachments(sessionKey: string, messages: ChatMessage[]): ChatMessage[] {
  const cache = loadAttachmentsCache()
  const sessionEntries = cache.sessions[sessionKey] ?? []
  const legacySession = cache.legacySessions[sessionKey] ?? {}
  if (sessionEntries.length === 0 && Object.keys(legacySession).length === 0) return messages

  const usedCacheIds = new Set<string>()
  let hasRestored = false

  const nextMessages = messages.map(message => {
    if ((message.attachments?.length ?? 0) > 0) return message

    const matchedEntry = pickBestAttachmentEntry(message, sessionEntries, usedCacheIds)
    if (matchedEntry) {
      usedCacheIds.add(matchedEntry.cacheId)
      hasRestored = true
      return {
        ...message,
        attachments: cloneAttachments(matchedEntry.attachments),
      }
    }

    const legacyAttachments = legacySession[createLegacyAttachmentKey(message.role, message.content)]
    if (!legacyAttachments) return message

    hasRestored = true
    return {
      ...message,
      attachments: cloneAttachments(legacyAttachments),
    }
  })

  return hasRestored ? nextMessages : messages
}

/**
 * 清理指定会话的附件缓存。
 * @param sessionKey 会话 key。
 */
export function clearSessionAttachments(sessionKey: string): void {
  const trimmedSessionKey = sessionKey.trim()
  if (!trimmedSessionKey) return

  const cache = loadAttachmentsCache()
  delete cache.sessions[trimmedSessionKey]
  delete cache.legacySessions[trimmedSessionKey]
  saveAttachmentsCache(cache)
}
