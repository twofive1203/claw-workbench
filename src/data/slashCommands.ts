/**
 * 斜杠命令数据定义
 * @author towfive
 */

import type { AppLocale } from '../i18n/messages'

/**
 * 命令参数类型
 */
export type CommandParameterType = 'string' | 'number' | 'choice'

/**
 * 命令参数定义
 */
export interface CommandParameter {
  name: string
  type: CommandParameterType
  required: boolean
  description: string
  choices?: string[]
}

/**
 * 命令分类
 */
export type CommandCategory = 'session' | 'system' | 'skill' | 'config' | 'control' | 'directive' | 'text'

/**
 * 斜杠命令定义
 */
export interface SlashCommand {
  name: string
  aliases?: string[]
  description: string
  category: CommandCategory
  parameters?: CommandParameter[]
  examples?: string[]
  icon?: string
}

/**
 * 命令分类图标映射
 */
export const CATEGORY_ICONS: Record<CommandCategory, string> = {
  session: '🔄',
  system: 'ℹ️',
  skill: '🤖',
  config: '⚙️',
  control: '⏹️',
  directive: '🎛️',
  text: '📝',
}

/**
 * 所有支持的斜杠命令
 */
export const SLASH_COMMANDS: SlashCommand[] = [
  // ========== 会话管理类 ==========
  {
    name: 'session',
    description: '管理会话级设置（例如 /session idle）',
    category: 'session',
    parameters: [
      {
        name: 'action',
        type: 'choice',
        required: false,
        description: '会话设置动作',
        choices: ['show', 'idle', 'set', 'get'],
      },
    ],
    examples: ['/session', '/session idle'],
    icon: '🧩',
  },
  {
    name: 'reset',
    aliases: ['new'],
    description: '重置会话或开始新会话',
    category: 'session',
    parameters: [
      {
        name: 'model',
        type: 'string',
        required: false,
        description: '可选的模型名称',
      },
    ],
    examples: ['/reset', '/new gpt-4'],
    icon: '🔄',
  },
  {
    name: 'export-session',
    aliases: ['export'],
    description: '导出会话为 HTML',
    category: 'session',
    parameters: [
      {
        name: 'path',
        type: 'string',
        required: false,
        description: '导出路径',
      },
    ],
    examples: ['/export-session', '/export ./chat.html'],
    icon: '📤',
  },

  // ========== 系统信息类 ==========
  {
    name: 'help',
    description: '显示帮助信息',
    category: 'system',
    examples: ['/help'],
    icon: '❓',
  },
  {
    name: 'commands',
    description: '列出所有斜杠命令',
    category: 'system',
    examples: ['/commands'],
    icon: '📋',
  },
  {
    name: 'status',
    description: '显示当前状态（模型提供商使用情况和配额）',
    category: 'system',
    examples: ['/status'],
    icon: '📊',
  },
  {
    name: 'whoami',
    aliases: ['id'],
    description: '显示发送者 ID',
    category: 'system',
    examples: ['/whoami', '/id'],
    icon: '👤',
  },
  {
    name: 'context',
    description: '显示上下文信息',
    category: 'system',
    parameters: [
      {
        name: 'mode',
        type: 'choice',
        required: false,
        description: '显示模式',
        choices: ['list', 'detail', 'json'],
      },
    ],
    examples: ['/context', '/context detail'],
    icon: '📄',
  },

  // ========== 技能与子代理类 ==========
  {
    name: 'skill',
    description: '按名称运行技能',
    category: 'skill',
    parameters: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: '技能名称',
      },
      {
        name: 'input',
        type: 'string',
        required: false,
        description: '技能输入参数',
      },
    ],
    examples: ['/skill summarize', '/skill translate "Hello"'],
    icon: '⚡',
  },
  {
    name: 'subagents',
    description: '管理子代理',
    category: 'skill',
    parameters: [
      {
        name: 'action',
        type: 'choice',
        required: true,
        description: '操作类型',
        choices: ['list', 'kill', 'log', 'info', 'send', 'steer', 'spawn'],
      },
    ],
    examples: ['/subagents list', '/subagents kill all'],
    icon: '🤖',
  },
  {
    name: 'acp',
    description: '管理 ACP 会话与运行时选项',
    category: 'skill',
    parameters: [
      {
        name: 'action',
        type: 'string',
        required: false,
        description: 'ACP 操作',
      },
    ],
    examples: ['/acp', '/acp list'],
    icon: '🧰',
  },
  {
    name: 'focus',
    description: '绑定当前线程到会话目标',
    category: 'skill',
    parameters: [
      {
        name: 'target',
        type: 'string',
        required: false,
        description: '目标会话或线程',
      },
    ],
    examples: ['/focus', '/focus agent:main'],
    icon: '🎯',
  },
  {
    name: 'unfocus',
    description: '移除当前线程绑定',
    category: 'skill',
    examples: ['/unfocus'],
    icon: '↩️',
  },
  {
    name: 'agents',
    description: '列出当前会话绑定的代理',
    category: 'skill',
    examples: ['/agents'],
    icon: '🧠',
  },
  {
    name: 'kill',
    description: '中止子代理',
    category: 'skill',
    parameters: [
      {
        name: 'target',
        type: 'string',
        required: true,
        description: '子代理 ID、编号或 all',
      },
    ],
    examples: ['/kill 1', '/kill all'],
    icon: '🛑',
  },
  {
    name: 'steer',
    aliases: ['tell'],
    description: '引导正在运行的子代理',
    category: 'skill',
    parameters: [
      {
        name: 'target',
        type: 'string',
        required: true,
        description: '子代理 ID 或编号',
      },
      {
        name: 'message',
        type: 'string',
        required: true,
        description: '引导消息',
      },
    ],
    examples: ['/steer 1 "请继续"', '/tell 2 "停止执行"'],
    icon: '🎯',
  },
  {
    name: 'activation',
    description: '设置组激活模式',
    category: 'skill',
    parameters: [
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: '激活模式',
      },
    ],
    examples: ['/activation', '/activation auto'],
    icon: '⚡',
  },
  {
    name: 'send',
    description: '设置发送策略',
    category: 'skill',
    parameters: [
      {
        name: 'mode',
        type: 'string',
        required: false,
        description: '发送策略模式',
      },
    ],
    examples: ['/send', '/send immediate'],
    icon: '📨',
  },

  // ========== 配置与调试类 ==========
  {
    name: 'config',
    description: '配置管理',
    category: 'config',
    parameters: [
      {
        name: 'action',
        type: 'choice',
        required: true,
        description: '操作类型',
        choices: ['show', 'get', 'set', 'unset'],
      },
    ],
    examples: ['/config show', '/config get model'],
    icon: '⚙️',
  },
  {
    name: 'debug',
    description: '调试覆盖',
    category: 'config',
    parameters: [
      {
        name: 'action',
        type: 'choice',
        required: true,
        description: '操作类型',
        choices: ['show', 'set', 'unset', 'reset'],
      },
    ],
    examples: ['/debug show', '/debug set verbose=true'],
    icon: '🐛',
  },
  {
    name: 'usage',
    description: '使用情况显示控制',
    category: 'config',
    parameters: [
      {
        name: 'mode',
        type: 'choice',
        required: true,
        description: '显示模式',
        choices: ['off', 'tokens', 'full', 'cost'],
      },
    ],
    examples: ['/usage tokens', '/usage full'],
    icon: '📈',
  },
  {
    name: 'tts',
    description: '文本转语音控制',
    category: 'config',
    parameters: [
      {
        name: 'mode',
        type: 'choice',
        required: true,
        description: '语音模式',
        choices: ['off', 'always', 'inbound', 'tagged', 'status', 'provider', 'limit', 'summary', 'audio'],
      },
    ],
    examples: ['/tts off', '/tts always'],
    icon: '🔊',
  },

  // ========== 执行控制类 ==========
  {
    name: 'stop',
    description: '停止当前运行',
    category: 'control',
    examples: ['/stop'],
    icon: '⏹️',
  },
  {
    name: 'restart',
    description: '重启 OpenClaw',
    category: 'control',
    examples: ['/restart'],
    icon: '🔄',
  },
  {
    name: 'bash',
    description: '运行主机 shell 命令',
    category: 'control',
    parameters: [
      {
        name: 'command',
        type: 'string',
        required: true,
        description: 'Shell 命令',
      },
    ],
    examples: ['/bash ls -la', '/bash pwd'],
    icon: '💻',
  },
  {
    name: 'approve',
    description: '处理执行批准',
    category: 'control',
    parameters: [
      {
        name: 'id',
        type: 'string',
        required: true,
        description: '批准 ID',
      },
      {
        name: 'action',
        type: 'choice',
        required: true,
        description: '批准动作',
        choices: ['allow-once', 'allow-always', 'deny'],
      },
    ],
    examples: ['/approve abc123 allow-once'],
    icon: '✅',
  },
  {
    name: 'pair',
    aliases: ['device-pair'],
    description: '生成配对码并处理设备配对请求',
    category: 'control',
    examples: ['/pair'],
    icon: '🔗',
  },
  {
    name: 'phone',
    aliases: ['phone-control'],
    description: '控制高风险手机节点命令开关',
    category: 'control',
    parameters: [
      {
        name: 'mode',
        type: 'choice',
        required: false,
        description: '开关模式',
        choices: ['arm', 'disarm'],
      },
    ],
    examples: ['/phone', '/phone arm'],
    icon: '📱',
  },
  {
    name: 'voice',
    aliases: ['talk-voice'],
    description: '查看或设置 ElevenLabs Talk 语音',
    category: 'control',
    parameters: [
      {
        name: 'voiceId',
        type: 'string',
        required: false,
        description: '语音 ID',
      },
    ],
    examples: ['/voice', '/voice <voiceId>'],
    icon: '🗣️',
  },

  // ========== 频道切换类 ==========
  {
    name: 'dock-telegram',
    aliases: ['dock_telegram'],
    description: '切换到 Telegram',
    category: 'control',
    examples: ['/dock-telegram'],
    icon: '✈️',
  },
  {
    name: 'dock-discord',
    aliases: ['dock_discord'],
    description: '切换到 Discord',
    category: 'control',
    examples: ['/dock-discord'],
    icon: '💬',
  },
  {
    name: 'dock-slack',
    aliases: ['dock_slack'],
    description: '切换到 Slack',
    category: 'control',
    examples: ['/dock-slack'],
    icon: '💼',
  },

  // ========== 指令类 ==========
  {
    name: 'think',
    aliases: ['thinking', 't'],
    description: '设置思考级别',
    category: 'directive',
    parameters: [
      {
        name: 'level',
        type: 'choice',
        required: true,
        description: '思考级别',
        choices: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      },
    ],
    examples: ['/think high', '/t medium'],
    icon: '🧠',
  },
  {
    name: 'verbose',
    aliases: ['v'],
    description: '控制详细模式',
    category: 'directive',
    parameters: [
      {
        name: 'mode',
        type: 'choice',
        required: true,
        description: '详细模式',
        choices: ['on', 'full', 'off'],
      },
    ],
    examples: ['/verbose on', '/v full'],
    icon: '📢',
  },
  {
    name: 'reasoning',
    aliases: ['reason'],
    description: '控制推理输出',
    category: 'directive',
    parameters: [
      {
        name: 'mode',
        type: 'choice',
        required: true,
        description: '推理模式',
        choices: ['on', 'off', 'stream'],
      },
    ],
    examples: ['/reasoning on', '/reason stream'],
    icon: '🔍',
  },
  {
    name: 'elevated',
    aliases: ['elev'],
    description: '控制提升权限模式',
    category: 'directive',
    parameters: [
      {
        name: 'mode',
        type: 'choice',
        required: true,
        description: '权限模式',
        choices: ['on', 'off', 'ask', 'full'],
      },
    ],
    examples: ['/elevated on', '/elev ask'],
    icon: '🔐',
  },
  {
    name: 'model',
    description: '显示或切换当前模型',
    category: 'directive',
    parameters: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: '模型名称',
      },
    ],
    examples: ['/model gpt-4'],
    icon: '🤖',
  },
  {
    name: 'models',
    description: '列出可用模型提供商或模型',
    category: 'directive',
    examples: ['/models'],
    icon: '📚',
  },
  {
    name: 'queue',
    description: '控制消息队列模式',
    category: 'directive',
    parameters: [
      {
        name: 'mode',
        type: 'string',
        required: true,
        description: '队列模式',
      },
    ],
    examples: ['/queue parallel', '/queue sequential'],
    icon: '📬',
  },
  {
    name: 'exec',
    description: '显示当前执行设置',
    category: 'directive',
    examples: ['/exec'],
    icon: '⚡',
  },

  // ========== 仅文本命令 ==========
  {
    name: 'compact',
    description: '压缩会话上下文',
    category: 'text',
    parameters: [
      {
        name: 'instructions',
        type: 'string',
        required: false,
        description: '压缩指令',
      },
    ],
    examples: ['/compact', '/compact "保留重要信息"'],
    icon: '🗜️',
  },
  {
    name: 'allowlist',
    description: '列出、添加或移除允许列表条目',
    category: 'config',
    examples: ['/allowlist'],
    icon: '📝',
  },
]

/**
 * 斜杠命令英文文案映射。
 */
const SLASH_COMMAND_TEXT_MAP: Record<string, string> = {
  '管理会话级设置（例如 /session idle）': 'Manage session-level settings (for example, /session idle)',
  '会话设置动作': 'Session setting action',
  '重置会话或开始新会话': 'Reset the session or start a new one',
  '可选的模型名称': 'Optional model name',
  '导出会话为 HTML': 'Export the session as HTML',
  '导出路径': 'Export path',
  '显示帮助信息': 'Show help information',
  '列出所有斜杠命令': 'List all slash commands',
  '显示当前状态（模型提供商使用情况和配额）': 'Show current status (model provider usage and quotas)',
  '显示发送者 ID': 'Show sender ID',
  '显示上下文信息': 'Show context information',
  '显示模式': 'Display mode',
  '按名称运行技能': 'Run a skill by name',
  '技能名称': 'Skill name',
  '技能输入参数': 'Skill input arguments',
  '管理子代理': 'Manage subagents',
  '操作类型': 'Action type',
  '管理 ACP 会话与运行时选项': 'Manage ACP sessions and runtime options',
  'ACP 操作': 'ACP action',
  '绑定当前线程到会话目标': 'Bind the current thread to a session target',
  '目标会话或线程': 'Target session or thread',
  '移除当前线程绑定': 'Remove the current thread binding',
  '列出当前会话绑定的代理': 'List agents bound to the current session',
  '中止子代理': 'Stop a subagent',
  '子代理 ID、编号或 all': 'Subagent ID, number, or all',
  '引导正在运行的子代理': 'Steer a running subagent',
  '子代理 ID 或编号': 'Subagent ID or number',
  '引导消息': 'Steering message',
  '/steer 1 "请继续"': '/steer 1 "Please continue"',
  '/tell 2 "停止执行"': '/tell 2 "Stop execution"',
  '设置组激活模式': 'Set group activation mode',
  '激活模式': 'Activation mode',
  '设置发送策略': 'Set sending strategy',
  '发送策略模式': 'Sending strategy mode',
  '配置管理': 'Configuration management',
  '调试覆盖': 'Debug overrides',
  '使用情况显示控制': 'Usage display control',
  '文本转语音控制': 'Text-to-speech control',
  '语音模式': 'Voice mode',
  '停止当前运行': 'Stop the current run',
  '重启 OpenClaw': 'Restart OpenClaw',
  '运行主机 shell 命令': 'Run a host shell command',
  'Shell 命令': 'Shell command',
  '处理执行批准': 'Handle execution approval',
  '批准 ID': 'Approval ID',
  '批准动作': 'Approval action',
  '生成配对码并处理设备配对请求': 'Generate a pairing code and handle device pairing requests',
  '控制高风险手机节点命令开关': 'Control the high-risk mobile node command switch',
  '开关模式': 'Switch mode',
  '查看或设置 ElevenLabs Talk 语音': 'View or set the ElevenLabs Talk voice',
  '语音 ID': 'Voice ID',
  '切换到 Telegram': 'Switch to Telegram',
  '切换到 Discord': 'Switch to Discord',
  '切换到 Slack': 'Switch to Slack',
  '设置思考级别': 'Set thinking level',
  '思考级别': 'Thinking level',
  '控制详细模式': 'Control verbose mode',
  '详细模式': 'Verbose mode',
  '控制推理输出': 'Control reasoning output',
  '推理模式': 'Reasoning mode',
  '控制提升权限模式': 'Control elevated permission mode',
  '权限模式': 'Permission mode',
  '显示或切换当前模型': 'Show or switch the current model',
  '模型名称': 'Model name',
  '列出可用模型提供商或模型': 'List available model providers or models',
  '控制消息队列模式': 'Control message queue mode',
  '队列模式': 'Queue mode',
  '显示当前执行设置': 'Show current execution settings',
  '压缩会话上下文': 'Compact session context',
  '压缩指令': 'Compaction instructions',
  '/compact "保留重要信息"': '/compact "Keep important information"',
  '列出、添加或移除允许列表条目': 'List, add, or remove allowlist entries',
}

/**
 * 按语言翻译斜杠命令文本。
 * @param text 原始文本。
 * @param locale 当前语言。
 */
function translateSlashCommandText(text: string, locale: AppLocale): string {
  if (locale !== 'en-US') {
    return text
  }

  return SLASH_COMMAND_TEXT_MAP[text] ?? text
}

/**
 * 按语言翻译命令参数。
 * @param parameter 原始参数定义。
 * @param locale 当前语言。
 */
function localizeCommandParameter(parameter: CommandParameter, locale: AppLocale): CommandParameter {
  if (locale !== 'en-US') {
    return parameter
  }

  return {
    ...parameter,
    description: translateSlashCommandText(parameter.description, locale),
  }
}

/**
 * 按语言翻译斜杠命令。
 * @param command 原始命令定义。
 * @param locale 当前语言。
 */
export function localizeSlashCommand(command: SlashCommand, locale: AppLocale): SlashCommand {
  if (locale !== 'en-US') {
    return command
  }

  return {
    ...command,
    description: translateSlashCommandText(command.description, locale),
    parameters: command.parameters?.map(parameter => localizeCommandParameter(parameter, locale)),
    examples: command.examples?.map(example => translateSlashCommandText(example, locale)),
  }
}

/**
 * 获取当前语言下的命令列表。
 * @param locale 当前语言。
 */
export function getLocalizedSlashCommands(locale: AppLocale = 'zh-CN'): SlashCommand[] {
  if (locale !== 'en-US') {
    return SLASH_COMMANDS
  }

  return SLASH_COMMANDS.map(command => localizeSlashCommand(command, locale))
}

/**
 * 根据命令名或别名查找命令
 * @param query 查询字符串
 * @param locale 当前语言
 */
export function findCommand(query: string, locale: AppLocale = 'zh-CN'): SlashCommand | null {
  const commands = getLocalizedSlashCommands(locale)
  const lowerQuery = query.toLowerCase()
  return commands.find(
    cmd => cmd.name.toLowerCase() === lowerQuery
      || cmd.aliases?.some(alias => alias.toLowerCase() === lowerQuery),
  ) ?? null
}

/**
 * 过滤命令列表
 * @param query 搜索关键词
 * @param locale 当前语言
 */
export function filterCommands(query: string, locale: AppLocale = 'zh-CN'): SlashCommand[] {
  const commands = getLocalizedSlashCommands(locale)

  if (!query) return commands

  const lowerQuery = query.toLowerCase()
  return commands
    .filter(cmd => {
      // 命令名前缀匹配（包含精确匹配）
      const nameMatch = cmd.name.toLowerCase().startsWith(lowerQuery)
      // 别名前缀匹配（包含精确匹配，支持直接输入别名如 /new）
      const aliasMatch = cmd.aliases?.some(alias => {
        const lowerAlias = alias.toLowerCase()
        return lowerAlias.startsWith(lowerQuery)
      })
      return nameMatch || aliasMatch
    })
    .sort((a, b) => {
      // 1. 精确匹配命令名或别名的优先级最高
      const aExactName = a.name.toLowerCase() === lowerQuery
      const bExactName = b.name.toLowerCase() === lowerQuery
      const aExactAlias = a.aliases?.some(alias => alias.toLowerCase() === lowerQuery)
      const bExactAlias = b.aliases?.some(alias => alias.toLowerCase() === lowerQuery)

      if ((aExactName || aExactAlias) && !(bExactName || bExactAlias)) return -1
      if (!(aExactName || aExactAlias) && (bExactName || bExactAlias)) return 1

      // 2. 命令名以查询开头的优先级次之
      const aStarts = a.name.toLowerCase().startsWith(lowerQuery)
      const bStarts = b.name.toLowerCase().startsWith(lowerQuery)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1

      // 3. 别名以查询开头的优先级再次之
      const aAliasStarts = a.aliases?.some(alias => alias.toLowerCase().startsWith(lowerQuery))
      const bAliasStarts = b.aliases?.some(alias => alias.toLowerCase().startsWith(lowerQuery))
      if (aAliasStarts && !bAliasStarts) return -1
      if (!aAliasStarts && bAliasStarts) return 1

      // 4. 最后按字母顺序排序
      return a.name.localeCompare(b.name)
    })
}

/**
 * 构建命令文本（带参数占位符）
 * @param command 命令对象
 * @param includeOptional 是否包含可选参数，默认 false
 */
export function buildCommandText(command: SlashCommand, includeOptional = false): string {
  let text = `/${command.name}`

  if (command.parameters?.length) {
    const params = command.parameters
      .filter(p => includeOptional || p.required)
      .map(p => p.required ? `<${p.name}>` : `[${p.name}]`)
      .join(' ')

    if (params) {
      text += ` ${params}`
    }
  }

  return text
}
