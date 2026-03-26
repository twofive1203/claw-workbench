import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Settings2, ToggleLeft, ToggleRight, Loader2 } from 'lucide-react'
import type { RpcCaller } from '../../../hooks/useConfigRpc'
import { isRecord } from '../../../lib/parsers'

/**
 * Skill 依赖要求结构。
 */
interface SkillRequirements {
  bins: string[]
  anyBins: string[]
  env: string[]
  config: string[]
  os: string[]
}

/**
 * Skill 状态信息。
 */
export interface SkillStatus {
  name: string
  description: string
  source: string
  filePath: string
  skillKey: string
  enabled: boolean
  disabled: boolean
  blockedByAllowlist: boolean
  eligible: boolean
  requirements: SkillRequirements
  missing: SkillRequirements
  install?: unknown[]
}

/**
 * skills.status RPC 响应。
 */
interface SkillsStatusResponse {
  workspaceDir?: string
  managedSkillsDir?: string
  skills?: unknown[]
}

/**
 * SkillsSection 组件属性。
 * @param callRpc RPC 调用器。
 * @param isConnected 是否已连接。
 */
interface SkillsSectionProps {
  callRpc: RpcCaller
  isConnected: boolean
}

/**
 * 转换字符串数组（自动裁剪空白并去除空值）。
 * @param value 待转换值。
 */
function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

/**
 * 构建空的依赖要求对象。
 */
function createEmptyRequirements(): SkillRequirements {
  return {
    bins: [],
    anyBins: [],
    env: [],
    config: [],
    os: [],
  }
}

/**
 * 归一化 Gateway 返回的 requirements/missing 字段。
 * @param value 原始值（兼容旧版数组结构与新版对象结构）。
 */
function normalizeRequirements(value: unknown): SkillRequirements {
  if (Array.isArray(value)) {
    return {
      ...createEmptyRequirements(),
      bins: toStringList(value),
    }
  }

  if (!isRecord(value)) {
    return createEmptyRequirements()
  }

  return {
    bins: toStringList(value.bins),
    anyBins: toStringList(value.anyBins),
    env: toStringList(value.env),
    config: toStringList(value.config),
    os: toStringList(value.os),
  }
}

/**
 * 将单条 skill 状态归一化为前端结构。
 * @param value skills.status 返回中的单条记录。
 */
function normalizeSkillStatus(value: unknown): SkillStatus | null {
  if (!isRecord(value)) return null

  const skillKey = typeof value.skillKey === 'string' ? value.skillKey.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const fallbackName = name || skillKey
  if (!fallbackName) return null

  const disabled = value.disabled === true
  const enabled = typeof value.enabled === 'boolean' ? value.enabled : !disabled
  const missing = normalizeRequirements(value.missing)
  const hasMissing =
    missing.bins.length > 0 ||
    missing.anyBins.length > 0 ||
    missing.env.length > 0 ||
    missing.config.length > 0 ||
    missing.os.length > 0
  const blockedByAllowlist = value.blockedByAllowlist === true

  return {
    name: fallbackName,
    description: typeof value.description === 'string' ? value.description : '',
    source: typeof value.source === 'string' ? value.source : 'unknown',
    filePath: typeof value.filePath === 'string' ? value.filePath : '',
    skillKey: skillKey || fallbackName,
    enabled,
    disabled,
    blockedByAllowlist,
    eligible: typeof value.eligible === 'boolean' ? value.eligible : enabled && !blockedByAllowlist && !hasMissing,
    requirements: normalizeRequirements(value.requirements),
    missing,
    install: Array.isArray(value.install) ? value.install : undefined,
  }
}

/**
 * 生成 skill 条件不满足的详细原因文本。
 * @param skill Skill 状态。
 */
function buildSkillIssueTexts(skill: SkillStatus): string[] {
  const issues: string[] = []

  if (skill.disabled) {
    issues.push('已手动禁用')
  }

  if (skill.blockedByAllowlist) {
    issues.push('未包含在 skills.allowBundled 允许列表')
  }

  if (skill.missing.bins.length > 0) {
    issues.push(`缺少命令: ${skill.missing.bins.join(', ')}`)
  }

  if (skill.missing.anyBins.length > 0) {
    issues.push(`缺少任一命令: ${skill.missing.anyBins.join(', ')}`)
  }

  if (skill.missing.env.length > 0) {
    issues.push(`缺少环境变量: ${skill.missing.env.join(', ')}`)
  }

  if (skill.missing.config.length > 0) {
    issues.push(`缺少配置项: ${skill.missing.config.join(', ')}`)
  }

  if (skill.missing.os.length > 0) {
    issues.push(`系统要求: ${skill.missing.os.join(', ')}`)
  }

  return issues
}

/**
 * Skill 列表分区组件。
 */
export function SkillsSection({ callRpc, isConnected }: SkillsSectionProps) {
  const [skills, setSkills] = useState<SkillStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  /**
   * 加载 skills 列表。
   */
  const loadSkills = useCallback(async () => {
    if (!isConnected) {
      setError('未连接到 Gateway')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await callRpc<SkillsStatusResponse>('skills.status', {})
      const rows: unknown[] = Array.isArray(response.skills) ? response.skills : []
      const normalized = rows
        .map((row: unknown) => normalizeSkillStatus(row))
        .filter((row): row is SkillStatus => Boolean(row))
      setSkills(normalized)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载 skills 失败')
    } finally {
      setLoading(false)
    }
  }, [callRpc, isConnected])

  /**
   * 切换 skill 启用状态。
   * @param skillKey skill 唯一标识。
   * @param currentEnabled 当前启用状态。
   */
  const toggleSkill = useCallback(async (skillKey: string, currentEnabled: boolean) => {
    setUpdating(skillKey)

    try {
      await callRpc('skills.update', {
        skillKey,
        enabled: !currentEnabled,
      })
      // 重新加载以获取最新状态
      await loadSkills()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 skill 失败')
    } finally {
      setUpdating(null)
    }
  }, [callRpc, loadSkills])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-200">Skills 管理</h3>
        <button
          type="button"
          onClick={loadSkills}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-300 hover:border-gray-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-800 bg-red-900/20 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {!isConnected ? (
        <div className="rounded-md border border-yellow-800 bg-yellow-900/20 p-3 text-xs text-yellow-200">
          未连接到 Gateway，无法加载 Skills。请确保 OpenClaw Gateway 正在运行。
        </div>
      ) : loading && skills.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-xs text-gray-500">
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          加载中...
        </div>
      ) : skills.length === 0 ? (
        <div className="rounded-md border border-gray-800 bg-gray-900/50 p-4 text-center text-xs text-gray-500">
          暂无已安装的 Skills
        </div>
      ) : (
        <div className="space-y-2">
          {skills.map(skill => {
            const issues = buildSkillIssueTexts(skill)

            return (
              <div
                key={skill.skillKey}
                className="flex items-start justify-between rounded-md border border-gray-800 bg-gray-900/50 p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">{skill.name}</span>
                    {!skill.eligible && (
                      <span className="rounded bg-yellow-900/50 px-1.5 py-0.5 text-[10px] text-yellow-200">
                        条件不满足
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-400 line-clamp-2">
                    {skill.description || '暂无描述'}
                  </p>
                  {issues.map((issue, index) => (
                    <p
                      key={`${skill.skillKey}-issue-${index}`}
                      className="mt-1 text-xs text-red-400"
                    >
                      {issue}
                    </p>
                  ))}
                  <p className="mt-1 text-[10px] text-gray-500">
                    来源: {skill.source} | 路径: {skill.filePath}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => toggleSkill(skill.skillKey, skill.enabled)}
                  disabled={updating === skill.skillKey}
                  className="ml-3 flex-shrink-0 text-gray-400 hover:text-gray-300 disabled:opacity-50"
                  title={skill.enabled ? '点击禁用' : '点击启用'}
                >
                  {updating === skill.skillKey ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : skill.enabled ? (
                    <ToggleRight className="h-5 w-5 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-5 w-5" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="rounded-md border border-gray-800 bg-gray-900/30 p-3">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Settings2 className="h-4 w-4" />
          <span>Skills 通过 Gateway RPC 管理。当前支持: 列出、启用/禁用。</span>
        </div>
      </div>
    </div>
  )
}
