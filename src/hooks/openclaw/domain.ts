/**
 * OpenClaw 领域归一化与派生工具。
 * @author towfive
 */

import type {
  Agent,
  CronJob,
  CronJobConfig,
  CronRunRecord,
  MemoryEntry,
  PresenceEntry,
  SessionSummary,
} from '../../types'
import { isRecord, toText } from '../../lib/parsers'
import {
  isAgentSessionKey,
  parseAgentIdFromSessionKey,
  toNumber,
  toTextArray,
} from './protocol'

const MEMORY_ENTRY_ID_PREFIX = 'memory-file'

/**
 * Agent 工作区文件条目。
 * @param name 文件名。
 * @param path 文件绝对路径。
 * @param missing 是否缺失。
 * @param size 文件大小（字节）。
 * @param updatedAtMs 最后更新时间戳（毫秒）。
 * @param content 文件内容。
 */
export interface AgentWorkspaceFile {
  name: string
  path?: string
  missing: boolean
  size?: number
  updatedAtMs?: number
  content?: string
}

/**
 * 规范化 Agent 数据。
 * @param value 原始 Agent。
 */
export function normalizeAgent(value: unknown): Agent | null {
  if (!isRecord(value)) return null
  const id = toText(value.id)
  if (!id) return null

  const identityRaw = isRecord(value.identity) ? value.identity : null
  const identity = identityRaw
    ? {
      name: toText(identityRaw.name) ?? undefined,
      theme: toText(identityRaw.theme) ?? undefined,
      emoji: toText(identityRaw.emoji) ?? undefined,
      avatar: toText(identityRaw.avatar) ?? undefined,
      avatarUrl: toText(identityRaw.avatarUrl) ?? undefined,
    }
    : undefined

  return {
    id,
    name: toText(value.name) ?? undefined,
    workspace: toText(value.workspace) ?? undefined,
    identity,
  }
}

/**
 * 规范化 Session 数据。
 * @param value 原始 Session。
 * @param fallbackAgentId 回退 agent id。
 */
export function normalizeSessionSummary(value: unknown, fallbackAgentId: string): SessionSummary | null {
  if (!isRecord(value)) return null
  const key = toText(value.key)
  if (!key || !isAgentSessionKey(key)) return null

  const parsedAgentId = parseAgentIdFromSessionKey(key)
  const agentId = parsedAgentId ?? fallbackAgentId
  if (!agentId) return null

  const updatedAtValue = value.updatedAt
  const updatedAt = typeof updatedAtValue === 'number' ? updatedAtValue : undefined
  const sendPolicyRaw = toText(value.sendPolicy)
  const sendPolicy = sendPolicyRaw === 'allow' || sendPolicyRaw === 'deny' ? sendPolicyRaw : undefined
  const modelProvider = toText(value.modelProvider)
    ?? toText(value.model_provider)
    ?? toText(value.provider)
    ?? undefined
  const rawModel = toText(value.model)
    ?? toText(value.modelId)
    ?? toText(value.model_id)
    ?? undefined
  const model = rawModel
    ? (modelProvider && !rawModel.startsWith(`${modelProvider}/`) ? `${modelProvider}/${rawModel}` : rawModel)
    : undefined

  return {
    key,
    agentId,
    displayName: toText(value.displayName)
      ?? toText(value.derivedTitle)
      ?? toText(value.label)
      ?? undefined,
    modelProvider,
    model,
    thinkingLevel: toText(value.thinkingLevel) ?? undefined,
    verboseLevel: toText(value.verboseLevel) ?? undefined,
    reasoningLevel: toText(value.reasoningLevel) ?? undefined,
    elevatedLevel: toText(value.elevatedLevel) ?? undefined,
    sendPolicy,
    inputTokens: toNumber(value.inputTokens) ?? undefined,
    outputTokens: toNumber(value.outputTokens) ?? undefined,
    totalTokens: toNumber(value.totalTokens) ?? undefined,
    totalTokensFresh: typeof value.totalTokensFresh === 'boolean' ? value.totalTokensFresh : undefined,
    updatedAt,
    lastMessagePreview: toText(value.lastMessagePreview) ?? undefined,
  }
}

/**
 * 比较两条会话摘要是否一致。
 * @param left 左侧会话摘要。
 * @param right 右侧会话摘要。
 */
function isSameSessionSummary(left: SessionSummary, right: SessionSummary): boolean {
  return left.key === right.key
    && left.agentId === right.agentId
    && left.displayName === right.displayName
    && left.modelProvider === right.modelProvider
    && left.model === right.model
    && left.thinkingLevel === right.thinkingLevel
    && left.verboseLevel === right.verboseLevel
    && left.reasoningLevel === right.reasoningLevel
    && left.elevatedLevel === right.elevatedLevel
    && left.sendPolicy === right.sendPolicy
    && left.inputTokens === right.inputTokens
    && left.outputTokens === right.outputTokens
    && left.totalTokens === right.totalTokens
    && left.totalTokensFresh === right.totalTokensFresh
    && left.updatedAt === right.updatedAt
    && left.lastMessagePreview === right.lastMessagePreview
}

/**
 * 比较两组会话摘要列表是否一致。
 * @param left 左侧会话列表。
 * @param right 右侧会话列表。
 */
export function isSameSessionSummaryList(left: SessionSummary[], right: SessionSummary[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    const leftItem = left[index]
    const rightItem = right[index]
    if (!leftItem || !rightItem || !isSameSessionSummary(leftItem, rightItem)) return false
  }
  return true
}

/**
 * 规范化在线设备条目。
 * @param value 原始在线条目。
 */
export function normalizePresenceEntry(value: unknown): PresenceEntry | null {
  if (!isRecord(value)) return null
  return {
    host: toText(value.host) ?? undefined,
    ip: toText(value.ip) ?? undefined,
    version: toText(value.version) ?? undefined,
    platform: toText(value.platform) ?? undefined,
    deviceFamily: toText(value.deviceFamily) ?? undefined,
    mode: toText(value.mode) ?? undefined,
    deviceId: toText(value.deviceId) ?? undefined,
    roles: toTextArray(value.roles),
    scopes: toTextArray(value.scopes),
    instanceId: toText(value.instanceId) ?? undefined,
    reason: toText(value.reason) ?? undefined,
    ts: typeof value.ts === 'number' ? value.ts : undefined,
  }
}

/**
 * 规范化 Agent 文件条目。
 * @param value 原始文件数据。
 */
export function normalizeAgentWorkspaceFile(value: unknown): AgentWorkspaceFile | null {
  if (!isRecord(value)) return null
  const name = toText(value.name)
  if (!name) return null

  return {
    name,
    path: toText(value.path) ?? undefined,
    missing: value.missing === true,
    size: typeof value.size === 'number' ? value.size : undefined,
    updatedAtMs: typeof value.updatedAtMs === 'number' ? value.updatedAtMs : undefined,
    content: typeof value.content === 'string' ? value.content : undefined,
  }
}

/**
 * 判断是否是记忆文件名。
 * @param name 文件名。
 */
export function isMemoryFileName(name: string): boolean {
  return name.trim().toLowerCase() === 'memory.md'
}

/**
 * 构造记忆条目标识。
 * @param agentId agent id。
 * @param fileName 文件名。
 */
function buildMemoryEntryId(agentId: string, fileName: string): string {
  return `${MEMORY_ENTRY_ID_PREFIX}:${encodeURIComponent(agentId)}:${encodeURIComponent(fileName)}`
}

/**
 * 解析记忆条目标识。
 * @param id 记忆条目 id。
 */
export function parseMemoryEntryId(id: string): { agentId: string, fileName: string } | null {
  const parts = id.split(':')
  if (parts.length !== 3 || parts[0] !== MEMORY_ENTRY_ID_PREFIX) return null
  try {
    const agentId = decodeURIComponent(parts[1] ?? '')
    const fileName = decodeURIComponent(parts[2] ?? '')
    if (!agentId || !fileName) return null
    return { agentId, fileName }
  } catch {
    return null
  }
}

/**
 * 由 Agent 工作区文件构建记忆条目。
 * @param agentId agent id。
 * @param file Agent 文件信息。
 */
export function buildMemoryEntryFromFile(agentId: string, file: AgentWorkspaceFile): MemoryEntry | null {
  if (file.missing || !isMemoryFileName(file.name)) return null
  const content = (file.content ?? '').trim()
  if (!content) return null
  const updatedAt = file.updatedAtMs ?? Date.now()
  return {
    id: buildMemoryEntryId(agentId, file.name),
    content,
    agentId,
    tags: [file.name],
    createdAt: updatedAt,
    updatedAt,
    source: `agents.files.get:${file.name}`,
  }
}

/**
 * 计算关键词匹配相关度。
 * @param content 记忆内容。
 * @param keyword 关键词。
 */
export function computeMemoryRelevance(content: string, keyword: string): number {
  const normalizedContent = content.toLowerCase()
  const normalizedKeyword = keyword.toLowerCase().trim()
  if (!normalizedKeyword) return 0
  const hitCount = normalizedContent.split(normalizedKeyword).length - 1
  return Math.max(0, Math.min(1, hitCount / 3))
}

/**
 * 规范化 Cron 任务。
 * @param schedule 原始 schedule 值。
 */
function formatCronSchedule(schedule: unknown): string | null {
  const direct = toText(schedule)
  if (direct) return direct
  if (!isRecord(schedule)) return null

  const kind = toText(schedule.kind)?.toLowerCase()
  if (kind === 'cron') {
    const expr = toText(schedule.expr)
    if (!expr) return null
    const tz = toText(schedule.tz)
    return tz ? `${expr} [${tz}]` : expr
  }

  if (kind === 'every') {
    const everyMs = toNumber(schedule.everyMs)
    if (everyMs === null) return null
    return `@every ${Math.max(1, Math.floor(everyMs))}`
  }

  if (kind === 'at') {
    const at = toText(schedule.at)
    if (!at) return null
    return `@at ${at}`
  }

  return null
}

/**
 * 提取 Cron 任务消息文本。
 * @param value 原始任务。
 */
function extractCronMessage(value: Record<string, unknown>): string | null {
  const directMessage = toText(value.message)
  if (directMessage) return directMessage

  const payload = isRecord(value.payload) ? value.payload : null
  if (!payload) return null

  const kind = toText(payload.kind)?.toLowerCase()
  if (kind === 'agentturn') return toText(payload.message)
  if (kind === 'systemevent') return toText(payload.text)
  return toText(payload.message) ?? toText(payload.text)
}

/**
 * 解析 @every 语法为毫秒。
 * @param raw 原始文本。
 */
function parseEveryScheduleMs(raw: string): number | null {
  const direct = Number.parseInt(raw, 10)
  if (Number.isFinite(direct) && direct > 0) return direct

  const matched = raw.match(/^(\d+)\s*(ms|s|m|h|d)$/i)
  if (!matched) return null

  const amount = Number.parseInt(matched[1] ?? '', 10)
  if (!Number.isFinite(amount) || amount <= 0) return null

  const unit = (matched[2] ?? 'ms').toLowerCase()
  const factor = unit === 'd'
    ? 24 * 60 * 60 * 1000
    : unit === 'h'
      ? 60 * 60 * 1000
      : unit === 'm'
        ? 60 * 1000
        : unit === 's'
          ? 1000
          : 1

  return amount * factor
}

/**
 * 解析前端 schedule 文本为 Gateway schedule 对象。
 * @param scheduleText 输入文本。
 */
function parseCronScheduleInput(scheduleText: string): Record<string, unknown> {
  const trimmed = scheduleText.trim()
  const lower = trimmed.toLowerCase()

  if (lower.startsWith('@every ')) {
    const everyRaw = trimmed.slice(7).trim()
    const everyMs = parseEveryScheduleMs(everyRaw)
    if (everyMs !== null) {
      return {
        kind: 'every',
        everyMs,
      }
    }
  }

  if (lower.startsWith('@at ')) {
    const at = trimmed.slice(4).trim()
    return {
      kind: 'at',
      at,
    }
  }

  const matched = trimmed.match(/^(.*?)(?:\s+\[([^\]]+)\])?$/)
  const expr = matched?.[1]?.trim() || trimmed
  const tz = matched?.[2]?.trim()

  if (tz) {
    return {
      kind: 'cron',
      expr,
      tz,
    }
  }

  return {
    kind: 'cron',
    expr,
  }
}

/**
 * 生成 Cron 任务名称。
 * @param config 任务配置。
 */
function buildCronJobName(config: CronJobConfig): string {
  const label = toText(config.label)
  if (label) return label

  const message = toText(config.message)
  if (message) return message.slice(0, 32)

  return 'Cron Job'
}

/**
 * 构造 cron.add 请求参数。
 * @param config 前端任务配置。
 */
export function buildCronAddPayload(config: CronJobConfig): Record<string, unknown> {
  const message = toText(config.message) ?? ''
  const payload: Record<string, unknown> = {
    name: buildCronJobName(config),
    schedule: parseCronScheduleInput(config.schedule),
    sessionTarget: 'isolated',
    wakeMode: 'now',
    payload: {
      kind: 'agentTurn',
      message,
    },
    enabled: config.enabled !== false,
  }

  const agentId = toText(config.agentId)
  if (agentId) {
    payload.agentId = agentId
  }

  const sessionKey = toText(config.sessionKey)
  if (sessionKey) {
    payload.sessionKey = sessionKey
  }

  return payload
}

/**
 * 构造 cron.update patch 参数。
 * @param patch 前端变更对象。
 */
export function buildCronUpdatePatch(patch: Partial<CronJobConfig>): Record<string, unknown> {
  const next: Record<string, unknown> = {}
  const hasOwn = (key: keyof CronJobConfig) => Object.prototype.hasOwnProperty.call(patch, key)

  if (hasOwn('label')) {
    const label = toText(patch.label)
    if (label) {
      next.name = label
    }
  }

  if (hasOwn('schedule') && typeof patch.schedule === 'string' && patch.schedule.trim()) {
    next.schedule = parseCronScheduleInput(patch.schedule)
  }

  if (hasOwn('message')) {
    const message = toText(patch.message)
    if (message) {
      next.payload = {
        kind: 'agentTurn',
        message,
      }
    }
  }

  if (hasOwn('enabled') && typeof patch.enabled === 'boolean') {
    next.enabled = patch.enabled
  }

  if (hasOwn('agentId')) {
    const agentId = toText(patch.agentId)
    next.agentId = agentId ?? null
  }

  if (hasOwn('sessionKey')) {
    const sessionKey = toText(patch.sessionKey)
    next.sessionKey = sessionKey ?? null
  }

  return next
}

/**
 * 规范化 Cron 任务。
 * @param value 原始任务。
 */
export function normalizeCronJob(value: unknown): CronJob | null {
  if (!isRecord(value)) return null

  const jobId = toText(value.jobId) ?? toText(value.id)
  if (!jobId) return null

  const schedule = formatCronSchedule(value.schedule) ?? '[不支持的 schedule]'
  const message = extractCronMessage(value) ?? '[空消息]'
  const state = isRecord(value.state) ? value.state : null

  return {
    jobId,
    label: toText(value.label) ?? toText(value.name) ?? undefined,
    schedule,
    agentId: toText(value.agentId) ?? undefined,
    message,
    sessionKey: toText(value.sessionKey) ?? undefined,
    enabled: value.enabled !== false,
    createdAt: toNumber(value.createdAtMs) ?? toNumber(value.createdAt) ?? undefined,
    lastRunAt: toNumber(state?.lastRunAtMs) ?? toNumber(value.lastRunAt) ?? undefined,
    nextRunAt: toNumber(state?.nextRunAtMs) ?? toNumber(value.nextRunAt) ?? undefined,
  }
}

/**
 * 规范化 Cron 运行记录。
 * @param value 原始运行记录。
 */
export function normalizeCronRun(value: unknown): CronRunRecord | null {
  if (!isRecord(value)) return null

  const jobId = toText(value.jobId)
  const startedAt = toNumber(value.startedAt) ?? toNumber(value.runAtMs) ?? toNumber(value.ts)
  if (!jobId || startedAt === null) return null

  const statusText = toText(value.status)?.toLowerCase()
  const status: CronRunRecord['status'] = statusText === 'error'
    ? 'error'
    : (statusText === 'success' || statusText === 'ok' || statusText === 'skipped' ? 'success' : 'running')

  const durationMs = toNumber(value.durationMs)
  const endedAt = toNumber(value.endedAt) ?? (durationMs !== null ? startedAt + Math.max(0, Math.floor(durationMs)) : undefined)
  const runId = toText(value.runId) ?? toText(value.id) ?? `${jobId}-${toNumber(value.ts) ?? startedAt}`

  return {
    runId,
    jobId,
    startedAt,
    endedAt,
    status,
    error: toText(value.error) ?? undefined,
  }
}

/**
 * 提取 cron.runs 返回的运行记录数组。
 * @param payload cron.runs 返回值。
 */
export function extractCronRunsPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (!isRecord(payload)) return []
  if (Array.isArray(payload.entries)) return payload.entries
  if (Array.isArray(payload.runs)) return payload.runs
  return []
}

/**
 * 在会话数组中写入或更新一条会话。
 * @param list 原数组。
 * @param row 新会话。
 */
export function upsertSessionSummary(list: SessionSummary[], row: SessionSummary): SessionSummary[] {
  const index = list.findIndex(item => item.key === row.key)
  if (index < 0) return [row, ...list]

  const next = [...list]
  next[index] = { ...next[index], ...row }
  return next
}
