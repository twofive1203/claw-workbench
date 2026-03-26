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
 * 配置中的群聊策略类型。
 */
export type ChannelGroupPolicy = 'open' | 'disabled' | 'allowlist' | string

/**
 * 配置中的通道对端类型。
 */
export type BindingPeerKind = 'direct' | 'group' | 'channel' | 'dm' | string

/**
 * Gateway 运行模式类型。
 */
export type GatewayMode = 'local' | 'remote' | string

/**
 * Gateway 监听绑定类型。
 */
export type GatewayBindMode = 'auto' | 'lan' | 'loopback' | 'custom' | 'tailnet' | string

/**
 * Gateway 认证模式类型。
 */
export type GatewayAuthMode = 'none' | 'token' | 'password' | 'trusted-proxy' | string

/**
 * Gateway 热重载模式类型。
 */
export type GatewayReloadMode = 'off' | 'restart' | 'hot' | 'hybrid' | string

/**
 * Gateway Tailscale 模式类型。
 */
export type GatewayTailscaleMode = 'off' | 'serve' | 'funnel' | string

/**
 * Wizard 最近运行模式类型。
 */
export type WizardLastRunMode = 'local' | 'remote' | string

/**
 * 配置中的密文字段值类型。
 */
export type ConfigSecretValue = string | Record<string, unknown>

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
 * 插件加载配置结构。
 * @param paths 额外插件扫描路径。
 */
export interface PluginsLoadConfig {
  paths?: string[]
  [key: string]: unknown
}

/**
 * 插件槽位配置结构。
 * @param memory 记忆槽位绑定的插件 ID。
 * @param contextEngine 上下文引擎槽位绑定的插件 ID。
 */
export interface PluginSlotsConfig {
  memory?: string
  contextEngine?: string
  [key: string]: unknown
}

/**
 * 单个插件 Hook 配置结构。
 * @param allowPromptInjection 是否允许提示词注入。
 */
export interface PluginEntryHooksConfig {
  allowPromptInjection?: boolean
  [key: string]: unknown
}

/**
 * 单个插件子代理配置结构。
 * @param allowModelOverride 是否允许插件请求模型覆盖。
 * @param allowedModels 允许覆盖到的模型列表。
 */
export interface PluginEntrySubagentConfig {
  allowModelOverride?: boolean
  allowedModels?: string[]
  [key: string]: unknown
}

/**
 * 单个插件条目配置结构。
 * @param enabled 是否启用该插件。
 * @param hooks 插件 Hook 配置。
 * @param subagent 插件子代理配置。
 * @param config 插件自定义配置。
 */
export interface PluginEntryConfig {
  enabled?: boolean
  hooks?: PluginEntryHooksConfig
  subagent?: PluginEntrySubagentConfig
  config?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * 插件总配置。
 * @param enabled 是否启用插件系统。
 * @param allow 插件允许列表。
 * @param deny 插件拒绝列表。
 * @param load 插件加载配置。
 * @param slots 插件槽位配置。
 * @param entries 单插件配置表。
 * @param installs 插件安装记录。
 */
export interface PluginsConfig {
  enabled?: boolean
  allow?: string[]
  deny?: string[]
  load?: PluginsLoadConfig
  slots?: PluginSlotsConfig
  entries?: Record<string, PluginEntryConfig>
  installs?: Record<string, Record<string, unknown>>
  [key: string]: unknown
}

/**
 * 通道心跳可见性配置结构。
 * @param showOk 是否显示正常心跳消息。
 * @param showAlerts 是否显示告警内容。
 * @param useIndicator 是否发出 UI 指示器事件。
 */
export interface ChannelHeartbeatVisibilityConfig {
  showOk?: boolean
  showAlerts?: boolean
  useIndicator?: boolean
  [key: string]: unknown
}

/**
 * 通道默认配置结构。
 * @param groupPolicy 默认群聊策略。
 * @param heartbeat 默认心跳展示配置。
 */
export interface ChannelDefaultsConfig {
  groupPolicy?: ChannelGroupPolicy
  heartbeat?: ChannelHeartbeatVisibilityConfig
  [key: string]: unknown
}

/**
 * 按 provider/channel 的模型覆盖映射。
 */
export type ChannelModelByChannelConfig = Record<string, Record<string, string>>

/**
 * 通道总配置。
 * @param defaults 通道默认配置。
 * @param modelByChannel provider/channel 模型覆盖映射。
 */
export interface ChannelsConfig {
  defaults?: ChannelDefaultsConfig
  modelByChannel?: ChannelModelByChannelConfig
  [key: string]: unknown
}

/**
 * Gateway Control UI 配置结构。
 * @param enabled 是否启用内置控制台界面。
 * @param basePath 控制台基础路径前缀。
 * @param root 控制台静态资源目录。
 * @param allowedOrigins WebSocket/浏览器允许来源。
 * @param dangerouslyAllowHostHeaderOriginFallback 是否允许 Host 头兜底来源判断。
 * @param allowInsecureAuth 是否允许不安全认证。
 * @param dangerouslyDisableDeviceAuth 是否禁用设备身份校验。
 */
export interface GatewayControlUiConfig {
  enabled?: boolean
  basePath?: string
  root?: string
  allowedOrigins?: string[]
  dangerouslyAllowHostHeaderOriginFallback?: boolean
  allowInsecureAuth?: boolean
  dangerouslyDisableDeviceAuth?: boolean
  [key: string]: unknown
}

/**
 * Gateway 认证限流配置结构。
 * @param maxAttempts 最大失败次数。
 * @param windowMs 统计窗口时长（毫秒）。
 * @param lockoutMs 锁定时长（毫秒）。
 * @param exemptLoopback 是否豁免 loopback 地址。
 */
export interface GatewayAuthRateLimitConfig {
  maxAttempts?: number
  windowMs?: number
  lockoutMs?: number
  exemptLoopback?: boolean
  [key: string]: unknown
}

/**
 * Gateway 受信代理配置结构。
 * @param userHeader 代理透传的用户头。
 * @param requiredHeaders 必须存在的代理头。
 * @param allowUsers 允许访问的用户列表。
 */
export interface GatewayTrustedProxyConfig {
  userHeader?: string
  requiredHeaders?: string[]
  allowUsers?: string[]
  [key: string]: unknown
}

/**
 * Gateway 认证配置结构。
 * @param mode 认证模式。
 * @param token token 模式密钥。
 * @param password password 模式密码。
 * @param allowTailscale 是否允许 Tailscale 身份头。
 * @param rateLimit 失败认证限流配置。
 * @param trustedProxy 受信代理配置。
 */
export interface GatewayAuthConfig {
  mode?: GatewayAuthMode
  token?: ConfigSecretValue
  password?: ConfigSecretValue
  allowTailscale?: boolean
  rateLimit?: GatewayAuthRateLimitConfig
  trustedProxy?: GatewayTrustedProxyConfig
  [key: string]: unknown
}

/**
 * Gateway Tailscale 配置结构。
 * @param mode 暴露模式。
 * @param resetOnExit 退出时是否重置配置。
 */
export interface GatewayTailscaleConfig {
  mode?: GatewayTailscaleMode
  resetOnExit?: boolean
  [key: string]: unknown
}

/**
 * Gateway 远端连接配置结构。
 * @param enabled 是否启用远端网关模式。
 * @param url 远端网关地址。
 * @param transport 远端传输方式。
 * @param token 远端 token。
 * @param password 远端密码。
 * @param tlsFingerprint 期望的 TLS 指纹。
 * @param sshTarget SSH 隧道目标。
 * @param sshIdentity SSH 身份文件路径。
 */
export interface GatewayRemoteConfig {
  enabled?: boolean
  url?: string
  transport?: 'ssh' | 'direct' | string
  token?: ConfigSecretValue
  password?: ConfigSecretValue
  tlsFingerprint?: string
  sshTarget?: string
  sshIdentity?: string
  [key: string]: unknown
}

/**
 * Gateway 重载配置结构。
 * @param mode 重载模式。
 * @param debounceMs 配置变更防抖时间。
 * @param deferralTimeoutMs 强制重启前等待在途任务结束的超时。
 */
export interface GatewayReloadConfig {
  mode?: GatewayReloadMode
  debounceMs?: number
  deferralTimeoutMs?: number
  [key: string]: unknown
}

/**
 * Gateway TLS 配置结构。
 * @param enabled 是否启用 TLS。
 * @param autoGenerate 是否自动生成证书。
 * @param certPath 证书路径。
 * @param keyPath 私钥路径。
 * @param caPath CA 证书路径。
 */
export interface GatewayTlsConfig {
  enabled?: boolean
  autoGenerate?: boolean
  certPath?: string
  keyPath?: string
  caPath?: string
  [key: string]: unknown
}

/**
 * Gateway 总配置。
 * @param port Gateway 监听端口。
 * @param mode Gateway 运行模式。
 * @param bind Gateway 绑定策略。
 * @param customBindHost 自定义绑定地址。
 * @param controlUi Control UI 配置。
 * @param auth 认证配置。
 * @param tailscale Tailscale 配置。
 * @param remote 远端连接配置。
 * @param reload 热重载配置。
 * @param tls TLS 配置。
 * @param trustedProxies 受信代理 IP 列表。
 * @param allowRealIpFallback 是否允许 x-real-ip 兜底。
 * @param channelHealthCheckMinutes 通道健康检查周期（分钟）。
 * @param channelStaleEventThresholdMinutes 通道事件陈旧阈值（分钟）。
 * @param channelMaxRestartsPerHour 每小时最大自动重启次数。
 */
export interface GatewayConfig {
  port?: number
  mode?: GatewayMode
  bind?: GatewayBindMode
  customBindHost?: string
  controlUi?: GatewayControlUiConfig
  auth?: GatewayAuthConfig
  tailscale?: GatewayTailscaleConfig
  remote?: GatewayRemoteConfig
  reload?: GatewayReloadConfig
  tls?: GatewayTlsConfig
  trustedProxies?: string[]
  allowRealIpFallback?: boolean
  channelHealthCheckMinutes?: number
  channelStaleEventThresholdMinutes?: number
  channelMaxRestartsPerHour?: number
  [key: string]: unknown
}

/**
 * UI 助手展示配置结构。
 * @param name 助手显示名称。
 * @param avatar 助手头像。
 */
export interface UiAssistantConfig {
  name?: string
  avatar?: string
  [key: string]: unknown
}

/**
 * UI 配置结构。
 * @param seamColor 界面强调色。
 * @param assistant 助手展示配置。
 */
export interface UiConfig {
  seamColor?: string
  assistant?: UiAssistantConfig
  [key: string]: unknown
}

/**
 * 初始化向导配置结构。
 * @param lastRunAt 最近运行时间。
 * @param lastRunVersion 最近运行版本。
 * @param lastRunCommit 最近运行提交。
 * @param lastRunCommand 最近运行命令。
 * @param lastRunMode 最近运行模式。
 */
export interface WizardConfig {
  lastRunAt?: string
  lastRunVersion?: string
  lastRunCommit?: string
  lastRunCommand?: string
  lastRunMode?: WizardLastRunMode
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
 * @param wizard 初始化向导信息。
 * @param ui UI 展示配置。
 * @param plugins 插件配置。
 * @param models 模型配置。
 * @param agents Agent 配置。
 * @param channels 通道配置。
 * @param gateway Gateway 配置。
 * @param logging 日志配置。
 * @param bindings 通道绑定配置。
 */
export interface OpenClawConfig {
  wizard?: WizardConfig
  ui?: UiConfig
  plugins?: PluginsConfig
  models?: ModelsConfig
  agents?: AgentsConfig
  channels?: ChannelsConfig
  gateway?: GatewayConfig
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
