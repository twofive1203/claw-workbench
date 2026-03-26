/**
 * 配置中的模型协议类型。
 */
export type ProviderApiType =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'bedrock-converse-stream'
  | 'github-copilot'
  | 'ollama'
  | string

/**
 * 配置中的认证类型。
 */
export type ProviderAuthType = 'api-key' | 'oauth' | 'token' | 'aws-sdk' | string

/**
 * 配置中的 Agent 工具预设类型。
 */
export type AgentToolProfile = 'minimal' | 'coding' | 'messaging' | 'full' | string

/**
 * 配置中的 thinking 默认值类型。
 */
export type ThinkingDefaultLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | string

/**
 * 配置中的日志级别类型。
 */
export type LoggingLevel = 'silent' | 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | string

/**
 * 配置中的日志输出风格类型。
 */
export type LoggingConsoleStyle = 'pretty' | 'compact' | 'json' | string

/**
 * 配置中的日志敏感信息脱敏类型。
 */
export type LoggingRedactSensitive = 'off' | 'tools' | string

/**
 * 配置中的通道对端类型。
 */
export type BindingPeerKind = 'direct' | 'group' | 'channel' | 'dm' | string

/**
 * Provider 模型成本结构。
 * @param input 输入 token 成本。
 * @param output 输出 token 成本。
 * @param cacheRead 缓存读取成本。
 * @param cacheWrite 缓存写入成本。
 */
export interface ProviderModelCost {
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  [key: string]: unknown
}

/**
 * Provider 下单个模型结构。
 * @param id 模型唯一 ID。
 * @param name 模型展示名称。
 * @param reasoning 推理能力开关或级别。
 * @param contextWindow 上下文窗口大小。
 * @param maxTokens 最大输出 token。
 * @param cost 模型成本配置。
 */
export interface ProviderModel {
  id?: string
  name?: string
  reasoning?: boolean | string
  contextWindow?: number
  maxTokens?: number
  cost?: ProviderModelCost
  [key: string]: unknown
}

/**
 * Provider 配置结构。
 * @param baseUrl Provider API 地址。
 * @param apiKey Provider API 密钥。
 * @param api Provider 协议类型。
 * @param auth Provider 认证方式。
 * @param authHeader 是否通过 Authorization Header 传递认证信息。
 * @param headers Provider 自定义请求头。
 * @param models Provider 模型列表。
 */
export interface ProviderConfig {
  baseUrl?: string
  apiKey?: string
  api?: ProviderApiType
  auth?: ProviderAuthType
  authHeader?: boolean
  headers?: Record<string, string>
  models?: ProviderModel[]
  [key: string]: unknown
}

/**
 * 模型总配置。
 * @param providers Provider 集合，key 为 providerId。
 */
export interface ModelsConfig {
  providers?: Record<string, ProviderConfig>
  [key: string]: unknown
}

/**
 * Agent 模型对象结构。
 * @param primary 主模型。
 * @param fallbacks 回退模型列表。
 */
export interface AgentModelObject {
  primary?: string
  fallbacks?: string[]
  [key: string]: unknown
}

/**
 * Agent 模型字段结构。
 */
export type AgentModelValue = string | AgentModelObject

/**
 * Agent 允许模型项结构。
 */
export interface AgentAllowedModel {
  [key: string]: unknown
}

/**
 * Agent 允许模型列表结构。
 * @param [modelId] 允许切换的模型 ID。
 */
export type AgentAllowedModels = Record<string, AgentAllowedModel>

/**
 * Agent 工具配置结构。
 * @param profile 工具预设。
 * @param allow 显式允许的工具列表。
 * @param alsoAllow 在 profile 基础上追加允许的工具列表。
 * @param deny 显式拒绝的工具列表。
 */
export interface AgentToolsConfig {
  profile?: AgentToolProfile
  allow?: string[]
  alsoAllow?: string[]
  deny?: string[]
  [key: string]: unknown
}

/**
 * Agent 身份配置结构。
 * @param name 身份名称。
 * @param theme 身份主题描述。
 * @param emoji 身份 emoji。
 * @param avatar 身份头像标识。
 * @param avatarUrl 身份头像 URL。
 */
export interface AgentIdentityConfig {
  name?: string
  theme?: string
  emoji?: string
  avatar?: string
  avatarUrl?: string
  [key: string]: unknown
}

/**
 * Agent 群聊配置结构。
 * @param mentionPatterns 提及匹配规则。
 * @param historyLimit 群聊历史条数上限。
 */
export interface AgentGroupChatConfig {
  mentionPatterns?: string[]
  historyLimit?: number
  [key: string]: unknown
}

/**
 * Agent 子代理配置结构。
 * @param allowAgents 允许唤起的子代理列表。
 * @param model 子代理模型配置。
 * @param thinking 子代理思考等级。
 */
export interface AgentSubagentsConfig {
  allowAgents?: string[]
  model?: AgentModelValue
  thinking?: string
  [key: string]: unknown
}

/**
 * Agent 列表项配置结构。
 * @param id Agent 唯一 ID。
 * @param name Agent 名称。
 * @param default 是否为默认 Agent。
 * @param workspace Agent 工作目录。
 * @param agentDir Agent 核心文件目录。
 * @param model Agent 模型配置。
 * @param models Agent 允许切换模型列表（旧版字段），key 为模型 ID。
 * @param tools Agent 工具配置。
 * @param skills Agent 技能列表。
 * @param identity Agent 身份配置。
 * @param groupChat Agent 群聊配置。
 * @param heartbeat Agent 心跳配置。
 * @param subagents Agent 子代理配置。
 */
export interface AgentListItem {
  id?: string
  name?: string
  default?: boolean
  workspace?: string
  agentDir?: string
  model?: AgentModelValue
  models?: AgentAllowedModels
  tools?: AgentToolsConfig
  skills?: string[]
  identity?: AgentIdentityConfig
  groupChat?: AgentGroupChatConfig
  heartbeat?: AgentHeartbeatConfig
  subagents?: AgentSubagentsConfig
  [key: string]: unknown
}

/**
 * Agent 心跳配置结构。
 * @param every 心跳周期。
 */
export interface AgentHeartbeatConfig {
  every?: string
  [key: string]: unknown
}

/**
 * Agent 默认配置结构。
 * @param model 默认模型设置。
 * @param models 允许切换模型列表，key 为模型 ID。
 * @param workspace 默认工作目录。
 * @param userTimezone 默认时区。
 * @param thinkingDefault 默认思考等级。
 * @param timeoutSeconds 默认请求超时（秒）。
 * @param contextTokens 默认上下文 token 上限。
 * @param heartbeat 默认心跳设置。
 */
export interface AgentDefaultsConfig {
  model?: AgentModelObject
  models?: AgentAllowedModels
  workspace?: string
  userTimezone?: string
  thinkingDefault?: ThinkingDefaultLevel
  timeoutSeconds?: number
  contextTokens?: number
  heartbeat?: AgentHeartbeatConfig
  [key: string]: unknown
}

/**
 * Agent 总配置。
 * @param defaults Agent 默认配置。
 * @param list Agent 列表。
 */
export interface AgentsConfig {
  defaults?: AgentDefaultsConfig
  list?: AgentListItem[]
  [key: string]: unknown
}

/**
 * 日志配置结构。
 * @param level 总体日志级别。
 * @param consoleLevel 控制台日志级别。
 * @param consoleStyle 控制台日志样式。
 * @param file 日志文件路径。
 * @param redactSensitive 脱敏策略。
 */
export interface LoggingConfig {
  level?: LoggingLevel
  consoleLevel?: LoggingLevel
  consoleStyle?: LoggingConsoleStyle
  file?: string
  redactSensitive?: LoggingRedactSensitive
  [key: string]: unknown
}

/**
 * 通道绑定对端匹配结构。
 * @param kind 对端类型。
 * @param id 对端 ID。
 */
export interface BindingPeerMatch {
  kind?: BindingPeerKind
  id?: string
  [key: string]: unknown
}

/**
 * 通道绑定匹配结构。
 * @param channel 通道类型。
 * @param peer 对端匹配规则。
 * @param accountId 账号 ID。
 */
export interface BindingMatch {
  channel?: string
  peer?: BindingPeerMatch
  accountId?: string
  [key: string]: unknown
}

/**
 * 通道绑定结构。
 * @param agentId 绑定的 Agent ID。
 * @param match 匹配规则。
 */
export interface BindingConfig {
  agentId?: string
  match?: BindingMatch
  [key: string]: unknown
}

/**
 * OpenClaw 主配置结构。
 * @param models 模型配置。
 * @param agents Agent 配置。
 * @param logging 日志配置。
 * @param bindings 通道绑定配置。
 */
export interface OpenClawConfig {
  models?: ModelsConfig
  agents?: AgentsConfig
  logging?: LoggingConfig
  bindings?: BindingConfig[]
  [key: string]: unknown
}

import { isRecord } from '../lib/parsers'

export { isRecord } from '../lib/parsers'

/**
 * Provider 默认 User-Agent Header 名称。
 */
export const DEFAULT_PROVIDER_USER_AGENT_HEADER_NAME = 'User-Agent'

/**
 * Provider 默认 User-Agent Header 值。
 */
export const DEFAULT_PROVIDER_USER_AGENT_HEADER_VALUE = 'claude-cli/2.1.56 (external, cli)'

/**
 * 规范化 Provider 请求头，并在缺失时补齐默认 User-Agent。
 * @param headers 原始请求头对象。
 */
function normalizeProviderHeaders(headers: unknown): Record<string, string> {
  const nextHeaders: Record<string, string> = {}
  let userAgentKey: string | null = null
  let userAgentValue: string | null = null

  if (isRecord(headers)) {
    Object.entries(headers).forEach(([key, value]) => {
      if (typeof value !== 'string') return
      if (key.trim().toLowerCase() === DEFAULT_PROVIDER_USER_AGENT_HEADER_NAME.toLowerCase()) {
        userAgentKey = key
        userAgentValue = value
        return
      }
      nextHeaders[key] = value
    })
  }

  nextHeaders[userAgentKey ?? DEFAULT_PROVIDER_USER_AGENT_HEADER_NAME] = userAgentValue ?? DEFAULT_PROVIDER_USER_AGENT_HEADER_VALUE
  return nextHeaders
}

/**
 * 为 Provider 补齐默认 User-Agent 请求头。
 * @param provider 原始 Provider 配置。
 */
export function ensureProviderUserAgentHeader(provider: ProviderConfig): ProviderConfig {
  return {
    ...provider,
    headers: normalizeProviderHeaders(provider.headers),
  }
}

/**
 * 配置编辑器数据通道状态。
 * @param rpc 通过 Gateway RPC 读写。
 * @param local 通过本地文件读写。
 */
export type ConfigRpcState = 'rpc' | 'local'

/**
 * 创建空配置对象。
 */
export function createEmptyConfig(): OpenClawConfig {
  return {}
}

/**
 * 规范化根配置对象，非对象输入会转为空对象。
 * @param value 原始配置值。
 */
export function normalizeRootConfig(value: unknown): OpenClawConfig {
  if (!isRecord(value)) return createEmptyConfig()
  return value as OpenClawConfig
}
