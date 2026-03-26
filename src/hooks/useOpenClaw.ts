import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Agent,
  ChatAttachment,
  ChatMessage,
  CronJob,
  CronJobConfig,
  CronRunRecord,
  ExecApprovalRequest,
  GatewayHealthInfo,
  LogsTailParams,
  LogsTailResult,
  MemoryEntry,
  PresenceEntry,
  SessionSummary,
  ShutdownNotification,
  SubagentTask,
  UpdateNotification,
} from '../types'
import {
  clearSessionAttachments,
  persistSessionAttachments,
  restoreSessionAttachments,
} from '../lib/chatAttachmentCache'
import { isRecord, toErrorText, toText } from '../lib/parsers'
import {
  DEFAULT_MAIN_KEY,
  buildAgentMainSessionKey,
  buildNewSessionKey,
  extractMessageSpeakerMeta,
  genId,
  parseAgentIdFromSessionKey,
  parseFrame,
  toLogLines,
  toNumber,
  toTextArray,
  CLIENT_ROLE,
  type GatewayReqFrame,
} from './openclaw/protocol'
import {
  loadOrCreateDeviceIdentity,
  clearDeviceIdentity,
  storeDeviceToken,
  clearDeviceToken,
} from './openclaw/deviceIdentity'
import {
  buildCronAddPayload,
  buildCronUpdatePatch,
  buildMemoryEntryFromFile,
  computeMemoryRelevance,
  extractCronRunsPayload,
  isMemoryFileName,
  isSameSessionSummaryList,
  normalizeAgent,
  normalizeAgentWorkspaceFile,
  normalizeCronJob,
  normalizeCronRun,
  normalizePresenceEntry,
  normalizeSessionSummary,
  parseMemoryEntryId,
  type AgentWorkspaceFile,
  upsertSessionSummary,
} from './openclaw/domain'

export { normalizeSessionSummary } from './openclaw/domain'
export { DEFAULT_WS_URL } from './openclaw/protocol'

import {
  summarizeMessageForDebug,
  summarizeMediaItemsForDebug,
  summarizeAttachmentsForDebug,
  summarizeUnknownForDebug,
  mediaDebugLog,
} from './openclaw/mediaDebug'
import {
  extractMediaItemsFromMediaFields,
  extractMediaItemsFromUnknown,
  extractContentFromChatEvent,
  extractMessageIdFromChatEvent,
  extractMessageIdFromAgentData,
  extractSessionKeyFromUnknown,
  buildReadToolPathFallbackMediaItems,
} from './openclaw/mediaExtract'
import {
  type AssistantStreamSource,
  buildSystemMessage,
  toToolCallPhase,
  toExecRiskLevel,
  findAssistantMessageIndex,
  patchToolCalls,
  mergeHistoryToolCalls,
  mergePendingUserMessages,
  normalizeHistoryMessages,
  patchAssistantMessageMeta,
  mergeMediaItems,
  patchAssistantMessageMedia,
  appendAssistantDelta,
  applyAssistantFinal,
} from './openclaw/messageState'
import {
  buildRpcError,
  buildSignedConnectFrame,
  enhanceHandshakeError,
} from './openclaw/handshake'

export { normalizeHistoryMessages }

// ===================== 常量 =====================

const RECONNECT_INTERVAL = 3000

/**
 * connect 成功响应的最小结构。
 * @param snapshot 服务端快照。
 */
interface HelloOkPayload {
  snapshot?: {
    sessionDefaults?: {
      mainSessionKey?: string
    }
    presence?: unknown[]
    health?: {
      ok?: boolean
    }
    uptimeMs?: number
  }
  server?: {
    version?: string
    protocol?: number
  }
  features?: {
    methods?: string[]
    events?: string[]
  }
  auth?: {
    deviceToken?: string
    role?: string
    scopes?: string[]
  }
}

/**
 * agents.list 响应结构。
 * @param defaultId 默认 agent id。
 * @param mainKey 会话 main key。
 * @param scope 会话作用域模式（per-sender | global）。
 * @param agents agent 列表。
 */
interface AgentsListPayload {
  defaultId?: string
  mainKey?: string
  scope?: string
  agents?: unknown[]
}

/**
 * sessions.list 响应结构。
 * @param sessions 会话列表。
 */
interface SessionsListPayload {
  sessions?: unknown[]
}

/**
 * chat.history 响应结构。
 * @param sessionKey 会话 key。
 * @param messages 历史消息。
 * @param thinkingLevel 会话思考级别。
 * @param verboseLevel 会话详细级别。
 */
interface ChatHistoryPayload {
  sessionKey?: string
  messages?: unknown[]
  thinkingLevel?: string
  verboseLevel?: string
}

/**
 * chat.send 响应结构。
 * @param runId 运行 id。
 */
interface ChatSendPayload {
  runId?: string
}

/**
 * 挂起请求。
 * @param method 方法名。
 * @param resolve 成功回调。
 * @param reject 失败回调。
 */
interface PendingRequest {
  method: string
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
}

/**
 * useOpenClaw 可选配置。
 * @param keepToolCallsInHistory 是否在 history 覆盖时保留本地工具调用记录。
 */
interface UseOpenClawOptions {
  keepToolCallsInHistory?: boolean
}

/**
 * 刷新会话列表的附加选项。
 * @param showLoading 是否显示左侧会话列表加载态。
 */
interface RefreshSessionsOptions {
  showLoading?: boolean
}

/**
 * 暂存未能立即定位到会话的流式事件。
 * @param event 事件名。
 * @param payload 事件载荷。
 */
interface PendingStreamEvent {
  event: 'agent' | 'chat'
  payload: Record<string, unknown>
}

// ===================== Hook =====================

/**
 * OpenClaw 网关 Hook（多 Agent / 多 Session）。
 * @param url WebSocket 地址。
 */
export function useOpenClaw(url: string, options?: UseOpenClawOptions) {
  const [isConnected, setIsConnected] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [focusedAgentId, setFocusedAgentId] = useState<string | null>(null)
  const [focusedSessionKey, setFocusedSessionKey] = useState<string | null>(null)
  const [sessionsByAgent, setSessionsByAgent] = useState<Record<string, SessionSummary[]>>({})
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({})
  const [typingBySession, setTypingBySession] = useState<Record<string, boolean>>({})
  const [loadingSessionsByAgent, setLoadingSessionsByAgent] = useState<Record<string, boolean>>({})
  const [loadingHistoryBySession, setLoadingHistoryBySession] = useState<Record<string, boolean>>({})
  const [activeSendCount, setActiveSendCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [pendingApprovals, setPendingApprovals] = useState<ExecApprovalRequest[]>([])
  const [shutdownNotification, setShutdownNotification] = useState<ShutdownNotification | null>(null)
  const [updateNotification, setUpdateNotification] = useState<UpdateNotification | null>(null)
  const [gatewayHealth, setGatewayHealth] = useState<GatewayHealthInfo | null>(null)
  const [presenceList, setPresenceList] = useState<PresenceEntry[]>([])
  const [subagentTasks, setSubagentTasks] = useState<SubagentTask[]>([])

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectReqIdRef = useRef<string | null>(null)
  const currentDeviceIdRef = useRef<string | null>(null)
  const handshakeReadyRef = useRef(false)
  const clientCloseErrorRef = useRef<string | null>(null)
  const disposedRef = useRef(false)
  const mainKeyRef = useRef(DEFAULT_MAIN_KEY)
  const pendingReqRef = useRef<Map<string, PendingRequest>>(new Map())
  const runToSessionRef = useRef<Map<string, string>>(new Map())
  const runStreamSourceRef = useRef<Map<string, AssistantStreamSource>>(new Map())
  const pendingStreamEventsRef = useRef<Map<string, PendingStreamEvent[]>>(new Map())
  const runsWithAgentTextRef = useRef<Set<string>>(new Set())
  const shutdownRef = useRef<ShutdownNotification | null>(shutdownNotification)
  const cronEventCallbackRef = useRef<((event: Record<string, unknown>) => void) | null>(null)
  const handleAgentEventRef = useRef<((payload: Record<string, unknown>) => void) | null>(null)
  const handleChatEventRef = useRef<((payload: Record<string, unknown>) => void) | null>(null)
  const focusedAgentIdRef = useRef<string | null>(focusedAgentId)
  const focusedSessionKeyRef = useRef<string | null>(focusedSessionKey)
  const sessionsByAgentRef = useRef<Record<string, SessionSummary[]>>(sessionsByAgent)
  const keepToolCallsInHistoryRef = useRef<boolean>(options?.keepToolCallsInHistory === true)

  /**
   * 同步 focusedAgentId 到 ref。
   * @param focused 当前聚焦 agent。
   */
  useEffect(() => {
    focusedAgentIdRef.current = focusedAgentId
  }, [focusedAgentId])

  /**
   * 同步 focusedSessionKey 到 ref。
   * @param focused 当前聚焦会话。
   */
  useEffect(() => {
    focusedSessionKeyRef.current = focusedSessionKey
  }, [focusedSessionKey])

  /**
   * 同步 sessionsByAgent 到 ref。
   * @param sessions 会话 map。
   */
  useEffect(() => {
    sessionsByAgentRef.current = sessionsByAgent
  }, [sessionsByAgent])

  /**
   * 同步工具调用保留开关到 ref，避免重建 loadHistory 回调导致 WS 重连。
   * @param keepToolCallsInHistory 是否保留 history 覆盖前的工具调用记录。
   */
  useEffect(() => {
    keepToolCallsInHistoryRef.current = options?.keepToolCallsInHistory === true
  }, [options?.keepToolCallsInHistory])

  /**
   * 同步关机通知到 ref，供重连策略读取。
   * @param notice 关机通知。
   */
  useEffect(() => {
    shutdownRef.current = shutdownNotification
  }, [shutdownNotification])

  /**
   * 重置当前服务器作用域下的界面状态。
   * 用于切换服务器时立即清空旧服务器残留的 Agent、会话与消息数据。
   */
  const resetServerScopedState = useCallback(() => {
    mainKeyRef.current = DEFAULT_MAIN_KEY
    pendingStreamEventsRef.current.clear()
    focusedAgentIdRef.current = null
    focusedSessionKeyRef.current = null
    sessionsByAgentRef.current = {}
    setAgents([])
    setFocusedAgentId(null)
    setFocusedSessionKey(null)
    setSessionsByAgent({})
    setMessagesBySession({})
    setTypingBySession({})
    setLoadingSessionsByAgent({})
    setLoadingHistoryBySession({})
  }, [])

  /**
   * 重置设备身份：清除本地密钥对与令牌，断开当前连接触发重连（新身份自动生成）。
   */
  const resetDeviceIdentity = useCallback(async () => {
    await clearDeviceIdentity()
    currentDeviceIdRef.current = null
    // 关闭当前连接，重连时会自动生成新的设备身份
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close(1000, 'device identity reset')
    }
  }, [])

  /**
   * 统一设置会话 typing 状态。
   * @param sessionKey 会话 key。
   * @param typing 是否在生成。
   */
  const setSessionTyping = useCallback((sessionKey: string, typing: boolean) => {
    setTypingBySession((prev) => {
      if (prev[sessionKey] === typing) return prev
      return { ...prev, [sessionKey]: typing }
    })
  }, [])

  /**
   * 往指定会话追加系统消息。
   * @param sessionKey 会话 key。
   * @param content 文本内容。
   */
  const appendSystemMessage = useCallback((sessionKey: string, content: string) => {
    setMessagesBySession((prev) => {
      const list = prev[sessionKey] ?? []
      return {
        ...prev,
        [sessionKey]: [...list, buildSystemMessage(sessionKey, content)],
      }
    })
  }, [])

  /**
   * 在本地会话摘要中写入 verboseLevel，避免重复 patch。
   * @param sessionKey 会话 key。
   * @param verboseLevel 目标详细级别。
   */
  const setSessionVerboseLevelLocal = useCallback((sessionKey: string, verboseLevel: string) => {
    const agentId = parseAgentIdFromSessionKey(sessionKey)
    if (!agentId) return

    setSessionsByAgent((prev) => {
      const current = prev[agentId] ?? []
      const index = current.findIndex(item => item.key === sessionKey)
      if (index < 0) return prev
      const target = current[index]
      if (target.verboseLevel === verboseLevel) return prev
      const nextList = [...current]
      nextList[index] = {
        ...target,
        verboseLevel,
      }
      return {
        ...prev,
        [agentId]: nextList,
      }
    })
  }, [])

  /**
   * 确保会话存在于当前 agent 会话列表。
   * @param sessionKey 会话 key。
   */
  const ensureSessionExists = useCallback((sessionKey: string) => {
    const agentId = parseAgentIdFromSessionKey(sessionKey)
    if (!agentId) return

    setSessionsByAgent((prev) => {
      const current = prev[agentId] ?? []
      if (current.some(item => item.key === sessionKey)) return prev
      const nextRow: SessionSummary = {
        key: sessionKey,
        agentId,
        displayName: sessionKey.split(':').slice(2).join(':'),
      }
      return {
        ...prev,
        [agentId]: upsertSessionSummary(current, nextRow),
      }
    })
  }, [])

  /**
   * 结束所有挂起请求。
   * @param reason 结束原因。
   */
  const rejectAllPending = useCallback((reason: string) => {
    for (const pending of pendingReqRef.current.values()) {
      pending.reject(new Error(reason))
    }
    pendingReqRef.current.clear()
  }, [])

  /**
   * 发送 RPC 请求。
   * @param method RPC 方法。
   * @param params 参数对象。
   */
  const callRpc = useCallback(<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(buildRpcError('WebSocket 未连接', { code: 'UNAVAILABLE' }))
        return
      }
      if (!handshakeReadyRef.current) {
        reject(buildRpcError('网关握手未完成', { code: 'UNAVAILABLE' }))
        return
      }

      const reqId = genId()
      pendingReqRef.current.set(reqId, {
        method,
        resolve: payload => resolve(payload as T),
        reject,
      })

      const frame: GatewayReqFrame = {
        type: 'req',
        id: reqId,
        method,
        params,
      }
      ws.send(JSON.stringify(frame))
    })
  }, [])

  /**
   * 确保会话启用 verbose=full，避免工具事件丢失 result/partialResult。
   * @param sessionKey 会话 key。
   */
  const ensureSessionToolVerboseFull = useCallback(async (sessionKey: string) => {
    const agentId = parseAgentIdFromSessionKey(sessionKey)
    const currentSessions = agentId ? (sessionsByAgentRef.current[agentId] ?? []) : []
    const currentSession = currentSessions.find(item => item.key === sessionKey)
    const currentVerbose = currentSession?.verboseLevel?.trim().toLowerCase() ?? ''
    if (currentVerbose === 'full') return

    await callRpc('sessions.patch', {
      key: sessionKey,
      verboseLevel: 'full',
    })
    setSessionVerboseLevelLocal(sessionKey, 'full')
  }, [callRpc, setSessionVerboseLevelLocal])
  /**
   * 读取指定会话历史。
   * @param sessionKey 会话 key。
   */
  const loadHistory = useCallback(async (sessionKey: string) => {
    setLoadingHistoryBySession(prev => ({ ...prev, [sessionKey]: true }))
    try {
      const payload = await callRpc<ChatHistoryPayload>('chat.history', {
        sessionKey,
        limit: 200,
      })

      const normalizedSessionKey = toText(payload.sessionKey) ?? sessionKey
      const rawMessages = Array.isArray(payload.messages) ? payload.messages : []
      const normalizedMessages = normalizeHistoryMessages(normalizedSessionKey, rawMessages)
      const thinkingLevel = toText(payload.thinkingLevel) ?? undefined
      const verboseLevel = toText(payload.verboseLevel) ?? undefined

      setMessagesBySession((prev) => {
        const current = prev[normalizedSessionKey] ?? []
        const withToolCalls = keepToolCallsInHistoryRef.current
          ? mergeHistoryToolCalls(normalizedMessages, current)
          : normalizedMessages
        // 从 localStorage 恢复 attachments（Gateway 不持久化 attachments）
        const restoredMessages = restoreSessionAttachments(normalizedSessionKey, withToolCalls)
        const merged = mergePendingUserMessages(restoredMessages, current)
        if (keepToolCallsInHistoryRef.current) {
          const currentToolCallMessages = current.filter(
            message => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0,
          ).length
          const historyToolCallMessages = normalizedMessages.filter(
            message => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0,
          ).length
          const recoveredToolCallMessages = withToolCalls.filter(
            message => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0,
          ).length
          mediaDebugLog('history.toolcalls.merge', {
            sessionKey: normalizedSessionKey,
            currentMessageCount: current.length,
            historyMessageCount: normalizedMessages.length,
            mergedMessageCount: merged.length,
            currentToolCallMessages,
            historyToolCallMessages,
            recoveredToolCallMessages,
          })
        }
        return {
          ...prev,
          [normalizedSessionKey]: merged,
        }
      })
      setSessionTyping(normalizedSessionKey, false)
      ensureSessionExists(normalizedSessionKey)
      const agentId = parseAgentIdFromSessionKey(normalizedSessionKey)
      if (agentId && (thinkingLevel || verboseLevel)) {
        setSessionsByAgent((prev) => {
          const current = prev[agentId] ?? []
          const nextRow: SessionSummary = {
            key: normalizedSessionKey,
            agentId,
            thinkingLevel,
            verboseLevel,
          }
          return {
            ...prev,
            [agentId]: upsertSessionSummary(current, nextRow),
          }
        })
      }
    } catch (loadError) {
      appendSystemMessage(sessionKey, `[Error] ${toErrorText(loadError)}`)
      setSessionTyping(sessionKey, false)
    } finally {
      setLoadingHistoryBySession(prev => ({ ...prev, [sessionKey]: false }))
    }
  }, [appendSystemMessage, callRpc, ensureSessionExists, setSessionTyping])

  /**
   * 缓存暂时无法定位会话的流式事件。
   * @param runId 运行 id。
   * @param event 事件名。
   * @param payload 事件载荷。
   */
  const queuePendingStreamEvent = useCallback((
    runId: string,
    event: PendingStreamEvent['event'],
    payload: Record<string, unknown>,
  ) => {
    const current = pendingStreamEventsRef.current.get(runId) ?? []
    pendingStreamEventsRef.current.set(runId, [...current, { event, payload }])
  }, [])

  /**
   * 回放某个 runId 下暂存的流式事件。
   * @param runId 运行 id。
   */
  const flushPendingStreamEvents = useCallback((runId: string) => {
    const pendingEvents = pendingStreamEventsRef.current.get(runId)
    if (!pendingEvents || pendingEvents.length === 0) return

    pendingStreamEventsRef.current.delete(runId)
    for (const item of pendingEvents) {
      const handler = item.event === 'agent' ? handleAgentEventRef.current : handleChatEventRef.current
      handler?.(item.payload)
    }
  }, [])

  /**
   * 为 runId 记录所属会话，并触发暂存事件回放。
   * @param runId 运行 id。
   * @param sessionKey 会话 key。
   */
  const registerRunSession = useCallback((runId: string | null, sessionKey: string) => {
    if (!runId) return

    const trimmedSessionKey = sessionKey.trim()
    if (!trimmedSessionKey) return

    runToSessionRef.current.set(runId, trimmedSessionKey)
    flushPendingStreamEvents(runId)
  }, [flushPendingStreamEvents])

  /**
   * 解析流式事件所属会话。
   * @param payload 事件载荷。
   * @param runId 运行 id。
   */
  const resolveStreamSessionKey = useCallback((payload: Record<string, unknown>, runId: string | null) => {
    const payloadSessionKey = extractSessionKeyFromUnknown(payload)
    if (payloadSessionKey) return payloadSessionKey
    if (!runId) return null
    return runToSessionRef.current.get(runId) ?? null
  }, [])

  /**
   * 刷新指定 agent 的会话列表。
   * @param agentId agent id。
   * @param options 刷新选项。
   */
  const refreshSessions = useCallback(async (agentId: string, options?: RefreshSessionsOptions) => {
    const showLoading = options?.showLoading !== false
    if (showLoading) {
      setLoadingSessionsByAgent(prev => ({ ...prev, [agentId]: true }))
    }
    try {
      const payload = await callRpc<SessionsListPayload>('sessions.list', {
        agentId,
        limit: 50,
        includeDerivedTitles: true,
        includeLastMessage: true,
      })

      const rows = Array.isArray(payload.sessions) ? payload.sessions : []
      const nextSessions = rows
        .map(row => normalizeSessionSummary(row, agentId))
        .filter((row): row is SessionSummary => Boolean(row))
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))

      const mainSessionKey = buildAgentMainSessionKey(agentId, mainKeyRef.current)
      const withMain = nextSessions.some(item => item.key === mainSessionKey)
        ? nextSessions
        : [{ key: mainSessionKey, agentId, displayName: mainKeyRef.current }, ...nextSessions]

      setSessionsByAgent((prev) => {
        const current = prev[agentId] ?? []
        if (isSameSessionSummaryList(current, withMain)) return prev
        return { ...prev, [agentId]: withMain }
      })
    } catch (refreshError) {
      setError(toErrorText(refreshError))
    } finally {
      if (showLoading) {
        setLoadingSessionsByAgent(prev => ({ ...prev, [agentId]: false }))
      }
    }
  }, [callRpc])

  /**
   * 处理 agent 流式事件。
   * @param payload agent 事件载荷。
   */
  const handleAgentEvent = useCallback((payload: Record<string, unknown>) => {
    const runId = toText(payload.runId)
    const sessionKey = resolveStreamSessionKey(payload, runId)
    if (!sessionKey) {
      if (runId) queuePendingStreamEvent(runId, 'agent', payload)
      return
    }

    ensureSessionExists(sessionKey)
    registerRunSession(runId, sessionKey)

    const runStreamSourceMap = runStreamSourceRef.current
    const stream = toText(payload.stream) ?? ''
    const data = isRecord(payload.data) ? payload.data : null

    if (stream === 'assistant' && data) {
      const text = typeof data.text === 'string' ? data.text : ''
      const delta = typeof data.delta === 'string' ? data.delta : ''
      const messageId = extractMessageIdFromAgentData(data)
      const streamSpeakerMeta = extractMessageSpeakerMeta(data)
      const streamMediaItems = extractMediaItemsFromMediaFields(data, 'agent-media-url')
      const incoming = text || delta
      const hasStreamMedia = streamMediaItems.length > 0
      if (!incoming && !hasStreamMedia) return

      mediaDebugLog('agent.assistant.chunk', {
        runId: runId ?? undefined,
        sessionKey,
        messageId: messageId ?? undefined,
        stream,
        dataKeys: Object.keys(data),
        textChars: text.length,
        deltaChars: delta.length,
        incomingChars: incoming.length,
        mediaCount: streamMediaItems.length,
        mediaItems: summarizeMediaItemsForDebug(streamMediaItems),
        mediaField: summarizeUnknownForDebug({
          mediaUrls: data.mediaUrls,
          mediaUrl: data.mediaUrl,
          media: data.media,
        }),
      })

      if (runId && incoming) {
        runsWithAgentTextRef.current.add(runId)
        runStreamSourceMap.set(runId, 'agent')
      }

      const forceNewMessage = !messageId && Boolean(text) && Boolean(delta) && text === delta

      setSessionTyping(sessionKey, true)
      setMessagesBySession((prev) => {
        const list = prev[sessionKey] ?? []
        const nextWithDelta = appendAssistantDelta(
          list,
          incoming,
          runId,
          sessionKey,
          messageId,
          'agent',
          {
            forceNewMessage: Boolean(incoming) && forceNewMessage,
            speakerName: streamSpeakerMeta.speakerName,
            speakerAgentId: streamSpeakerMeta.speakerAgentId,
          },
        )
        const nextList = patchAssistantMessageMedia(
          nextWithDelta,
          runId,
          messageId,
          'agent',
          streamMediaItems,
        )
        if (nextList === list) return prev
        return {
          ...prev,
          [sessionKey]: nextList,
        }
      })
      return
    }

    if (stream === 'lifecycle' && data) {
      const phase = toText(data.phase) ?? ''
      const parentRunId = toText(data.parentRunId)

      if (parentRunId && runId) {
        const label = toText(data.label) ?? undefined
        const agentId = toText(data.agentId) ?? undefined
        const startedAt = typeof data.startedAt === 'number' ? data.startedAt : Date.now()

        if (phase === 'start') {
          setSubagentTasks((prev) => {
            const targetIndex = prev.findIndex(item => item.runId === runId)
            if (targetIndex >= 0) {
              const next = [...prev]
              next[targetIndex] = {
                ...next[targetIndex],
                parentRunId,
                sessionKey,
                label,
                agentId,
                status: 'running',
                startedAt,
                endedAt: undefined,
                error: undefined,
              }
              return next
            }

            return [
              ...prev,
              {
                runId,
                parentRunId,
                sessionKey,
                label,
                agentId,
                status: 'running',
                startedAt,
              },
            ]
          })
        }

        if (phase === 'end' || phase === 'error' || phase === 'abort') {
          setSubagentTasks((prev) => {
            const nextStatus = phase === 'end' ? 'completed' : phase === 'error' ? 'error' : 'aborted'
            return prev.map(item => (item.runId === runId
              ? {
                ...item,
                status: nextStatus,
                endedAt: typeof data.endedAt === 'number' ? data.endedAt : Date.now(),
                error: phase === 'error' ? (toText(data.error) ?? item.error) : undefined,
              }
              : item))
          })
        }
      }

      if (phase === 'end' || phase === 'error' || phase === 'abort') {
        if (runId) {
          setMessagesBySession((prev) => {
            const list = prev[sessionKey] ?? []
            const nextList = patchAssistantMessageMeta(list, runId, null, 'agent', {
              messageState: phase === 'end' ? 'final' : phase === 'error' ? 'error' : 'aborted',
              stopReason: phase === 'abort' ? 'abort' : undefined,
              errorMessage: phase === 'error' ? (toText(data.error) ?? undefined) : undefined,
            })
            if (nextList === list) return prev
            return {
              ...prev,
              [sessionKey]: nextList,
            }
          })
        }
        setSessionTyping(sessionKey, false)
        const shouldSyncHistory = Boolean(
          runId
          && (
            runsWithAgentTextRef.current.has(runId)
            || runStreamSourceMap.has(runId)
          ),
        )
        if (shouldSyncHistory) void loadHistory(sessionKey)
        if (runId) {
          const streamSource = runStreamSourceMap.get(runId)
          if (streamSource !== 'chat') runToSessionRef.current.delete(runId)
          runStreamSourceMap.delete(runId)
          runsWithAgentTextRef.current.delete(runId)
          pendingStreamEventsRef.current.delete(runId)
        }
      }
      return
    }

    if (stream === 'tool' && data) {
      const phase = toToolCallPhase(data.phase)
      const toolCallId = toText(data.toolCallId)
      const toolName = toText(data.name) ?? 'unknown'
      if (!phase || !toolCallId) return
      mediaDebugLog('tool.event.received', {
        sessionKey,
        runId: runId ?? undefined,
        toolCallId,
        toolName,
        phase,
        payload: summarizeUnknownForDebug(data),
        result: summarizeUnknownForDebug(data.result),
        partialResult: summarizeUnknownForDebug(data.partialResult),
      })
      const toolMediaItems = extractMediaItemsFromUnknown(
        data.result ?? data.partialResult ?? data,
      )
      mediaDebugLog('tool.event.extracted', {
        sessionKey,
        runId: runId ?? undefined,
        toolCallId,
        toolName,
        phase,
        mediaCount: toolMediaItems.length,
        mediaItems: summarizeMediaItemsForDebug(toolMediaItems),
      })

      setMessagesBySession((prev) => {
        const list = prev[sessionKey] ?? []
        const next = [...list]
        let targetIndex = findAssistantMessageIndex(next, runId, null, 'agent')

        if (targetIndex < 0) {
          next.push({
            id: genId(),
            sessionKey,
            role: 'assistant',
            content: '',
            timestamp: Date.now(),
            runId: runId ?? undefined,
            streamSource: 'agent',
            messageState: 'streaming',
            toolCalls: [],
          })
          targetIndex = next.length - 1
        }

        const target = next[targetIndex]
        const nextToolCalls = patchToolCalls(target.toolCalls ?? [], phase, toolCallId, toolName, data)
        const fallbackMediaItems = buildReadToolPathFallbackMediaItems(
          nextToolCalls,
          toolCallId,
          toolName,
          phase,
          toolMediaItems,
        )
        if (fallbackMediaItems.length > 0) {
          mediaDebugLog('tool.event.fallback-path', {
            sessionKey,
            runId: runId ?? undefined,
            toolCallId,
            toolName,
            phase,
            fallbackMediaCount: fallbackMediaItems.length,
            fallbackMedia: summarizeMediaItemsForDebug(fallbackMediaItems),
          })
        }
        const mediaItemsWithFallback = mergeMediaItems(toolMediaItems, fallbackMediaItems)
        const mergedMediaItems = mergeMediaItems(target.mediaItems, mediaItemsWithFallback)

        next[targetIndex] = {
          ...target,
          runId: runId ?? target.runId,
          streamSource: target.streamSource ?? 'agent',
          toolCalls: nextToolCalls,
          ...(mergedMediaItems ? { mediaItems: mergedMediaItems } : {}),
        }

        return {
          ...prev,
          [sessionKey]: next,
        }
      })
    }
  }, [ensureSessionExists, loadHistory, queuePendingStreamEvent, registerRunSession, resolveStreamSessionKey, setSessionTyping])

  /**
   * 处理 chat 流式事件。
   * @param payload chat 事件载荷。
   */
  const handleChatEvent = useCallback((payload: Record<string, unknown>) => {
    const runId = toText(payload.runId)
    const sessionKey = resolveStreamSessionKey(payload, runId)
    if (!sessionKey) {
      if (runId) queuePendingStreamEvent(runId, 'chat', payload)
      return
    }

    ensureSessionExists(sessionKey)
    registerRunSession(runId, sessionKey)

    const runStreamSourceMap = runStreamSourceRef.current
    const state = toText(payload.state) ?? ''
    const extracted = extractContentFromChatEvent(payload)
    const text = extracted.text
    const mediaItems = extracted.mediaItems
    const messageId = extractMessageIdFromChatEvent(payload)
    const hasAgentText = Boolean(runId && runsWithAgentTextRef.current.has(runId))
    const messageRecord = isRecord(payload.message) ? payload.message : null
    const chatSpeakerMeta = extractMessageSpeakerMeta(messageRecord)

    mediaDebugLog('chat.event.received', {
      runId: runId ?? undefined,
      sessionKey,
      state,
      messageId: messageId ?? undefined,
      hasAgentText,
      rawMessage: summarizeMessageForDebug(messageRecord),
    })
    mediaDebugLog('chat.event.extracted', {
      runId: runId ?? undefined,
      sessionKey,
      state,
      messageId: messageId ?? undefined,
      textChars: text.length,
      mediaCount: mediaItems.length,
      mediaItems: summarizeMediaItemsForDebug(mediaItems),
    })

    if (state === 'delta' && text) {
      if (hasAgentText) {
        setSessionTyping(sessionKey, true)
        return
      }
      if (runId) {
        runStreamSourceMap.set(runId, 'chat')
      }
      setSessionTyping(sessionKey, true)
      setMessagesBySession((prev) => {
        const list = prev[sessionKey] ?? []
        return {
          ...prev,
          [sessionKey]: appendAssistantDelta(list, text, runId, sessionKey, messageId, 'chat', {
            speakerName: chatSpeakerMeta.speakerName,
            speakerAgentId: chatSpeakerMeta.speakerAgentId,
          }),
        }
      })
      return
    }

    if (state === 'final') {
      setSessionTyping(sessionKey, false)
      const stopReason = toText(payload.stopReason) ?? undefined
      const stateSource: AssistantStreamSource = hasAgentText ? 'agent' : 'chat'
      if (runId && !hasAgentText) {
        runStreamSourceMap.set(runId, 'chat')
      }
      setMessagesBySession((prev) => {
        const list = prev[sessionKey] ?? []
        const shouldApplyFinalBody = !hasAgentText && (Boolean(text) || mediaItems.length > 0)
        const nextWithBody = shouldApplyFinalBody
          ? applyAssistantFinal(list, text, runId, sessionKey, messageId, stateSource, {
            messageState: 'final',
            stopReason,
            errorMessage: undefined,
            mediaItems,
            speakerName: chatSpeakerMeta.speakerName,
            speakerAgentId: chatSpeakerMeta.speakerAgentId,
          })
          : patchAssistantMessageMeta(list, runId, messageId, stateSource, {
            messageState: 'final',
            stopReason,
            errorMessage: undefined,
          })
        const nextList = patchAssistantMessageMedia(
          nextWithBody,
          runId,
          messageId,
          stateSource,
          mediaItems,
        )
        if (nextList === list) return prev
        return {
          ...prev,
          [sessionKey]: nextList,
        }
      })

      const agentId = parseAgentIdFromSessionKey(sessionKey)
      if (agentId) {
        void refreshSessions(agentId, { showLoading: false })
      }
      void loadHistory(sessionKey)
      if (runId) {
        runToSessionRef.current.delete(runId)
        runStreamSourceMap.delete(runId)
        runsWithAgentTextRef.current.delete(runId)
        pendingStreamEventsRef.current.delete(runId)
      }
      return
    }

    if (state === 'aborted') {
      setSessionTyping(sessionKey, false)
      const stateSource: AssistantStreamSource = hasAgentText ? 'agent' : 'chat'
      setMessagesBySession((prev) => {
        const list = prev[sessionKey] ?? []
        const nextList = patchAssistantMessageMeta(list, runId, messageId, stateSource, {
          messageState: 'aborted',
          stopReason: 'abort',
          errorMessage: undefined,
        })
        if (nextList === list) return prev
        return {
          ...prev,
          [sessionKey]: nextList,
        }
      })
      if (runId) {
        runToSessionRef.current.delete(runId)
        runStreamSourceMap.delete(runId)
        runsWithAgentTextRef.current.delete(runId)
        pendingStreamEventsRef.current.delete(runId)
      }
      return
    }

    if (state === 'error') {
      setSessionTyping(sessionKey, false)
      const errorText = toText(payload.errorMessage) ?? 'chat stream failed'
      const stateSource: AssistantStreamSource = hasAgentText ? 'agent' : 'chat'
      setMessagesBySession((prev) => {
        const list = prev[sessionKey] ?? []
        const nextList = patchAssistantMessageMeta(list, runId, messageId, stateSource, {
          messageState: 'error',
          stopReason: 'error',
          errorMessage: errorText,
        })
        if (nextList === list) return prev
        return {
          ...prev,
          [sessionKey]: nextList,
        }
      })
      appendSystemMessage(sessionKey, `[Error] ${errorText}`)
      if (runId) {
        runToSessionRef.current.delete(runId)
        runStreamSourceMap.delete(runId)
        runsWithAgentTextRef.current.delete(runId)
        pendingStreamEventsRef.current.delete(runId)
      }
    }
  }, [appendSystemMessage, ensureSessionExists, loadHistory, queuePendingStreamEvent, refreshSessions, registerRunSession, resolveStreamSessionKey, setSessionTyping])

  /**
   * 同步 agent 事件处理器到 ref。
   */
  useEffect(() => {
    handleAgentEventRef.current = handleAgentEvent
  }, [handleAgentEvent])

  /**
   * 同步 chat 事件处理器到 ref。
   */
  useEffect(() => {
    handleChatEventRef.current = handleChatEvent
  }, [handleChatEvent])

  /**
   * 刷新 agent 列表并恢复当前焦点。
   */
  const refreshAgents = useCallback(async () => {
    const payload = await callRpc<AgentsListPayload>('agents.list', {})
    const mainKey = toText(payload.mainKey)?.toLowerCase() ?? DEFAULT_MAIN_KEY
    mainKeyRef.current = mainKey

    const rawAgents = Array.isArray(payload.agents) ? payload.agents : []
    const nextAgents = rawAgents
      .map(item => normalizeAgent(item))
      .filter((item): item is Agent => Boolean(item))

    setAgents(nextAgents)

    const defaultId = toText(payload.defaultId)
    const keepId = focusedAgentIdRef.current
    const targetAgentId = keepId && nextAgents.some(agent => agent.id === keepId)
      ? keepId
      : (defaultId ?? nextAgents[0]?.id ?? null)

    setFocusedAgentId(targetAgentId)

    if (!targetAgentId) {
      setFocusedSessionKey(null)
      return
    }

    const existingSessionKey = focusedSessionKeyRef.current
    const keepSession = Boolean(
      existingSessionKey && parseAgentIdFromSessionKey(existingSessionKey) === targetAgentId,
    )
    const targetSessionKey = keepSession
      ? (existingSessionKey as string)
      : buildAgentMainSessionKey(targetAgentId, mainKey)

    setFocusedSessionKey(targetSessionKey)
    ensureSessionExists(targetSessionKey)
    await Promise.all([
      refreshSessions(targetAgentId),
      loadHistory(targetSessionKey),
    ])
  }, [callRpc, ensureSessionExists, loadHistory, refreshSessions])

  /**
   * 选择 Agent。
   * @param agentId 目标 agent id。
   */
  const focusAgent = useCallback((agentId: string) => {
    setFocusedAgentId(agentId)

    const currentSession = focusedSessionKeyRef.current
    const canKeepCurrent = Boolean(
      currentSession && parseAgentIdFromSessionKey(currentSession) === agentId,
    )

    const existingList = sessionsByAgentRef.current[agentId] ?? []
    const fallbackSession = existingList[0]?.key ?? buildAgentMainSessionKey(agentId, mainKeyRef.current)
    const targetSessionKey = canKeepCurrent ? (currentSession as string) : fallbackSession

    setFocusedSessionKey(targetSessionKey)
    ensureSessionExists(targetSessionKey)
    void Promise.all([
      refreshSessions(agentId),
      loadHistory(targetSessionKey),
    ])
  }, [ensureSessionExists, loadHistory, refreshSessions])

  /**
   * 选择会话。
   * @param sessionKey 会话 key。
   */
  const focusSession = useCallback((sessionKey: string) => {
    setFocusedSessionKey(sessionKey)
    const agentId = parseAgentIdFromSessionKey(sessionKey)
    if (agentId) setFocusedAgentId(agentId)
    ensureSessionExists(sessionKey)
    void loadHistory(sessionKey)
  }, [ensureSessionExists, loadHistory])

  /**
   * 发送消息到指定会话。
   * @param sessionKey 目标会话 key。
   * @param text 用户输入文本。
   * @param attachments 原始附件列表。
   * @param wireMessage 实际发送到网关的文本。
   * @param wireAttachments 实际发送到网关的附件。
   */
  const sendMessageToSession = useCallback(async (
    sessionKey: string,
    text: string,
    attachments?: ChatAttachment[],
    wireMessage?: string,
    wireAttachments?: ChatAttachment[],
  ) => {
    const trimmedSessionKey = sessionKey.trim()
    const trimmed = text.trim()
    if (!trimmedSessionKey || (!trimmed && !(attachments && attachments.length > 0))) return

    const hasAttachments = attachments && attachments.length > 0
    const messageId = genId()
    const messageTimestamp = Date.now()

    setMessagesBySession((prev) => {
      const list = prev[trimmedSessionKey] ?? []
      const userMessage: ChatMessage = {
        id: messageId,
        sessionKey: trimmedSessionKey,
        role: 'user',
        content: trimmed,
        timestamp: messageTimestamp,
        ...(hasAttachments ? { attachments } : {}),
      }
      return {
        ...prev,
        [trimmedSessionKey]: [...list, userMessage],
      }
    })
    setSessionTyping(trimmedSessionKey, true)
    ensureSessionExists(trimmedSessionKey)
    if (hasAttachments) {
      persistSessionAttachments({
        sessionKey: trimmedSessionKey,
        messageId,
        role: 'user',
        content: trimmed,
        timestamp: messageTimestamp,
        attachments,
      })
    }
    setActiveSendCount((prev) => prev + 1)

    try {
      try {
        await ensureSessionToolVerboseFull(trimmedSessionKey)
      } catch (verbosePatchError) {
        mediaDebugLog('sessions.patch.verboseLevel.failed', {
          sessionKey: trimmedSessionKey,
          error: toErrorText(verbosePatchError),
        })
      }

      const rpcParams: Record<string, unknown> = {
        sessionKey: trimmedSessionKey,
        message: wireMessage?.trim() || trimmed,
        idempotencyKey: genId(),
      }
      if (hasAttachments) {
        const rpcAttachments = wireAttachments ?? attachments
        if (rpcAttachments && rpcAttachments.length > 0) {
          rpcParams.attachments = rpcAttachments
        }
      }

      mediaDebugLog('chat.send.request', {
        sessionKey: trimmedSessionKey,
        messageChars: (rpcParams.message as string).length,
        attachmentCount: Array.isArray(rpcParams.attachments) ? rpcParams.attachments.length : 0,
        attachments: summarizeAttachmentsForDebug((rpcParams.attachments as ChatAttachment[] | undefined)),
      })

      const payload = await callRpc<ChatSendPayload>('chat.send', rpcParams)
      const runId = toText(payload.runId)
      mediaDebugLog('chat.send.response', {
        sessionKey: trimmedSessionKey,
        runId: runId ?? undefined,
      })
      registerRunSession(runId, trimmedSessionKey)
    } catch (sendError) {
      appendSystemMessage(trimmedSessionKey, `[Error] ${toErrorText(sendError)}`)
      setSessionTyping(trimmedSessionKey, false)
    } finally {
      setActiveSendCount((prev) => Math.max(0, prev - 1))
    }
  }, [appendSystemMessage, callRpc, ensureSessionExists, ensureSessionToolVerboseFull, registerRunSession, setSessionTyping])

  /**
   * 发送消息到当前会话。
   * @param text 用户输入文本。
   * @param attachments 图片附件列表。
   * @param wireMessage 实际发送到网关的文本。
   * @param wireAttachments 实际发送到网关的附件。
   */
  const sendMessage = useCallback(async (
    text: string,
    attachments?: ChatAttachment[],
    wireMessage?: string,
    wireAttachments?: ChatAttachment[],
  ) => {
    const sessionKey = focusedSessionKeyRef.current
    if (!sessionKey) return
    await sendMessageToSession(sessionKey, text, attachments, wireMessage, wireAttachments)
  }, [sendMessageToSession])

  /**
   * 创建 Agent。
   * @param name Agent 名称。
   * @param workspace 工作目录。
   */
  const createAgent = useCallback(async (name: string, workspace: string) => {
    const trimmedName = name.trim()
    const trimmedWorkspace = workspace.trim()
    if (!trimmedName || !trimmedWorkspace) {
      throw new Error('Agent 名称和 workspace 不能为空')
    }

    const payload = await callRpc<Record<string, unknown>>('agents.create', {
      name: trimmedName,
      workspace: trimmedWorkspace,
    })

    await refreshAgents()

    const createdAgentId = toText(payload.agentId)
    if (createdAgentId) {
      focusAgent(createdAgentId)
    }
  }, [callRpc, focusAgent, refreshAgents])

  /**
   * 重命名 Agent。
   * @param agentId agent id。
   * @param name 新名称。
   */
  const renameAgent = useCallback(async (agentId: string, name: string) => {
    const trimmedName = name.trim()
    if (!trimmedName) throw new Error('名称不能为空')
    await callRpc('agents.update', { agentId, name: trimmedName })
    await refreshAgents()
  }, [callRpc, refreshAgents])

  /**
   * 删除 Agent。
   * @param agentId agent id。
   */
  const deleteAgent = useCallback(async (agentId: string) => {
    await callRpc('agents.delete', { agentId })

    setSessionsByAgent((prev) => {
      const next = { ...prev }
      delete next[agentId]
      return next
    })

    setMessagesBySession((prev) => {
      const next: Record<string, ChatMessage[]> = {}
      for (const [key, list] of Object.entries(prev)) {
        if (parseAgentIdFromSessionKey(key) !== agentId) {
          next[key] = list
        }
      }
      return next
    })

    setTypingBySession((prev) => {
      const next: Record<string, boolean> = {}
      for (const [key, typing] of Object.entries(prev)) {
        if (parseAgentIdFromSessionKey(key) !== agentId) {
          next[key] = typing
        }
      }
      return next
    })

    await refreshAgents()
  }, [callRpc, refreshAgents])

  /**
   * 创建一个未聚焦的新会话。
   * @param agentId 归属 Agent id。
   */
  const createDetachedSession = useCallback((agentId: string) => {
    const newSessionKey = buildNewSessionKey(agentId)
    ensureSessionExists(newSessionKey)
    setMessagesBySession(prev => ({ ...prev, [newSessionKey]: [] }))
    setSessionTyping(newSessionKey, false)
    void loadHistory(newSessionKey)
    return newSessionKey
  }, [ensureSessionExists, loadHistory, setSessionTyping])

  /**
   * 新建当前 Agent 会话（保留原会话历史）。
   */
  const resetFocusedSession = useCallback(async () => {
    const focusedSessionKey = focusedSessionKeyRef.current
    const agentId = focusedAgentIdRef.current
      ?? (focusedSessionKey ? parseAgentIdFromSessionKey(focusedSessionKey) : null)
    if (!agentId) return

    const newSessionKey = createDetachedSession(agentId)
    setFocusedSessionKey(newSessionKey)
  }, [createDetachedSession])

  /**
   * 删除指定会话。
   * @param sessionKey 会话 key。
   */
  const deleteSession = useCallback(async (sessionKey: string) => {
    await callRpc('sessions.delete', {
      key: sessionKey,
      deleteTranscript: true,
    })

    const agentId = parseAgentIdFromSessionKey(sessionKey)
    if (!agentId) return

    setSessionsByAgent((prev) => {
      const current = prev[agentId] ?? []
      const nextList = current.filter(item => item.key !== sessionKey)
      return { ...prev, [agentId]: nextList }
    })

    setMessagesBySession((prev) => {
      const next = { ...prev }
      delete next[sessionKey]
      return next
    })
    clearSessionAttachments(sessionKey)

    setTypingBySession((prev) => {
      const next = { ...prev }
      delete next[sessionKey]
      return next
    })

    const isDeletedFocused = focusedSessionKeyRef.current === sessionKey
    if (isDeletedFocused) {
      const list = sessionsByAgentRef.current[agentId] ?? []
      const nextSession = list.find(item => item.key !== sessionKey)?.key
        ?? buildAgentMainSessionKey(agentId, mainKeyRef.current)
      setFocusedSessionKey(nextSession)
      ensureSessionExists(nextSession)
      await loadHistory(nextSession)
    }

    await refreshSessions(agentId)
  }, [callRpc, ensureSessionExists, loadHistory, refreshSessions])

  /**
   * 修改指定会话模型。
   * @param sessionKey 目标会话 key。
   * @param model 模型名称，为 null 表示清空覆盖。
   */
  const patchSessionModel = useCallback(async (sessionKey: string, model: string | null) => {
    const trimmedSessionKey = sessionKey.trim()
    if (!trimmedSessionKey) return
    await callRpc('sessions.patch', {
      key: trimmedSessionKey,
      model: model && model.trim() ? model.trim() : null,
    })
    const agentId = parseAgentIdFromSessionKey(trimmedSessionKey)
    if (agentId) await refreshSessions(agentId)
  }, [callRpc, refreshSessions])

  /**
   * 修改当前会话模型。
   * @param model 模型名称，为 null 表示清空覆盖。
   */
  const patchFocusedSessionModel = useCallback(async (model: string | null) => {
    const sessionKey = focusedSessionKeyRef.current
    if (!sessionKey) return
    await patchSessionModel(sessionKey, model)
  }, [patchSessionModel])

  /**
   * 修改当前会话思考级别。
   * @param thinkingLevel 思考级别，为 null 表示清空覆盖。
   */
  const patchFocusedSessionThinkingLevel = useCallback(async (thinkingLevel: string | null) => {
    const sessionKey = focusedSessionKeyRef.current
    if (!sessionKey) return
    await callRpc('sessions.patch', {
      key: sessionKey,
      thinkingLevel: thinkingLevel && thinkingLevel.trim() ? thinkingLevel.trim() : null,
    })
    const agentId = parseAgentIdFromSessionKey(sessionKey)
    if (agentId) await refreshSessions(agentId)
  }, [callRpc, refreshSessions])

  /**
   * 重命名指定会话。
   * @param sessionKey 会话 key。
   * @param label 新会话名称。
   */
  const renameSession = useCallback(async (sessionKey: string, label: string) => {
    const trimmedLabel = label.trim()
    if (!trimmedLabel) {
      throw new Error('会话名称不能为空')
    }

    await callRpc('sessions.patch', {
      key: sessionKey,
      label: trimmedLabel,
    })

    const agentId = parseAgentIdFromSessionKey(sessionKey)
    if (agentId) {
      await refreshSessions(agentId)
    }
  }, [callRpc, refreshSessions])

  /**
   * 中止指定会话生成。
   * @param sessionKey 目标会话 key。
   */
  const abortSession = useCallback(async (sessionKey: string) => {
    const trimmedSessionKey = sessionKey.trim()
    if (!trimmedSessionKey) return
    await callRpc('chat.abort', { sessionKey: trimmedSessionKey })
    setSessionTyping(trimmedSessionKey, false)
  }, [callRpc, setSessionTyping])

  /**
   * 中止当前会话生成。
   */
  const abortFocusedSession = useCallback(async () => {
    const sessionKey = focusedSessionKeyRef.current
    if (!sessionKey) return
    await abortSession(sessionKey)
  }, [abortSession])

  /**
   * 终止子代理任务。
   * @param sessionKey 子代理会话 key。
   */
  const abortSubagent = useCallback(async (sessionKey: string) => {
    await callRpc('chat.abort', { sessionKey })
  }, [callRpc])

  /**
   * 清理已完成子代理任务。
   */
  const clearCompletedSubagents = useCallback(() => {
    setSubagentTasks(prev => prev.filter(item => item.status === 'running'))
  }, [])

  /**
   * 响应执行审批请求。
   * @param requestId 审批请求 id。
   * @param approved 是否批准。
   */
  const respondApproval = useCallback(async (requestId: string, approved: boolean) => {
    try {
      await callRpc('exec.approval.respond', { requestId, approved })
    } finally {
      setPendingApprovals(prev => prev.filter(item => item.requestId !== requestId))
    }
  }, [callRpc])

  /**
   * 关闭更新通知。
   */
  const dismissUpdateNotification = useCallback(() => {
    setUpdateNotification(null)
  }, [])

  /**
   * 刷新 Gateway 健康信息。
   */
  const refreshHealth = useCallback(async () => {
    const payload = await callRpc<Record<string, unknown>>('health', {})
    setGatewayHealth((prev) => {
      const nextVersion = toText(payload.version) ?? prev?.version
      const nextProtocol = typeof payload.protocol === 'number' ? payload.protocol : prev?.protocol
      const nextMethods = toTextArray(payload.methods) ?? prev?.features?.methods
      const nextEvents = toTextArray(payload.events) ?? prev?.features?.events
      return {
        ok: payload.ok !== false,
        version: nextVersion ?? undefined,
        protocol: nextProtocol,
        uptimeMs: typeof payload.uptimeMs === 'number' ? payload.uptimeMs : prev?.uptimeMs,
        features: {
          methods: nextMethods,
          events: nextEvents,
        },
      }
    })
  }, [callRpc])

  /**
   * 刷新在线设备列表。
   */
  const refreshPresence = useCallback(async () => {
    const payload = await callRpc<Record<string, unknown>>('system-presence', {})
    const list = Array.isArray(payload.presence)
      ? payload.presence.map(item => normalizePresenceEntry(item)).filter((item): item is PresenceEntry => item !== null)
      : []
    setPresenceList(list)
  }, [callRpc])

  /**
   * 拉取日志尾部（支持基于 cursor 增量读取）。
   * @param params logs.tail 请求参数。
   */
  const tailLogs = useCallback(async (params: LogsTailParams = {}): Promise<LogsTailResult> => {
    const payload = await callRpc<Record<string, unknown>>('logs.tail', {
      cursor: toText(params.cursor) ?? undefined,
      limit: toNumber(params.limit) ?? undefined,
      maxBytes: toNumber(params.maxBytes) ?? undefined,
    })

    return {
      file: toText(payload.file) ?? undefined,
      cursor: toText(payload.cursor) ?? undefined,
      size: toNumber(payload.size) ?? undefined,
      lines: toLogLines(payload.lines) ?? [],
      truncated: payload.truncated === true,
      reset: payload.reset === true,
    }
  }, [callRpc])

  /**
   * 读取指定 Agent 的记忆文件并映射为记忆条目。
   * @param agentId agent id。
   */
  const loadMemoryEntriesFromAgentFiles = useCallback(async (agentId: string) => {
    const payload = await callRpc<{ files?: unknown[] }>('agents.files.list', { agentId })
    const rawFiles = Array.isArray(payload.files) ? payload.files : []
    const memoryFiles = rawFiles
      .map(item => normalizeAgentWorkspaceFile(item))
      .filter((item): item is AgentWorkspaceFile => item !== null && isMemoryFileName(item.name))

    if (memoryFiles.length === 0) {
      return []
    }

    const detailedEntries = await Promise.all(memoryFiles.map(async (file) => {
      try {
        const detailPayload = await callRpc<{ file?: unknown }>('agents.files.get', {
          agentId,
          name: file.name,
        })
        const detailFile = normalizeAgentWorkspaceFile(detailPayload.file)
        return buildMemoryEntryFromFile(agentId, detailFile ?? file)
      } catch {
        return buildMemoryEntryFromFile(agentId, file)
      }
    }))

    return detailedEntries
      .filter((item): item is MemoryEntry => item !== null)
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
  }, [callRpc])

  /**
   * 搜索记忆条目。
   * @param query 搜索关键词。
   * @param agentId 可选 agent id。
   * @param limit 数量上限。
   */
  const searchMemory = useCallback(async (query: string, agentId?: string, limit?: number) => {
    const keyword = query.trim()
    if (!keyword || !agentId) return []
    const rows = await loadMemoryEntriesFromAgentFiles(agentId)
    return rows
      .filter((item) => {
        const contentMatched = item.content.toLowerCase().includes(keyword.toLowerCase())
        const tagMatched = item.tags?.some(tag => tag.toLowerCase().includes(keyword.toLowerCase())) ?? false
        return contentMatched || tagMatched
      })
      .map(item => ({
        ...item,
        relevanceScore: computeMemoryRelevance(item.content, keyword),
      }))
      .slice(0, Math.max(1, limit ?? 20))
  }, [loadMemoryEntriesFromAgentFiles])

  /**
   * 分页读取记忆条目。
   * @param agentId 可选 agent id。
   * @param limit 分页大小。
   * @param offset 分页偏移。
   */
  const listMemory = useCallback(async (agentId?: string, limit?: number, offset?: number) => {
    if (!agentId) {
      return {
        entries: [],
        total: 0,
      }
    }
    const allEntries = await loadMemoryEntriesFromAgentFiles(agentId)
    const safeLimit = Math.max(1, limit ?? 50)
    const safeOffset = Math.max(0, offset ?? 0)
    const entries = allEntries.slice(safeOffset, safeOffset + safeLimit)

    return {
      entries,
      total: allEntries.length,
    }
  }, [loadMemoryEntriesFromAgentFiles])

  /**
   * 清空指定记忆文件内容。
   * @param id 记忆 id。
   */
  const deleteMemory = useCallback(async (id: string) => {
    const parsed = parseMemoryEntryId(id)
    if (!parsed) {
      throw new Error('仅支持清空 MEMORY.md / memory.md 文件内容')
    }
    await callRpc('agents.files.set', {
      agentId: parsed.agentId,
      name: parsed.fileName,
      content: '',
    })
  }, [callRpc])

  /**
   * 读取 Cron 任务列表。
   */
  const listCronJobs = useCallback(async () => {
    let payload: { jobs?: unknown[] }
    try {
      payload = await callRpc<{ jobs?: unknown[] }>('cron.list', {
        includeDisabled: true,
      })
    } catch (error) {
      const errorText = toErrorText(error)
      if (!errorText.includes('invalid cron.list params')) {
        throw error
      }
      payload = await callRpc<{ jobs?: unknown[] }>('cron.list', {})
    }

    const jobs = Array.isArray(payload.jobs) ? payload.jobs : []
    return jobs
      .map(item => normalizeCronJob(item))
      .filter((item): item is CronJob => item !== null)
  }, [callRpc])

  /**
   * 新增 Cron 任务。
   * @param config 任务配置。
   */
  const addCronJob = useCallback(async (config: CronJobConfig) => {
    const payload = await callRpc<{ jobId?: unknown, id?: unknown }>('cron.add', buildCronAddPayload(config))
    return toText(payload.jobId) ?? toText(payload.id)
  }, [callRpc])

  /**
   * 更新 Cron 任务。
   * @param jobId 任务 id。
   * @param patch 变更字段。
   */
  const updateCronJob = useCallback(async (jobId: string, patch: Partial<CronJobConfig>) => {
    const normalizedPatch = buildCronUpdatePatch(patch)
    if (Object.keys(normalizedPatch).length === 0) return

    await callRpc('cron.update', {
      jobId,
      patch: normalizedPatch,
    })
  }, [callRpc])

  /**
   * 删除 Cron 任务。
   * @param jobId 任务 id。
   */
  const removeCronJob = useCallback(async (jobId: string) => {
    await callRpc('cron.remove', { jobId })
  }, [callRpc])

  /**
   * 手动运行 Cron 任务。
   * @param jobId 任务 id。
   */
  const runCronJob = useCallback(async (jobId: string) => {
    await callRpc('cron.run', { jobId })
  }, [callRpc])

  /**
   * 查询 Cron 运行历史。
   * @param jobId 可选任务 id。
   * @param limit 返回数量。
   */
  const listCronRuns = useCallback(async (jobId?: string, limit?: number) => {
    const fetchRunsByJobId = async (targetJobId: string) => {
      try {
        return await callRpc<unknown>('cron.runs', { jobId: targetJobId })
      } catch (error) {
        const errorText = toErrorText(error)
        const needIdFallback = errorText.includes('required property \'id\'')
          || errorText.includes('missing id')
          || errorText.includes('unexpected property \'jobId\'')
        if (!needIdFallback) throw error
        return await callRpc<unknown>('cron.runs', { id: targetJobId })
      }
    }

    const normalizeRuns = (payload: unknown): CronRunRecord[] => extractCronRunsPayload(payload)
      .map(item => normalizeCronRun(item))
      .filter((item): item is CronRunRecord => item !== null)

    const safeLimit = Math.max(1, limit ?? 20)
    if (jobId) {
      const payload = await fetchRunsByJobId(jobId)
      return normalizeRuns(payload).slice(0, safeLimit)
    }

    const jobs = await listCronJobs()
    if (jobs.length === 0) return []

    const runsByJobs = await Promise.all(jobs.map(async (job) => {
      try {
        const payload = await fetchRunsByJobId(job.jobId)
        return normalizeRuns(payload)
      } catch {
        return []
      }
    }))

    return runsByJobs
      .flat()
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, safeLimit)
  }, [callRpc, listCronJobs])

  /**
   * 设置 Cron 事件回调。
   * @param callback 事件回调函数。
   */
  const onCronEvent = useCallback((callback: ((event: Record<string, unknown>) => void) | null) => {
    cronEventCallbackRef.current = callback
  }, [])

  /**
   * WebSocket 生命周期。
   * @param wsUrl 连接地址。
   */
  useEffect(() => {
    disposedRef.current = false
    handshakeReadyRef.current = false
    setIsConnected(false)
    setError(null)
    resetServerScopedState()
    const runSessionMap = runToSessionRef.current
    const runStreamSourceMap = runStreamSourceRef.current
    const pendingStreamEventsMap = pendingStreamEventsRef.current
    const runsWithAgentText = runsWithAgentTextRef.current
    const normalizedUrl = url.trim()

    if (!normalizedUrl) {
      rejectAllPending('未配置服务器')
      runSessionMap.clear()
      runStreamSourceMap.clear()
      pendingStreamEventsMap.clear()
      runsWithAgentText.clear()
      connectReqIdRef.current = null
      shutdownRef.current = null
      setShutdownNotification(null)
      setUpdateNotification(null)
      setGatewayHealth(null)
      setPresenceList([])
      setSubagentTasks([])
      return () => {
        disposedRef.current = true
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current)
          reconnectTimerRef.current = null
        }
        handshakeReadyRef.current = false
        if (wsRef.current) {
          wsRef.current.onclose = null
          wsRef.current.close()
          wsRef.current = null
        }
        setIsConnected(false)
        setActiveSendCount(0)
        setPendingApprovals([])
        shutdownRef.current = null
        setShutdownNotification(null)
        setUpdateNotification(null)
        setGatewayHealth(null)
        setPresenceList([])
        setSubagentTasks([])
        resetServerScopedState()
      }
    }
    runStreamSourceMap.clear()
    pendingStreamEventsMap.clear()
    runsWithAgentText.clear()

    /**
     * 安排重连。
     */
    function scheduleReconnect() {
      if (disposedRef.current) return
      const plannedDelay = shutdownRef.current?.restartExpectedMs
      const delay = typeof plannedDelay === 'number'
        ? Math.min(Math.max(plannedDelay + 2000, RECONNECT_INTERVAL), 30000)
        : RECONNECT_INTERVAL
      reconnectTimerRef.current = setTimeout(() => {
        if (disposedRef.current) return
        createConnection()
      }, delay)
    }

    /**
     * 创建 WebSocket 连接。
     */
    function createConnection() {
      if (disposedRef.current) return

      let ws: WebSocket
      try {
        ws = new WebSocket(normalizedUrl)
      } catch (connectError) {
        setError(`WebSocket 地址无效: ${toErrorText(connectError)}`)
        scheduleReconnect()
        return
      }

      ws.onopen = () => {
        if (disposedRef.current) {
          ws.close()
        }
      }

      ws.onclose = (closeEvent) => {
        const wasHandshakeReady = handshakeReadyRef.current
        const clientCloseError = clientCloseErrorRef.current
        clientCloseErrorRef.current = null
        const closeCode = closeEvent.code
        const closeReason = closeEvent.reason?.trim() ?? ''

        handshakeReadyRef.current = false
        connectReqIdRef.current = null
        setIsConnected(false)
        setActiveSendCount(0)
        setPendingApprovals([])
        runSessionMap.clear()
        runStreamSourceMap.clear()
        pendingStreamEventsMap.clear()
        runsWithAgentText.clear()
        setGatewayHealth(null)
        setPresenceList([])
        setSubagentTasks([])
        rejectAllPending('连接已关闭')

        if (!wasHandshakeReady) {
          if (clientCloseError) {
            setError(clientCloseError)
          } else if (closeReason) {
            setError(enhanceHandshakeError(closeReason, currentDeviceIdRef.current, normalizedUrl))
          } else if (closeCode > 0) {
            setError(`WebSocket 连接已关闭（code=${closeCode}）`)
          }
        }

        scheduleReconnect()
      }

      ws.onerror = () => {
        setError('WebSocket 连接错误')
      }

      ws.onmessage = (event: MessageEvent<string | ArrayBuffer | Blob>) => {
        if (typeof event.data !== 'string') return
        const frame = parseFrame(event.data)
        if (!frame) return

        if (frame.type === 'event' && frame.event === 'proxy.error' && isRecord(frame.payload)) {
          const proxyErrorText = toText(frame.payload.message) ?? 'WebSocket 代理连接失败'
          setError(proxyErrorText)
          return
        }

        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          const nonce = isRecord(frame.payload) ? toText(frame.payload.nonce) ?? '' : ''
          const connectReqId = genId()
          connectReqIdRef.current = connectReqId

          void buildSignedConnectFrame(normalizedUrl, connectReqId, nonce)
            .then(result => {
              if (!result) {
                const errorText = 'URL 缺少 token，无法握手'
                setError(errorText)
                clientCloseErrorRef.current = errorText
                ws.close(1000, 'missing token')
                return
              }
              currentDeviceIdRef.current = result.deviceId
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify(result.frame))
              }
            })
            .catch(err => {
              const errorText = `设备身份初始化失败: ${toErrorText(err)}`
              setError(errorText)
              clientCloseErrorRef.current = errorText
              ws.close(1000, 'device identity error')
            })
          return
        }

        if (frame.type === 'res' && frame.id === connectReqIdRef.current) {
          if (!frame.ok) {
            const rawErrorText = frame.error?.message ?? '握手失败'
            const errorText = enhanceHandshakeError(rawErrorText, currentDeviceIdRef.current, normalizedUrl, frame.error)

            if (rawErrorText.toLowerCase().includes('device token mismatch')) {
              // 设备令牌不匹配时自动清除本地旧令牌，等待重连重新获取。
              void loadOrCreateDeviceIdentity()
                .then(identity => clearDeviceToken(identity.deviceId, CLIENT_ROLE))
                .catch(() => { /* 静默 */ })
            }

            setError(errorText)
            clientCloseErrorRef.current = errorText
            ws.close(1000, 'handshake failed')
            return
          }

          handshakeReadyRef.current = true
          setIsConnected(true)
          setError(null)
          shutdownRef.current = null
          setShutdownNotification(null)

          if (isRecord(frame.payload)) {
            const payload = frame.payload as HelloOkPayload
            const mainSessionKey = toText(payload.snapshot?.sessionDefaults?.mainSessionKey)
            if (mainSessionKey) {
              const mainFromHello = mainSessionKey.split(':').at(-1)
              mainKeyRef.current = toText(mainFromHello)?.toLowerCase() ?? DEFAULT_MAIN_KEY
            }

            // 存储网关颁发的 deviceToken
            if (payload.auth?.deviceToken) {
              void loadOrCreateDeviceIdentity().then(identity => {
                void storeDeviceToken(identity.deviceId, 'operator', payload.auth!.deviceToken!)
              }).catch(() => { /* 静默 */ })
            }

            setGatewayHealth({
              ok: payload.snapshot?.health?.ok !== false,
              version: toText(payload.server?.version) ?? undefined,
              protocol: typeof payload.server?.protocol === 'number' ? payload.server.protocol : undefined,
              uptimeMs: typeof payload.snapshot?.uptimeMs === 'number' ? payload.snapshot.uptimeMs : undefined,
              features: {
                methods: toTextArray(payload.features?.methods),
                events: toTextArray(payload.features?.events),
              },
            })

            const presenceEntries = Array.isArray(payload.snapshot?.presence)
              ? payload.snapshot.presence
                .map(item => normalizePresenceEntry(item))
                .filter((item): item is PresenceEntry => item !== null)
              : []
            setPresenceList(presenceEntries)
          }

          void refreshAgents().catch((loadError) => {
            setError(toErrorText(loadError))
          })
          return
        }

        if (frame.type === 'res') {
          const pending = pendingReqRef.current.get(frame.id)
          if (!pending) return

          pendingReqRef.current.delete(frame.id)
          if (!frame.ok) {
            const errorText = frame.error?.message ?? `${pending.method} 调用失败`
            pending.reject(buildRpcError(errorText, frame.error))
            return
          }

          pending.resolve(frame.payload)
          return
        }

        if (frame.type === 'event' && frame.event === 'agent' && isRecord(frame.payload)) {
          handleAgentEvent(frame.payload)
          return
        }
        if (frame.type === 'event' && frame.event === 'chat' && isRecord(frame.payload)) {
          handleChatEvent(frame.payload)
          return
        }
        if (frame.type === 'event' && frame.event === 'presence' && isRecord(frame.payload)) {
          const list = Array.isArray(frame.payload.presence)
            ? frame.payload.presence
              .map(item => normalizePresenceEntry(item))
              .filter((item): item is PresenceEntry => item !== null)
            : []
          setPresenceList(list)
          return
        }

        if (frame.type === 'event' && frame.event === 'health' && isRecord(frame.payload)) {
          const payload = frame.payload
          setGatewayHealth((prev) => {
            const nextFeatures = prev?.features
            return {
              ok: payload.ok !== false,
              version: toText(payload.version) ?? prev?.version,
              protocol: typeof payload.protocol === 'number' ? payload.protocol : prev?.protocol,
              uptimeMs: typeof payload.uptimeMs === 'number' ? payload.uptimeMs : prev?.uptimeMs,
              features: nextFeatures,
            }
          })
          return
        }

        if (frame.type === 'event' && frame.event === 'cron' && isRecord(frame.payload)) {
          cronEventCallbackRef.current?.(frame.payload)
          return
        }

        if (frame.type === 'event' && frame.event === 'exec.approval.requested' && isRecord(frame.payload)) {
          const payload = frame.payload
          const requestId = toText(payload.requestId)
          if (!requestId) return

          const request: ExecApprovalRequest = {
            requestId,
            sessionKey: toText(payload.sessionKey) ?? '',
            runId: toText(payload.runId) ?? '',
            toolName: toText(payload.toolName) ?? 'unknown',
            description: toText(payload.description) ?? '',
            args: isRecord(payload.args) ? payload.args : {},
            riskLevel: toExecRiskLevel(payload.riskLevel),
            timeout: typeof payload.timeout === 'number' ? payload.timeout : undefined,
            receivedAt: Date.now(),
          }

          setPendingApprovals((prev) => {
            const next = prev.filter(item => item.requestId !== request.requestId)
            next.push(request)
            return next
          })
          return
        }

        if (frame.type === 'event' && frame.event === 'exec.approval.resolved' && isRecord(frame.payload)) {
          const resolvedId = toText(frame.payload.requestId)
          if (!resolvedId) return
          setPendingApprovals(prev => prev.filter(item => item.requestId !== resolvedId))
          return
        }

        if (frame.type === 'event' && frame.event === 'shutdown' && isRecord(frame.payload)) {
          const payload = frame.payload
          const notice: ShutdownNotification = {
            reason: toText(payload.reason) ?? 'unknown',
            restartExpectedMs: typeof payload.restartExpectedMs === 'number'
              ? payload.restartExpectedMs
              : undefined,
            message: toText(payload.message) ?? undefined,
            receivedAt: Date.now(),
          }
          shutdownRef.current = notice
          setShutdownNotification(notice)
          return
        }

        if (frame.type === 'event' && frame.event === 'update.available' && isRecord(frame.payload)) {
          const payload = frame.payload
          if (payload.updateAvailable === true) {
            setUpdateNotification({
              currentVersion: toText(payload.currentVersion) ?? undefined,
              newVersion: toText(payload.newVersion) ?? undefined,
              releaseNotes: toText(payload.releaseNotes) ?? undefined,
              downloadUrl: toText(payload.downloadUrl) ?? undefined,
              receivedAt: Date.now(),
            })
          }
          return
        }
      }

      wsRef.current = ws
    }

    createConnection()

    return () => {
      disposedRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      rejectAllPending('连接已销毁')
      runSessionMap.clear()
      runStreamSourceMap.clear()
      runsWithAgentText.clear()
      pendingStreamEventsMap.clear()
      handshakeReadyRef.current = false
      connectReqIdRef.current = null

      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      setIsConnected(false)
      setActiveSendCount(0)
      setPendingApprovals([])
      shutdownRef.current = null
      setShutdownNotification(null)
      setUpdateNotification(null)
      setGatewayHealth(null)
      setPresenceList([])
      setSubagentTasks([])
      resetServerScopedState()
    }
  }, [handleAgentEvent, handleChatEvent, refreshAgents, rejectAllPending, resetServerScopedState, url])

  /**
   * 读取指定会话消息列表。
   * @param sessionKey 目标会话 key。
   */
  const getSessionMessages = useCallback((sessionKey: string) => {
    return messagesBySession[sessionKey] ?? []
  }, [messagesBySession])

  /**
   * 读取指定会话的生成状态。
   * @param sessionKey 目标会话 key。
   */
  const getSessionTyping = useCallback((sessionKey: string) => {
    return Boolean(typingBySession[sessionKey])
  }, [typingBySession])

  /**
   * 读取指定会话的历史加载状态。
   * @param sessionKey 目标会话 key。
   */
  const getSessionLoadingHistory = useCallback((sessionKey: string) => {
    return Boolean(loadingHistoryBySession[sessionKey])
  }, [loadingHistoryBySession])

  const sessions = useMemo(
    () => (focusedAgentId ? (sessionsByAgent[focusedAgentId] ?? []) : []),
    [focusedAgentId, sessionsByAgent],
  )

  const messages = useMemo(
    () => (focusedSessionKey ? (messagesBySession[focusedSessionKey] ?? []) : []),
    [focusedSessionKey, messagesBySession],
  )

  const isSending = activeSendCount > 0
  const isTyping = focusedSessionKey ? Boolean(typingBySession[focusedSessionKey]) : false
  const isLoadingSessions = focusedAgentId ? Boolean(loadingSessionsByAgent[focusedAgentId]) : false
  const isLoadingHistory = focusedSessionKey ? Boolean(loadingHistoryBySession[focusedSessionKey]) : false

  return {
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
    renameAgent,
    deleteAgent,
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
  } as const
}
