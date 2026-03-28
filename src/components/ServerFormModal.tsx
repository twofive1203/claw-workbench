import { useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { cn } from '../lib/utils'
import type {
  LocalOpenClawServerCandidate,
  ServerConfig,
  ServerFormValue,
  ServerProtocol,
} from '../types/server'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * 服务器表单弹窗属性。
 * @param initialServer 编辑时的初始服务器配置。
 * @param canDetectLocalServer 是否允许检测本机 OpenClaw。
 * @param onDetectLocalServer 检测本机 OpenClaw 回调。
 * @param onCancel 取消回调。
 * @param onSubmit 提交回调。
 */
interface ServerFormModalProps {
  initialServer?: ServerConfig | null
  canDetectLocalServer?: boolean
  onDetectLocalServer?: () => Promise<LocalOpenClawServerCandidate | null>
  onCancel: () => void
  onSubmit: (value: ServerFormValue) => void
}

/**
 * 解析连接地址并提取表单字段。
 * @param rawUrl 原始连接地址。
 */
function parseServerUrl(rawUrl: string): {
  protocol: ServerProtocol
  host: string
  port: string
  token: string
} {
  const trimmedUrl = rawUrl.trim()
  if (!trimmedUrl) {
    throw new Error('请输入连接地址')
  }

  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    throw new Error('连接地址格式不正确')
  }

  const protocol = parsed.protocol.replace(':', '')
  if (protocol !== 'ws' && protocol !== 'wss') {
    throw new Error('仅支持 ws 或 wss 协议')
  }

  const host = parsed.hostname.trim()
  if (!host) {
    throw new Error('连接地址缺少主机地址')
  }

  const rawPort = parsed.port.trim()
  if (rawPort) {
    const parsedPort = Number(rawPort)
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      throw new Error('连接地址端口无效')
    }
  }

  const token = (parsed.searchParams.get('token') ?? '').trim()
  if (!token) {
    throw new Error('连接地址缺少 token 参数')
  }

  return {
    protocol,
    host,
    port: rawPort,
    token,
  }
}

/**
 * 服务器新增/编辑表单弹窗。
 * @param props 组件属性。
 */
export function ServerFormModal(props: ServerFormModalProps) {
  const {
    initialServer,
    canDetectLocalServer = false,
    onDetectLocalServer,
    onCancel,
    onSubmit,
  } = props
  const modalRef = useRef<HTMLFormElement | null>(null)
  const [name, setName] = useState(initialServer?.name ?? '')
  const [host, setHost] = useState(initialServer?.host ?? '')
  const [port, setPort] = useState(
    initialServer?.port === null || initialServer?.port === undefined
      ? ''
      : String(initialServer.port),
  )
  const [protocol, setProtocol] = useState<ServerProtocol>(initialServer?.protocol ?? 'wss')
  const [token, setToken] = useState(initialServer?.token ?? '')
  const [quickUrl, setQuickUrl] = useState('')
  const [detectedLocalServer, setDetectedLocalServer] = useState<LocalOpenClawServerCandidate | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const isEditMode = Boolean(initialServer)

  useLocalizedSubtree(modalRef)

  /**
   * 新增弹窗打开后自动检测本机 OpenClaw。
   */
  useEffect(() => {
    if (isEditMode || !canDetectLocalServer || !onDetectLocalServer) {
      return
    }

    const detectLocalServerFn = onDetectLocalServer
    let cancelled = false

    async function detectLocalServer() {
      setDetectedLocalServer(null)
      try {
        const localServer = await detectLocalServerFn()
        if (cancelled || !localServer) return
        setDetectedLocalServer(localServer)
      } catch (error) {
        console.warn('检测本机 OpenClaw 失败。', error)
      }
    }

    void detectLocalServer()

    return () => {
      cancelled = true
    }
  }, [canDetectLocalServer, isEditMode, onDetectLocalServer])

  /**
   * 提交表单。
   * @param event 表单事件。
   */
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedHost = host.trim()
    const trimmedToken = token.trim()

    if (!trimmedName) {
      setFormError('请输入服务器名称')
      return
    }
    if (!trimmedHost) {
      setFormError('请输入主机地址')
      return
    }
    if (!trimmedToken) {
      setFormError('请输入 Token')
      return
    }

    let normalizedPort: number | null = null
    const trimmedPort = port.trim()
    if (trimmedPort) {
      const parsedPort = Number(trimmedPort)
      if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
        setFormError('端口必须是 1-65535 的整数')
        return
      }
      normalizedPort = parsedPort
    }

    setFormError(null)
    onSubmit({
      name: trimmedName,
      host: trimmedHost,
      port: normalizedPort,
      protocol,
      token: trimmedToken,
    })
  }

  /**
   * 解析快速录入地址并自动填充表单。
   */
  const handleParseQuickUrl = () => {
    try {
      const parsed = parseServerUrl(quickUrl)
      setProtocol(parsed.protocol)
      setHost(parsed.host)
      setPort(parsed.port)
      setToken(parsed.token)
      if (!name.trim()) {
        setName(parsed.host)
      }
      setFormError(null)
    } catch (parseError) {
      const errorText = parseError instanceof Error ? parseError.message : String(parseError)
      setFormError(errorText)
    }
  }

  /**
   * 使用检测到的本机 OpenClaw 配置直接添加服务器。
   */
  const handleUseDetectedLocalServer = () => {
    if (!detectedLocalServer) return
    const { name, host, port, protocol, token } = detectedLocalServer
    onSubmit({ name, host, port, protocol, token })
  }

  /**
   * 点击遮罩层关闭弹窗。
   * 仅当按下发生在遮罩层本身时触发，避免拖拽选择文本时误关闭。
   * @param event 指针事件。
   */
  const handleBackdropPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    onCancel()
  }

  return (
    <div
      className="wb-modal-backdrop"
      onPointerDown={handleBackdropPointerDown}
    >
      <form
        ref={modalRef}
        className="wb-modal-card w-full max-w-[560px] space-y-4"
        onSubmit={handleSubmit}
        onClick={event => event.stopPropagation()}
      >
        <div className="space-y-1">
          <div className="text-sm font-semibold text-[var(--text-strong)]">{isEditMode ? '编辑服务器' : '新增服务器'}</div>
          <p className="text-xs leading-6 text-[var(--text-faint)]">填写 Gateway 连接信息，或直接粘贴完整地址快速解析。</p>
        </div>

        {!isEditMode && canDetectLocalServer && detectedLocalServer && (
          <div className="flex justify-end">
            <button
              type="button"
              className="wb-chip-success max-w-[280px] justify-end px-3 py-2 text-right leading-5"
              onClick={handleUseDetectedLocalServer}
              title={detectedLocalServer.configPath}
            >
              检测到本机 OpenClaw（端口 {detectedLocalServer.port}），点击自动添加
            </button>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs text-[var(--text-faint)]">快速录入地址</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={quickUrl}
              onChange={event => setQuickUrl(event.target.value)}
              data-no-i18n
              className="wb-input flex-1"
              placeholder="wss://localhost?token=ac04xxxxxx"
            />
            <button
              type="button"
              className="wb-mini-button shrink-0"
              onClick={handleParseQuickUrl}
            >
              解析
            </button>
          </div>
          <div className="text-[11px] text-[var(--text-faint)]">
            支持格式：ws://host[:port]?token=xxx 或 wss://host[:port]?token=xxx
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--text-faint)]">名称</label>
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            className="wb-input"
            placeholder="生产环境"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--text-faint)]">主机地址</label>
          <input
            type="text"
            value={host}
            onChange={event => setHost(event.target.value)}
            className="wb-input"
            placeholder="localhost"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--text-faint)]">端口（选填）</label>
          <input
            type="number"
            value={port}
            onChange={event => setPort(event.target.value)}
            className="wb-input"
            placeholder="默认 80/443"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--text-faint)]">协议</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={cn(
                'wb-pill-button rounded-[14px]',
                protocol === 'ws'
                  ? 'is-active border-[var(--border-accent)] bg-[var(--surface-active)] text-[var(--color-blue-200)]'
                  : '',
              )}
              onClick={() => setProtocol('ws')}
            >
              ws
            </button>
            <button
              type="button"
              className={cn(
                'wb-pill-button rounded-[14px]',
                protocol === 'wss'
                  ? 'is-active border-[var(--border-accent)] bg-[var(--surface-active)] text-[var(--color-blue-200)]'
                  : '',
              )}
              onClick={() => setProtocol('wss')}
            >
              wss
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-[var(--text-faint)]">Token</label>
          <input
            type="text"
            value={token}
            onChange={event => setToken(event.target.value)}
            className="wb-input"
            placeholder="请输入认证 token"
          />
        </div>

        {formError && (
          <div className="wb-card rounded-[16px] border-[color-mix(in_srgb,var(--color-red-700)_32%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_48%,transparent)] px-3 py-2 text-xs text-[var(--color-red-200)]">
            {formError}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            className="wb-ghost-button"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="submit"
            className="wb-primary-button"
          >
            确认
          </button>
        </div>
      </form>
    </div>
  )
}
