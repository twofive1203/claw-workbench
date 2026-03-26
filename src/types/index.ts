/**
 * Agent 身份信息。
 * @param name 展示名称。
 * @param theme 身份主题。
 * @param emoji 展示 emoji。
 * @param avatar 头像标识。
 * @param avatarUrl 头像 URL。
 */
export interface AgentIdentity {
  name?: string
  theme?: string
  emoji?: string
  avatar?: string
  avatarUrl?: string
}

/**
 * Agent 列表项。
 * @param id Agent 唯一标识。
 * @param name Agent 名称。
 * @param workspace Agent 工作目录（仅部分接口返回）。
 * @param identity Agent 身份信息。
 */
export interface Agent {
  id: string
  name?: string
  workspace?: string
  identity?: AgentIdentity
}

/**
 * 会话摘要信息。
 * @param key 会话 key。
 * @param agentId 归属 Agent。
 * @param displayName 会话显示名称。
 * @param model 会话模型。
 * @param thinkingLevel 会话思考级别。
 * @param verboseLevel 会话详细输出级别。
 * @param reasoningLevel 会话推理级别。
 * @param elevatedLevel 会话执行权限级别。
 * @param sendPolicy 会话发送策略。
 * @param inputTokens 会话输入 token 计数。
 * @param outputTokens 会话输出 token 计数。
 * @param totalTokens 会话总 token 计数。
 * @param totalTokensFresh 总 token 是否新鲜。
 * @param updatedAt 最近更新时间。
 * @param lastMessagePreview 最后消息预览。
 */
export interface SessionSummary {
  key: string
  agentId: string
  displayName?: string
  modelProvider?: string
  model?: string
  thinkingLevel?: string
  verboseLevel?: string
  reasoningLevel?: string
  elevatedLevel?: string
  sendPolicy?: 'allow' | 'deny'
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  totalTokensFresh?: boolean
  updatedAt?: number
  lastMessagePreview?: string
}

/**
 * 图片附件结构。
 * @param data base64 data URL。
 * @param mimeType MIME 类型。
 * @param filename 文件名。
 */
export interface ChatAttachment {
  data: string
  content: string
  mimeType: string
  filename?: string
  fileName?: string
}

/**
 * 聊天内容块中的图片项。
 * @param src 图片地址（data URL / http(s) URL）。
 * @param mimeType 图片 MIME 类型（可选）。
 * @param sourceType 来源块类型（如 image / image_url / input_image）。
 * @param omitted 是否被网关省略原始图片数据。
 * @param bytes 被省略数据的原始字节数（可选）。
 */
export interface ChatMediaItem {
  src: string
  mimeType?: string
  sourceType?: string
  omitted?: boolean
  bytes?: number
}

/**
 * 工具调用阶段。
 * @param start 开始执行。
 * @param update 执行中更新。
 * @param result 执行结果。
 */
export type ToolCallPhase = 'start' | 'update' | 'result'

/**
 * 单次工具调用记录。
 * @param toolCallId 工具调用唯一标识。
 * @param name 工具名称。
 * @param args 工具入参。
 * @param phase 当前阶段。
 * @param partialResult 中间结果。
 * @param result 最终结果。
 * @param error 错误文本。
 * @param startedAt 开始时间戳。
 * @param endedAt 结束时间戳。
 */
export interface ToolCallRecord {
  toolCallId: string
  name: string
  args?: Record<string, unknown>
  phase: ToolCallPhase
  partialResult?: string
  result?: string
  error?: string
  startedAt: number
  endedAt?: number
}

/**
 * 执行审批风险等级。
 * @param low 低风险。
 * @param medium 中风险。
 * @param high 高风险。
 */
export type ExecRiskLevel = 'low' | 'medium' | 'high'

/**
 * 执行审批请求结构。
 * @param requestId 请求唯一标识。
 * @param sessionKey 来源会话。
 * @param runId 关联运行 id。
 * @param toolName 工具名称。
 * @param description 审批说明。
 * @param args 审批参数。
 * @param riskLevel 风险等级。
 * @param timeout 超时毫秒数。
 * @param receivedAt 接收时间戳。
 */
export interface ExecApprovalRequest {
  requestId: string
  sessionKey: string
  runId: string
  toolName: string
  description: string
  args: Record<string, unknown>
  riskLevel?: ExecRiskLevel
  timeout?: number
  receivedAt: number
}

/**
 * 网关关机通知。
 * @param reason 关机原因。
 * @param restartExpectedMs 预计重启耗时毫秒。
 * @param message 自定义提示消息。
 * @param receivedAt 接收时间戳。
 */
export interface ShutdownNotification {
  reason: string
  restartExpectedMs?: number
  message?: string
  receivedAt: number
}

/**
 * 网关更新通知。
 * @param currentVersion 当前版本。
 * @param newVersion 新版本。
 * @param releaseNotes 更新说明。
 * @param downloadUrl 下载链接。
 * @param receivedAt 接收时间戳。
 */
export interface UpdateNotification {
  currentVersion?: string
  newVersion?: string
  releaseNotes?: string
  downloadUrl?: string
  receivedAt: number
}

/**
 * Gateway 健康状态信息。
 * @param ok 是否健康。
 * @param version 服务端版本。
 * @param protocol 协议版本。
 * @param uptimeMs 运行时长毫秒。
 * @param features 服务端能力列表。
 */
export interface GatewayHealthInfo {
  ok: boolean
  version?: string
  protocol?: number
  uptimeMs?: number
  features?: {
    methods?: string[]
    events?: string[]
  }
}

/**
 * 在线设备/节点信息。
 * @param host 主机名。
 * @param ip IP 地址。
 * @param version 客户端版本。
 * @param platform 平台。
 * @param deviceFamily 设备族。
 * @param mode 客户端模式。
 * @param deviceId 设备 id。
 * @param roles 角色列表。
 * @param scopes 权限列表。
 * @param instanceId 实例 id。
 * @param reason 原因说明。
 * @param ts 时间戳。
 */
export interface PresenceEntry {
  host?: string
  ip?: string
  version?: string
  platform?: string
  deviceFamily?: string
  mode?: string
  deviceId?: string
  roles?: string[]
  scopes?: string[]
  instanceId?: string
  reason?: string
  ts?: number
}

/**
 * 记忆条目结构。
 * @param id 记忆唯一标识。
 * @param content 记忆内容。
 * @param agentId 所属 agent id。
 * @param sessionKey 来源会话 key。
 * @param tags 标签列表。
 * @param createdAt 创建时间戳。
 * @param updatedAt 更新时间戳。
 * @param source 来源类型。
 * @param relevanceScore 相关度评分。
 */
export interface MemoryEntry {
  id: string
  content: string
  agentId?: string
  sessionKey?: string
  tags?: string[]
  createdAt: number
  updatedAt?: number
  source?: string
  relevanceScore?: number
}

/**
 * logs.tail 请求参数。
 * @param cursor 增量读取游标。
 * @param limit 单次读取的最大行数。
 * @param maxBytes 单次读取的最大字节数。
 */
export interface LogsTailParams {
  cursor?: string
  limit?: number
  maxBytes?: number
}

/**
 * logs.tail 响应结构。
 * @param file 当前日志文件路径。
 * @param cursor 下一次增量读取游标。
 * @param size 当前日志文件大小（字节）。
 * @param lines 返回的日志行列表。
 * @param truncated 是否发生窗口截断。
 * @param reset 是否检测到日志文件重置。
 */
export interface LogsTailResult {
  file?: string
  cursor?: string
  size?: number
  lines?: string[]
  truncated?: boolean
  reset?: boolean
}

/**
 * Cron 任务配置。
 * @param label 任务名称。
 * @param schedule cron 表达式。
 * @param agentId 目标 agent id。
 * @param message 发送消息内容。
 * @param sessionKey 目标会话 key。
 * @param enabled 是否启用。
 */
export interface CronJobConfig {
  label?: string
  schedule: string
  agentId?: string
  message: string
  sessionKey?: string
  enabled?: boolean
}

/**
 * Cron 任务条目。
 * @param jobId 任务 id。
 * @param label 任务名称。
 * @param schedule cron 表达式。
 * @param agentId 目标 agent id。
 * @param message 发送消息。
 * @param sessionKey 会话 key。
 * @param enabled 是否启用。
 * @param createdAt 创建时间戳。
 * @param lastRunAt 最近运行时间。
 * @param nextRunAt 下次运行时间。
 */
export interface CronJob {
  jobId: string
  label?: string
  schedule: string
  agentId?: string
  message: string
  sessionKey?: string
  enabled: boolean
  createdAt?: number
  lastRunAt?: number
  nextRunAt?: number
}

/**
 * Cron 运行记录。
 * @param runId 运行 id。
 * @param jobId 任务 id。
 * @param startedAt 开始时间。
 * @param endedAt 结束时间。
 * @param status 运行状态。
 * @param error 错误信息。
 */
export interface CronRunRecord {
  runId: string
  jobId: string
  startedAt: number
  endedAt?: number
  status: 'running' | 'success' | 'error'
  error?: string
}

/**
 * 子代理状态。
 * @param running 运行中。
 * @param completed 已完成。
 * @param error 失败。
 * @param aborted 已终止。
 */
export type SubagentStatus = 'running' | 'completed' | 'error' | 'aborted'

/**
 * 子代理任务记录。
 * @param runId 子代理运行 id。
 * @param parentRunId 父级运行 id。
 * @param sessionKey 会话 key。
 * @param label 子任务标签。
 * @param agentId 子代理 agent id。
 * @param task 任务描述。
 * @param status 状态。
 * @param startedAt 开始时间戳。
 * @param endedAt 结束时间戳。
 * @param error 错误信息。
 */
export interface SubagentTask {
  runId: string
  parentRunId?: string
  sessionKey: string
  label?: string
  agentId?: string
  task?: string
  status: SubagentStatus
  startedAt: number
  endedAt?: number
  error?: string
}

/**
 * 助手消息状态。
 * @param streaming 正在流式生成。
 * @param final 已完成。
 * @param aborted 已中止。
 * @param error 出错。
 */
export type AssistantMessageState = 'streaming' | 'final' | 'aborted' | 'error'

/**
 * 聊天消息结构。
 * @param id 消息唯一标识。
 * @param sessionKey 所属会话。
 * @param role 消息角色。
 * @param content 消息文本。
 * @param timestamp 时间戳（毫秒）。
 * @param runId 关联运行 id。
 * @param streamSource 流式来源（仅前端运行期使用）。
 * @param model 消息级模型名（如果网关返回）。
 * @param speakerName 说话人名称（如果网关返回）。
 * @param speakerAgentId 说话人 agent id（如果网关返回）。
 * @param messageState 助手消息状态。
 * @param stopReason 停止原因（如果网关返回）。
 * @param errorMessage 错误消息（如果网关返回）。
 * @param isTruncated 是否为裁剪后的历史消息。
 * @param truncatedReason 历史裁剪原因。
 * @param messageKind 消息特殊类型（如 compaction）。
 * @param attachments 附件列表。
 * @param mediaItems 内容块中的图片列表。
 * @param toolCalls 工具调用记录列表。
 */
export interface ChatMessage {
  id: string
  sessionKey: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  runId?: string
  streamSource?: 'agent' | 'chat'
  modelProvider?: string
  model?: string
  speakerName?: string
  speakerAgentId?: string
  messageState?: AssistantMessageState
  stopReason?: string
  errorMessage?: string
  isTruncated?: boolean
  truncatedReason?: string
  messageKind?: 'compaction'
  attachments?: ChatAttachment[]
  mediaItems?: ChatMediaItem[]
  toolCalls?: ToolCallRecord[]
}
