import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import type { ConfigValidationIssue } from '../../../lib/configSchema'
import {
  ensureProviderUserAgentHeader,
  type OpenClawConfig,
  type ProviderConfig,
  type ProviderModel,
} from '../../../types/config'
import { FormField } from '../shared/FormField'
import { KeyValueEditor } from '../shared/KeyValueEditor'
import { SecretInput } from '../shared/SecretInput'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { filterSectionIssues, findIssueByPath } from './utils'

const API_OPTIONS: SelectOption[] = [
  { label: 'OpenAI Completions', value: 'openai-completions' },
  { label: 'OpenAI Responses', value: 'openai-responses' },
  { label: 'Anthropic Messages', value: 'anthropic-messages' },
  { label: 'Google Generative AI', value: 'google-generative-ai' },
  { label: 'Bedrock Converse Stream', value: 'bedrock-converse-stream' },
  { label: 'GitHub Copilot', value: 'github-copilot' },
  { label: 'Ollama', value: 'ollama' },
]

const AUTH_OPTIONS: SelectOption[] = [
  { label: 'API Key', value: 'api-key' },
  { label: 'OAuth（高级）', value: 'oauth' },
  { label: 'Token（高级）', value: 'token' },
  { label: 'AWS SDK', value: 'aws-sdk' },
]

type ModelsViewMode = 'builtin-auth' | 'custom-provider'
type BuiltinOauthProviderId = 'openai-codex' | 'google-gemini-cli'

interface BuiltinOauthProviderGuide {
  title: string
  authType: string
  modelExample: string
  commands: string[]
  notes: string[]
}

const BUILTIN_OAUTH_PROVIDER_OPTIONS: SelectOption[] = [
  { label: 'OpenAI Codex', value: 'openai-codex' },
  { label: 'Google Gemini CLI', value: 'google-gemini-cli' },
]

const BUILTIN_OAUTH_PROVIDER_GUIDES: Record<BuiltinOauthProviderId, BuiltinOauthProviderGuide> = {
  'openai-codex': {
    title: 'OpenAI Codex（内置 Provider）',
    authType: 'OAuth（ChatGPT 登录）',
    modelExample: 'openai-codex/gpt-5.3-codex',
    commands: [
      'openclaw models auth login --provider openai-codex',
      'openclaw models set openai-codex/gpt-5.3-codex',
    ],
    notes: [
      '无需在 models.providers 中手动配置 baseUrl。',
      '无需在这里手工录入 apiKey，凭据由 auth profile 管理。',
    ],
  },
  'google-gemini-cli': {
    title: 'Google Gemini CLI（内置 Provider）',
    authType: 'OAuth（Gemini CLI 插件流程）',
    modelExample: 'google-gemini-cli/<模型ID>',
    commands: [
      'openclaw plugins enable google-gemini-cli-auth',
      'openclaw models auth login --provider google-gemini-cli --set-default',
    ],
    notes: [
      '无需在 models.providers 中手动配置 baseUrl。',
      '无需在这里手工录入 client id / secret，登录流程会写入 auth profile。',
    ],
  },
}

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'
const EMPTY_PROVIDERS: Record<string, ProviderConfig> = {}

/**
 * Models 分区组件属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface ModelsSectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 生成默认 providerId。
 * @param existingIds 已存在的 providerId 列表。
 */
function createProviderId(existingIds: string[]): string {
  let index = 1
  while (existingIds.includes(`provider-${index}`)) {
    index += 1
  }
  return `provider-${index}`
}

/**
 * 重命名 providerId，并保持原有顺序。
 * @param providers 当前 providers 对象。
 * @param sourceId 原 providerId。
 * @param targetId 目标 providerId。
 */
function renameProviderId(
  providers: Record<string, ProviderConfig>,
  sourceId: string,
  targetId: string,
): Record<string, ProviderConfig> {
  const nextProviders: Record<string, ProviderConfig> = {}
  Object.entries(providers).forEach(([providerId, provider]) => {
    if (providerId === sourceId) {
      nextProviders[targetId] = ensureProviderUserAgentHeader(provider)
      return
    }
    nextProviders[providerId] = provider
  })
  return nextProviders
}

/**
 * 交换数组项位置。
 * @param source 原始数组。
 * @param fromIndex 拖拽起始索引。
 * @param toIndex 拖拽目标索引。
 */
function moveArrayItem<T>(source: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return source
  if (fromIndex < 0 || fromIndex >= source.length) return source
  if (toIndex < 0 || toIndex >= source.length) return source

  const next = [...source]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * 按指定顺序重建 providers 对象。
 * @param providers 当前 providers 对象。
 * @param orderedIds 目标 providerId 顺序。
 */
function reorderProvidersByIds(
  providers: Record<string, ProviderConfig>,
  orderedIds: string[],
): Record<string, ProviderConfig> {
  const nextProviders: Record<string, ProviderConfig> = {}
  const usedProviderIds = new Set<string>()

  for (const providerId of orderedIds) {
    if (!Object.prototype.hasOwnProperty.call(providers, providerId)) continue
    if (usedProviderIds.has(providerId)) continue
    nextProviders[providerId] = providers[providerId]
    usedProviderIds.add(providerId)
  }

  Object.entries(providers).forEach(([providerId, provider]) => {
    if (usedProviderIds.has(providerId)) return
    nextProviders[providerId] = provider
  })

  return nextProviders
}

/**
 * 拖拽自动滚动容器类型。
 */
type DragScrollContainer = HTMLElement | Window

/**
 * 判断容器是否为 Window。
 * @param container 滚动容器。
 */
function isWindowContainer(container: DragScrollContainer): container is Window {
  return container instanceof Window
}

/**
 * 判断元素是否可纵向滚动。
 * @param element 目标元素。
 */
function isElementScrollable(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  const overflowY = style.overflowY
  if (overflowY !== 'auto' && overflowY !== 'scroll') return false
  return element.scrollHeight > element.clientHeight + 1
}

/**
 * 从起始元素向上查找最近的可滚动容器。
 * @param startElement 起始元素。
 */
function findScrollContainer(startElement: HTMLElement | null): DragScrollContainer {
  let current: HTMLElement | null = startElement
  while (current) {
    if (isElementScrollable(current)) return current
    current = current.parentElement
  }
  return window
}

/**
 * 获取滚动容器在视口中的上下边界。
 * @param container 滚动容器。
 */
function getContainerBounds(container: DragScrollContainer): { top: number; bottom: number; height: number } {
  if (isWindowContainer(container)) {
    return {
      top: 0,
      bottom: window.innerHeight,
      height: window.innerHeight,
    }
  }

  const rect = container.getBoundingClientRect()
  return {
    top: rect.top,
    bottom: rect.bottom,
    height: rect.height,
  }
}

/**
 * 解析自动滚动步进值。
 * @param pointerY 指针在视口中的 y 坐标。
 * @param container 滚动容器。
 */
function resolveAutoScrollDelta(pointerY: number, container: DragScrollContainer): number {
  const bounds = getContainerBounds(container)
  const edgeSize = Math.max(56, Math.min(96, Math.round(bounds.height * 0.2)))
  const maxStep = 18
  const upperEdge = bounds.top + edgeSize
  const lowerEdge = bounds.bottom - edgeSize

  if (pointerY < upperEdge) {
    const ratio = Math.min((upperEdge - pointerY) / edgeSize, 1)
    return -Math.max(1, Math.round(maxStep * ratio * ratio))
  }

  if (pointerY > lowerEdge) {
    const ratio = Math.min((pointerY - lowerEdge) / edgeSize, 1)
    return Math.max(1, Math.round(maxStep * ratio * ratio))
  }

  return 0
}

/**
 * 判断容器是否还能继续滚动。
 * @param container 滚动容器。
 * @param delta 计划滚动位移。
 */
function canContainerScrollBy(container: DragScrollContainer, delta: number): boolean {
  if (isWindowContainer(container)) {
    const scrollingElement = document.scrollingElement ?? document.documentElement
    if (delta < 0) return scrollingElement.scrollTop > 0

    const maxScrollTop = scrollingElement.scrollHeight - scrollingElement.clientHeight
    return scrollingElement.scrollTop < maxScrollTop
  }

  if (delta < 0) return container.scrollTop > 0
  const maxScrollTop = container.scrollHeight - container.clientHeight
  return container.scrollTop < maxScrollTop
}

/**
 * 按位移滚动容器。
 * @param container 滚动容器。
 * @param delta 计划滚动位移。
 */
function scrollContainerBy(container: DragScrollContainer, delta: number) {
  if (isWindowContainer(container)) {
    window.scrollBy({ top: delta, left: 0, behavior: 'auto' })
    return
  }
  container.scrollTop += delta
}

/**
 * 解析可选数字。
 * @param value 输入文本。
 */
function parseOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * 将数字转为输入框文本。
 * @param value 数值。
 */
function numberToInput(value: number | undefined): string {
  return typeof value === 'number' ? String(value) : ''
}

/**
 * 将 reasoning 值转换为输入文本。
 * @param value reasoning 原始值。
 */
function reasoningToInput(value: ProviderModel['reasoning']): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return value
  return ''
}

/**
 * 解析 reasoning 输入值。
 * @param value 输入文本。
 */
function parseReasoning(value: string): ProviderModel['reasoning'] {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  return trimmed
}

/**
 * 生成 auth 字段说明文案。
 * @param authMode 当前 auth 模式。
 */
function getAuthDescription(authMode: string | undefined): string {
  if (authMode === 'aws-sdk') {
    return 'AWS SDK 凭据链模式，适用于 Bedrock 等场景。'
  }
  if (authMode === 'oauth') {
    return '优先使用 OAuth profile，apiKey 可作为兜底。'
  }
  if (authMode === 'token') {
    return '使用 Token 型凭据，apiKey 可作为兜底。'
  }
  if (authMode === 'api-key') {
    return '直接使用 API Key 进行认证。'
  }
  return '留空表示自动模式：按 profile / 环境变量 / apiKey 顺序解析。'
}

/**
 * 根据 auth 模式生成 apiKey 输入框元信息。
 * @param authMode 当前 auth 模式。
 */
function getApiKeyFieldMeta(authMode: string | undefined): {
  disabled: boolean
  placeholder: string
  description: string
} {
  if (authMode === 'aws-sdk') {
    return {
      disabled: true,
      placeholder: 'AWS SDK 模式下不需要 apiKey',
      description: '当前为 aws-sdk 模式，运行时使用 AWS 凭据链，apiKey 字段不生效。',
    }
  }
  if (authMode === 'oauth') {
    return {
      disabled: false,
      placeholder: '可选：作为 OAuth 失败时的回退 Key',
      description: '建议优先配置 OAuth profile；此处 apiKey 可作为回退凭据。',
    }
  }
  if (authMode === 'token') {
    return {
      disabled: false,
      placeholder: '输入 Token（或回退 Key）',
      description: 'Token 模式可配合 auth profile 使用；此处值可作为兜底。',
    }
  }
  return {
    disabled: false,
    placeholder: '输入 API Key',
    description: '可直接填写密钥，或改用环境变量与 auth profile。',
  }
}

/**
 * 生成 api 与 auth 组合提示。
 * @param apiType 当前 API 适配器。
 * @param authMode 当前 auth 模式。
 */
function getApiAuthHint(apiType: string | undefined, authMode: string | undefined): string | null {
  if (apiType === 'bedrock-converse-stream' && authMode !== 'aws-sdk') {
    return '当前 API 为 Bedrock，建议将 auth 设为 AWS SDK。'
  }
  return null
}

/**
 * 计算模型配置页默认显示模式。
 * @param providerCount 当前自定义 provider 数量。
 */
function resolveInitialViewMode(providerCount: number): ModelsViewMode {
  return providerCount > 0 ? 'custom-provider' : 'builtin-auth'
}

/**
 * 获取模式说明文案。
 * @param mode 当前显示模式。
 */
function getViewModeDescription(mode: ModelsViewMode): string {
  if (mode === 'builtin-auth') {
    return '用于 Codex / Gemini CLI 等内置 Provider 登录指引，不需要配置 baseUrl。'
  }
  return '用于 OpenAI/Anthropic 兼容代理、自建网关等自定义 Provider 配置。'
}

/**
 * 模型与供应商分区。
 * @param props 组件属性。
 */
export function ModelsSection(props: ModelsSectionProps) {
  const { config, issues, updateConfig } = props
  const providers = config.models?.providers ?? EMPTY_PROVIDERS
  const providerIds = useMemo(() => Object.keys(providers), [providers])
  const [viewMode, setViewMode] = useState<ModelsViewMode>(() => resolveInitialViewMode(providerIds.length))
  const [selectedBuiltinOauthProvider, setSelectedBuiltinOauthProvider] =
    useState<BuiltinOauthProviderId>('openai-codex')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [draggingProviderId, setDraggingProviderId] = useState<string | null>(null)
  const providerIdsRef = useRef(providerIds)
  const dragPointerYRef = useRef<number | null>(null)
  const autoScrollFrameRef = useRef<number | null>(null)
  const dragScrollContainerRef = useRef<DragScrollContainer>(window)
  const [providerIdDrafts, setProviderIdDrafts] = useState<Record<string, string>>({})
  const [providerIdError, setProviderIdError] = useState<{ providerId: string; message: string } | null>(null)
  const resolvedProviderId = useMemo(() => {
    if (providerIds.length === 0) return null
    if (selectedProviderId && providerIds.includes(selectedProviderId)) return selectedProviderId
    return providerIds[0]
  }, [providerIds, selectedProviderId])
  const selectedProvider = resolvedProviderId ? providers[resolvedProviderId] ?? {} : null
  const sectionIssues = useMemo(() => filterSectionIssues(issues, 'models'), [issues])
  const viewModeDescription = getViewModeDescription(viewMode)
  const selectedBuiltinOauthGuide = BUILTIN_OAUTH_PROVIDER_GUIDES[selectedBuiltinOauthProvider]
  const providerIdDraft = resolvedProviderId ? providerIdDrafts[resolvedProviderId] ?? resolvedProviderId : ''
  const providerRenameError =
    resolvedProviderId && providerIdError?.providerId === resolvedProviderId ? providerIdError.message : null

  /**
   * 同步 providerId 列表引用，避免拖拽时读取旧值。
   */
  useEffect(() => {
    providerIdsRef.current = providerIds
  }, [providerIds])

  /**
   * 结束自动滚动循环并清理缓存。
   */
  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(autoScrollFrameRef.current)
      autoScrollFrameRef.current = null
    }
    dragPointerYRef.current = null
    dragScrollContainerRef.current = window
  }, [])

  /**
   * 清理 Provider 拖拽状态。
   */
  const clearProviderDragging = useCallback(() => {
    stopAutoScroll()
    setDraggingProviderId(null)
  }, [stopAutoScroll])

  /**
   * 拖拽过程中，指针抬起后结束排序模式。
   */
  useEffect(() => {
    if (!draggingProviderId) return

    const handlePointerUp = () => {
      clearProviderDragging()
    }

    const handlePointerMove = (event: globalThis.PointerEvent) => {
      dragPointerYRef.current = event.clientY
    }

    const runAutoScroll = () => {
      const pointerY = dragPointerYRef.current
      if (pointerY !== null) {
        const container = dragScrollContainerRef.current
        const delta = resolveAutoScrollDelta(pointerY, container)
        if (delta !== 0 && canContainerScrollBy(container, delta)) {
          scrollContainerBy(container, delta)
        }
      }
      autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)
    }

    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    window.addEventListener('blur', handlePointerUp)
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll)

    return () => {
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      window.removeEventListener('blur', handlePointerUp)
      window.removeEventListener('pointermove', handlePointerMove)
      stopAutoScroll()
    }
  }, [clearProviderDragging, draggingProviderId, stopAutoScroll])

  /**
   * 更新 providers 对象。
   * @param updater providers 更新函数。
   */
  const updateProviders = (updater: (current: Record<string, ProviderConfig>) => Record<string, ProviderConfig>) => {
    updateConfig(prev => {
      const previousModels = prev.models ?? {}
      const currentProviders = previousModels.providers ?? {}
      return {
        ...prev,
        models: {
          ...previousModels,
          providers: updater(currentProviders),
        },
      }
    })
  }

  /**
   * 更新当前选中 provider。
   * @param updater provider 更新函数。
   */
  const updateSelectedProvider = (updater: (provider: ProviderConfig) => ProviderConfig) => {
    if (!resolvedProviderId) return
    updateProviders(current => ({
      ...current,
      [resolvedProviderId]: ensureProviderUserAgentHeader(updater(current[resolvedProviderId] ?? {})),
    }))
  }

  /**
   * 将 providerId 列表顺序写回 providers 对象。
   * @param orderedProviderIds 目标 providerId 顺序。
   */
  const applyProviderOrder = (orderedProviderIds: string[]) => {
    providerIdsRef.current = orderedProviderIds
    updateProviders(current => reorderProvidersByIds(current, orderedProviderIds))
  }

  /**
   * 调整 Provider 在列表中的顺序。
   * @param fromIndex 当前索引。
   * @param toIndex 目标索引。
   */
  const moveProvider = (fromIndex: number, toIndex: number) => {
    const nextProviderIds = moveArrayItem(providerIdsRef.current, fromIndex, toIndex)
    if (nextProviderIds === providerIdsRef.current) return
    applyProviderOrder(nextProviderIds)
  }

  /**
   * 将 Provider 上移一位。
   * @param providerId 目标 providerId。
   */
  const moveProviderUp = (providerId: string) => {
    const currentIndex = providerIdsRef.current.indexOf(providerId)
    moveProvider(currentIndex, currentIndex - 1)
  }

  /**
   * 将 Provider 下移一位。
   * @param providerId 目标 providerId。
   */
  const moveProviderDown = (providerId: string) => {
    const currentIndex = providerIdsRef.current.indexOf(providerId)
    moveProvider(currentIndex, currentIndex + 1)
  }

  /**
   * 开始拖拽排序（按住图标）。
   * @param providerId 当前 providerId。
   * @param event 指针事件。
   */
  const handleProviderSortPointerDown = (providerId: string, event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    dragPointerYRef.current = event.clientY
    dragScrollContainerRef.current = findScrollContainer(event.currentTarget)
    setDraggingProviderId(providerId)
  }

  /**
   * 图标上抬起指针时结束排序。
   * @param event 指针事件。
   */
  const handleProviderSortPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    clearProviderDragging()
  }

  /**
   * 指针进入行时执行重排。
   * @param providerId 目标 providerId。
   */
  const handleProviderRowPointerEnter = (providerId: string) => {
    if (!draggingProviderId) return
    if (draggingProviderId === providerId) return

    const fromIndex = providerIdsRef.current.indexOf(draggingProviderId)
    const toIndex = providerIdsRef.current.indexOf(providerId)
    if (fromIndex < 0 || toIndex < 0) return
    moveProvider(fromIndex, toIndex)
  }

  /**
   * 新增 provider。
   */
  const handleAddProvider = () => {
    const nextId = createProviderId(providerIds)
    updateProviders(current => ({
      ...current,
      [nextId]: ensureProviderUserAgentHeader({
        baseUrl: '',
        models: [],
      }),
    }))
    setSelectedProviderId(nextId)
    setProviderIdDrafts(current => ({
      ...current,
      [nextId]: nextId,
    }))
    setProviderIdError(null)
  }

  /**
   * 删除 provider。
   * @param providerId 目标 providerId。
   */
  const handleRemoveProvider = (providerId: string) => {
    updateProviders(current => {
      const nextProviders = { ...current }
      delete nextProviders[providerId]
      return nextProviders
    })
    if (resolvedProviderId === providerId) {
      const nextId = providerIds.find(item => item !== providerId) ?? null
      setSelectedProviderId(nextId)
    }
    if (draggingProviderId === providerId) {
      clearProviderDragging()
    }
  }

  /**
   * 重命名当前选中 provider。
   */
  const handleRenameProvider = () => {
    if (!resolvedProviderId) return
    const normalizedId = providerIdDraft.trim()

    if (!normalizedId) {
      setProviderIdError({
        providerId: resolvedProviderId,
        message: 'Provider 名称不能为空',
      })
      return
    }
    if (normalizedId === resolvedProviderId) {
      setProviderIdError(null)
      return
    }
    if (providerIds.includes(normalizedId)) {
      setProviderIdError({
        providerId: resolvedProviderId,
        message: 'Provider 名称已存在',
      })
      return
    }

    updateProviders(current => renameProviderId(current, resolvedProviderId, normalizedId))
    setProviderIdDrafts(current => {
      const nextDrafts = { ...current }
      delete nextDrafts[resolvedProviderId]
      nextDrafts[normalizedId] = normalizedId
      return nextDrafts
    })
    setSelectedProviderId(normalizedId)
    setProviderIdError(null)
    if (draggingProviderId === resolvedProviderId) {
      setDraggingProviderId(normalizedId)
    }
  }

  /**
   * 更新模型行。
   * @param index 模型索引。
   * @param updater 模型更新函数。
   */
  const updateProviderModel = (index: number, updater: (model: ProviderModel) => ProviderModel) => {
    updateSelectedProvider(provider => {
      const currentModels = Array.isArray(provider.models) ? provider.models : []
      const nextModels = currentModels.map((model, modelIndex) => {
        if (modelIndex !== index) return model
        return updater(model ?? {})
      })
      return {
        ...provider,
        models: nextModels,
      }
    })
  }

  /**
   * 新增模型行。
   */
  const handleAddModel = () => {
    updateSelectedProvider(provider => {
      const currentModels = Array.isArray(provider.models) ? provider.models : []
      return {
        ...provider,
        models: [...currentModels, { id: '' }],
      }
    })
  }

  /**
   * 删除模型行。
   * @param index 模型索引。
   */
  const handleRemoveModel = (index: number) => {
    updateSelectedProvider(provider => {
      const currentModels = Array.isArray(provider.models) ? provider.models : []
      return {
        ...provider,
        models: currentModels.filter((_, modelIndex) => modelIndex !== index),
      }
    })
  }

  const providerPathPrefix = resolvedProviderId ? `models.providers.${resolvedProviderId}` : ''
  const providerModels = Array.isArray(selectedProvider?.models) ? selectedProvider.models : []
  const selectedAuthMode = selectedProvider?.auth
  const authDescription = getAuthDescription(selectedAuthMode)
  const apiKeyFieldMeta = getApiKeyFieldMeta(selectedAuthMode)
  const apiAuthHint = getApiAuthHint(selectedProvider?.api, selectedAuthMode)

  return (
    <div className="space-y-3">
      <section className="rounded-lg border border-gray-700 bg-gray-900/60 p-3">
        <div className="mb-2 text-xs font-medium text-gray-300">配置模式</div>
        <div className="inline-flex rounded-md border border-gray-700 bg-gray-950/40 p-0.5">
          <button
            type="button"
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              viewMode === 'builtin-auth'
                ? 'bg-blue-500/20 text-blue-200'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setViewMode('builtin-auth')}
          >
            内置认证
          </button>
          <button
            type="button"
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              viewMode === 'custom-provider'
                ? 'bg-blue-500/20 text-blue-200'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setViewMode('custom-provider')}
          >
            自定义 Provider
          </button>
        </div>
        <div className="mt-2 text-[11px] text-gray-500">{viewModeDescription}</div>
      </section>

      {viewMode === 'builtin-auth' ? (
        <section className="rounded-lg border border-gray-700 bg-gray-900/60 p-3">
          <div className="text-xs font-medium text-gray-300">内置 Provider 认证指引</div>
          <div className="mt-1 text-[11px] text-gray-500">此模式用于 OAuth 登录，不会写入 models.providers 配置。</div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="内置 Provider">
              <SelectField
                value={selectedBuiltinOauthProvider}
                options={BUILTIN_OAUTH_PROVIDER_OPTIONS}
                placeholder="请选择内置 Provider"
                onChange={nextValue => {
                  if (nextValue === 'openai-codex' || nextValue === 'google-gemini-cli') {
                    setSelectedBuiltinOauthProvider(nextValue)
                  }
                }}
              />
            </FormField>

            <div className="rounded-md border border-gray-700 bg-gray-950/40 px-2.5 py-2">
              <div className="text-[11px] text-gray-500">认证方式</div>
              <div className="mt-1 text-xs text-gray-200">{selectedBuiltinOauthGuide.authType}</div>
            </div>

            <div className="rounded-md border border-gray-700 bg-gray-950/40 px-2.5 py-2 md:col-span-2">
              <div className="text-[11px] text-gray-500">示例模型</div>
              <div className="mt-1 font-mono text-xs text-gray-200">{selectedBuiltinOauthGuide.modelExample}</div>
            </div>
          </div>

          <div className="mt-3 rounded-md border border-gray-700 bg-gray-950/40 px-2.5 py-2">
            <div className="text-[11px] text-gray-500">{selectedBuiltinOauthGuide.title} 推荐命令</div>
            <div className="mt-2 space-y-1.5">
              {selectedBuiltinOauthGuide.commands.map(command => (
                <div
                  key={command}
                  className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 font-mono text-[11px] text-gray-200"
                >
                  {command}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 rounded-md border border-gray-700 bg-gray-950/40 px-2.5 py-2">
            <div className="text-[11px] text-gray-500">说明</div>
            <div className="mt-2 space-y-1">
              {selectedBuiltinOauthGuide.notes.map(note => (
                <div key={note} className="text-xs text-gray-300">
                  - {note}
                </div>
              ))}
            </div>
          </div>

          {sectionIssues.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-200">
              当前存在 models 校验问题，请切换到“自定义 Provider”模式处理。
            </div>
          )}
        </section>
      ) : (
        <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <section className="rounded-lg border border-gray-700 bg-gray-900/60 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-medium text-gray-300">Provider 列表</div>
              <div className="text-[11px] text-gray-500">{providerIds.length} 个</div>
            </div>

            <div className="space-y-2">
              {providerIds.length === 0 && (
                <div className="rounded-md border border-dashed border-gray-700 px-2 py-3 text-center text-xs text-gray-500">
                  暂无 Provider
                </div>
              )}

              {providerIds.map((providerId, index) => (
                <div
                  key={providerId}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1.5 transition-all duration-150 ${
                    draggingProviderId === providerId
                      ? 'z-10 scale-[1.01] border-blue-400/70 bg-blue-500/15 shadow-[0_10px_30px_rgba(59,130,246,0.25)] ring-1 ring-blue-400/40'
                      : resolvedProviderId === providerId
                      ? 'border-blue-500/60 bg-blue-500/10'
                      : 'border-gray-700 bg-gray-950/40'
                  }`}
                  onPointerEnter={() => handleProviderRowPointerEnter(providerId)}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="按住并拖动排序"
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border border-gray-700 text-gray-400 ${
                        draggingProviderId === providerId
                          ? 'cursor-grabbing border-blue-400/70 bg-blue-500/15 text-blue-200'
                          : draggingProviderId
                          ? 'cursor-grabbing'
                          : 'cursor-grab'
                      }`}
                      onPointerDown={event => handleProviderSortPointerDown(providerId, event)}
                      onPointerUp={handleProviderSortPointerUp}
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <div className="inline-flex flex-col overflow-hidden rounded-md border border-gray-700">
                      <button
                        type="button"
                        title="上移"
                        disabled={index === 0}
                        className={`inline-flex h-3.5 w-4 items-center justify-center text-gray-400 ${
                          index === 0
                            ? 'cursor-not-allowed bg-gray-900 text-gray-600'
                            : 'bg-gray-900 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                        onClick={() => moveProviderUp(providerId)}
                      >
                        <ChevronUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="下移"
                        disabled={index === providerIds.length - 1}
                        className={`inline-flex h-3.5 w-4 items-center justify-center border-t border-gray-700 text-gray-400 ${
                          index === providerIds.length - 1
                            ? 'cursor-not-allowed bg-gray-900 text-gray-600'
                            : 'bg-gray-900 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                        onClick={() => moveProviderDown(providerId)}
                      >
                        <ChevronDown className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left text-xs text-gray-200"
                    onClick={() => setSelectedProviderId(providerId)}
                  >
                    {providerId}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:bg-red-950/40 hover:text-red-300"
                    title="删除 Provider"
                    onClick={() => handleRemoveProvider(providerId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {draggingProviderId && (
              <div className="mt-2 text-[11px] text-blue-200/90">
                拖拽中：靠近窗口上下边缘会自动滚动
              </div>
            )}

            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-gray-600 px-2 py-1.5 text-xs text-gray-300 hover:border-gray-500 hover:text-gray-100"
              onClick={handleAddProvider}
            >
              <Plus className="h-3.5 w-3.5" />
              新增 Provider
            </button>

            {sectionIssues.length > 0 && (
              <div className="mt-3 rounded-md border border-amber-900/60 bg-amber-950/40 px-2 py-1.5 text-[11px] text-amber-200">
                models 分区存在 {sectionIssues.length} 条校验问题
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
        {!resolvedProviderId || !selectedProvider ? (
          <div className="flex h-full min-h-40 items-center justify-center rounded-md border border-dashed border-gray-700 text-sm text-gray-500">
            请选择或新增 Provider
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-300">Provider 详情</div>
                <div className="text-[11px] text-gray-500">当前：{resolvedProviderId}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <FormField
                label="providerId（名称）"
                required
                className="md:col-span-2"
                description="用于 models.providers 的 key，改名会直接替换旧 key。"
                error={providerRenameError}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={providerIdDraft}
                    className={INPUT_CLASS_NAME}
                    onChange={event => {
                      if (!resolvedProviderId) return
                      setProviderIdDrafts(current => ({
                        ...current,
                        [resolvedProviderId]: event.target.value,
                      }))
                      if (providerIdError?.providerId === resolvedProviderId) {
                        setProviderIdError(null)
                      }
                    }}
                    onKeyDown={event => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleRenameProvider()
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200 hover:border-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleRenameProvider}
                    disabled={providerIdDraft.trim().length === 0 || providerIdDraft.trim() === resolvedProviderId}
                  >
                    重命名
                  </button>
                </div>
              </FormField>

              <FormField
                label="baseUrl"
                required
                error={findIssueByPath(issues, `${providerPathPrefix}.baseUrl`) ?? null}
              >
                <input
                  type="text"
                  value={selectedProvider.baseUrl ?? ''}
                  placeholder="https://api.example.com/v1"
                  className={INPUT_CLASS_NAME}
                  onChange={event => {
                    const nextValue = event.target.value
                    updateSelectedProvider(provider => ({
                      ...provider,
                      baseUrl: nextValue,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="api"
                description={apiAuthHint ?? undefined}
                error={findIssueByPath(issues, `${providerPathPrefix}.api`) ?? null}
              >
                <SelectField
                  value={selectedProvider.api ?? ''}
                  options={API_OPTIONS}
                  placeholder="请选择协议"
                  onChange={nextValue => {
                    const normalizedValue = nextValue.trim()
                    updateSelectedProvider(provider => ({
                      ...provider,
                      api: normalizedValue || undefined,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="auth"
                description={`${authDescription} 内置 OAuth（Codex / Gemini CLI）请使用“内置认证”模式。`}
                error={findIssueByPath(issues, `${providerPathPrefix}.auth`) ?? null}
              >
                <SelectField
                  value={selectedProvider.auth ?? ''}
                  options={AUTH_OPTIONS}
                  placeholder="自动（推荐）"
                  onChange={nextValue => {
                    const normalizedValue = nextValue.trim()
                    updateSelectedProvider(provider => ({
                      ...provider,
                      auth: normalizedValue || undefined,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="apiKey"
                description={apiKeyFieldMeta.description}
                error={findIssueByPath(issues, `${providerPathPrefix}.apiKey`) ?? null}
              >
                <SecretInput
                  value={selectedProvider.apiKey ?? ''}
                  placeholder={apiKeyFieldMeta.placeholder}
                  disabled={apiKeyFieldMeta.disabled}
                  onChange={nextValue => {
                    updateSelectedProvider(provider => ({
                      ...provider,
                      apiKey: nextValue,
                    }))
                  }}
                />
              </FormField>

              <FormField
                label="authHeader"
                description="开启后，优先通过 Authorization Header 传递认证信息。"
                error={findIssueByPath(issues, `${providerPathPrefix}.authHeader`) ?? null}
              >
                <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 accent-blue-500"
                    checked={Boolean(selectedProvider.authHeader)}
                    onChange={event => {
                      const checked = event.target.checked
                      updateSelectedProvider(provider => ({
                        ...provider,
                        authHeader: checked ? true : undefined,
                      }))
                    }}
                  />
                  使用 Authorization Header
                </label>
              </FormField>
            </div>

            <FormField
              label="headers"
              description={
                selectedProvider.authHeader
                  ? '已启用 authHeader，可在此补充网关/租户等自定义请求头。'
                  : '可选：为 Provider 请求追加自定义 Header。'
              }
              error={findIssueByPath(issues, `${providerPathPrefix}.headers`) ?? null}
            >
              <KeyValueEditor
                value={selectedProvider.headers}
                keyPlaceholder="Header Key"
                valuePlaceholder="Header Value"
                addLabel="新增 Header"
                onChange={nextValue => {
                  updateSelectedProvider(provider => ({
                    ...provider,
                    headers: nextValue,
                  }))
                }}
              />
            </FormField>

            <div className="space-y-2 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium text-gray-300">models</div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-200 hover:border-gray-600"
                  onClick={handleAddModel}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增模型
                </button>
              </div>

              <div className="overflow-x-auto rounded-md border border-gray-700">
                <table className="min-w-[980px] table-fixed border-collapse text-xs text-gray-200">
                  <thead className="bg-gray-900/90 text-[11px] text-gray-400">
                    <tr>
                      <th className="w-40 border-b border-gray-700 px-2 py-1.5 text-left">id</th>
                      <th className="w-36 border-b border-gray-700 px-2 py-1.5 text-left">name</th>
                      <th className="w-24 border-b border-gray-700 px-2 py-1.5 text-left">reasoning</th>
                      <th className="w-24 border-b border-gray-700 px-2 py-1.5 text-left">contextWindow</th>
                      <th className="w-24 border-b border-gray-700 px-2 py-1.5 text-left">maxTokens</th>
                      <th className="w-20 border-b border-gray-700 px-2 py-1.5 text-left">cost.in</th>
                      <th className="w-20 border-b border-gray-700 px-2 py-1.5 text-left">cost.out</th>
                      <th className="w-20 border-b border-gray-700 px-2 py-1.5 text-left">cacheRead</th>
                      <th className="w-20 border-b border-gray-700 px-2 py-1.5 text-left">cacheWrite</th>
                      <th className="w-12 border-b border-gray-700 px-2 py-1.5 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerModels.length === 0 && (
                      <tr>
                        <td
                          colSpan={10}
                          className="border-b border-gray-800 px-2 py-4 text-center text-[11px] text-gray-500"
                        >
                          暂无模型
                        </td>
                      </tr>
                    )}

                    {providerModels.map((model, index) => {
                      const pathPrefix = `${providerPathPrefix}.models.${index}`
                      const cost = model.cost ?? {}
                      const rowKey = `${resolvedProviderId ?? 'provider'}-model-${index}`

                      return (
                        <tr key={rowKey}>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="text"
                              value={model.id ?? ''}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = event.target.value
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  id: nextValue,
                                }))
                              }}
                            />
                            {findIssueByPath(issues, `${pathPrefix}.id`) && (
                              <div className="mt-1 text-[10px] text-red-300">
                                {findIssueByPath(issues, `${pathPrefix}.id`)}
                              </div>
                            )}
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="text"
                              value={model.name ?? ''}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = event.target.value
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  name: nextValue,
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="text"
                              value={reasoningToInput(model.reasoning)}
                              placeholder="true/false/字符串"
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = event.target.value
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  reasoning: parseReasoning(nextValue),
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="number"
                              value={numberToInput(model.contextWindow)}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = parseOptionalNumber(event.target.value)
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  contextWindow: nextValue,
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="number"
                              value={numberToInput(model.maxTokens)}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = parseOptionalNumber(event.target.value)
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  maxTokens: nextValue,
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="number"
                              value={numberToInput(cost.input)}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = parseOptionalNumber(event.target.value)
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  cost: {
                                    ...(currentModel.cost ?? {}),
                                    input: nextValue,
                                  },
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="number"
                              value={numberToInput(cost.output)}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = parseOptionalNumber(event.target.value)
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  cost: {
                                    ...(currentModel.cost ?? {}),
                                    output: nextValue,
                                  },
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="number"
                              value={numberToInput(cost.cacheRead)}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = parseOptionalNumber(event.target.value)
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  cost: {
                                    ...(currentModel.cost ?? {}),
                                    cacheRead: nextValue,
                                  },
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <input
                              type="number"
                              value={numberToInput(cost.cacheWrite)}
                              className={INPUT_CLASS_NAME}
                              onChange={event => {
                                const nextValue = parseOptionalNumber(event.target.value)
                                updateProviderModel(index, currentModel => ({
                                  ...currentModel,
                                  cost: {
                                    ...(currentModel.cost ?? {}),
                                    cacheWrite: nextValue,
                                  },
                                }))
                              }}
                            />
                          </td>
                          <td className="border-b border-gray-800 px-2 py-1.5 align-top">
                            <button
                              type="button"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 text-gray-400 hover:border-red-700 hover:text-red-300"
                              onClick={() => handleRemoveModel(index)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
      )}
    </div>
  )
}
