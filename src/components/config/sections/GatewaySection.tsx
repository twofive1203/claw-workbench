/**
 * Gateway 配置分区。
 * 说明：覆盖新版 gateway 中最常用的监听、认证、Control UI、远端与 TLS 字段。
 * @author lichong
 */

import type { ConfigValidationIssue } from '../../../lib/configSchema'
import type {
  ConfigSecretValue,
  GatewayAuthConfig,
  GatewayConfig,
  GatewayControlUiConfig,
  GatewayReloadConfig,
  GatewayRemoteConfig,
  GatewayTailscaleConfig,
  GatewayTlsConfig,
  OpenClawConfig,
} from '../../../types/config'
import { ArrayEditor } from '../shared/ArrayEditor'
import { FormField } from '../shared/FormField'
import { SecretInput } from '../shared/SecretInput'
import { SelectField, type SelectOption } from '../shared/SelectField'
import { findIssueByPath } from './utils'

const INPUT_CLASS_NAME =
  'w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-200 outline-none focus:border-gray-500'

const MODE_OPTIONS: SelectOption[] = [
  { label: 'local', value: 'local' },
  { label: 'remote', value: 'remote' },
]

const BIND_OPTIONS: SelectOption[] = [
  { label: 'auto', value: 'auto' },
  { label: 'loopback', value: 'loopback' },
  { label: 'lan', value: 'lan' },
  { label: 'custom', value: 'custom' },
  { label: 'tailnet', value: 'tailnet' },
]

const AUTH_MODE_OPTIONS: SelectOption[] = [
  { label: 'token', value: 'token' },
  { label: 'password', value: 'password' },
  { label: 'trusted-proxy', value: 'trusted-proxy' },
  { label: 'none', value: 'none' },
]

const REMOTE_TRANSPORT_OPTIONS: SelectOption[] = [
  { label: 'direct', value: 'direct' },
  { label: 'ssh', value: 'ssh' },
]

const TAILSCALE_MODE_OPTIONS: SelectOption[] = [
  { label: 'off', value: 'off' },
  { label: 'serve', value: 'serve' },
  { label: 'funnel', value: 'funnel' },
]

const RELOAD_MODE_OPTIONS: SelectOption[] = [
  { label: 'off', value: 'off' },
  { label: 'restart', value: 'restart' },
  { label: 'hot', value: 'hot' },
  { label: 'hybrid', value: 'hybrid' },
]

/**
 * Gateway 分区属性。
 * @param config 当前配置对象。
 * @param issues 全量校验问题列表。
 * @param updateConfig 配置更新函数。
 */
interface GatewaySectionProps {
  config: OpenClawConfig
  issues: ConfigValidationIssue[]
  updateConfig: (updater: (prev: OpenClawConfig) => OpenClawConfig) => void
}

/**
 * 将输入框文本转换为可选数字。
 * @param value 输入框文本。
 */
function toOptionalNumber(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * 将密文字段值转换为输入框文本。
 * @param value 配置中的密文字段值。
 */
function resolveSecretText(value: ConfigSecretValue | undefined): string {
  return typeof value === 'string' ? value : ''
}

/**
 * 判断密文字段是否为对象型 SecretRef。
 * @param value 配置中的密文字段值。
 */
function isStructuredSecretValue(value: ConfigSecretValue | undefined): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Gateway 分区组件。
 * @param props 组件属性。
 */
export function GatewaySection(props: GatewaySectionProps) {
  const { config, issues, updateConfig } = props
  const gateway = config.gateway ?? {}
  const structuredSecretFields = [
    isStructuredSecretValue(gateway.auth?.token) ? 'auth.token' : null,
    isStructuredSecretValue(gateway.auth?.password) ? 'auth.password' : null,
    isStructuredSecretValue(gateway.remote?.token) ? 'remote.token' : null,
    isStructuredSecretValue(gateway.remote?.password) ? 'remote.password' : null,
  ].filter((item): item is string => Boolean(item))

  /**
   * 更新 gateway 对象。
   * @param updater gateway 更新函数。
   */
  const updateGateway = (updater: (value: GatewayConfig) => GatewayConfig) => {
    updateConfig(prev => ({
      ...prev,
      gateway: updater(prev.gateway ?? {}),
    }))
  }

  /**
   * 更新 controlUi 对象。
   * @param updater controlUi 更新函数。
   */
  const updateControlUi = (updater: (value: GatewayControlUiConfig) => GatewayControlUiConfig) => {
    updateGateway(current => ({
      ...current,
      controlUi: updater(current.controlUi ?? {}),
    }))
  }

  /**
   * 更新 auth 对象。
   * @param updater auth 更新函数。
   */
  const updateAuth = (updater: (value: GatewayAuthConfig) => GatewayAuthConfig) => {
    updateGateway(current => ({
      ...current,
      auth: updater(current.auth ?? {}),
    }))
  }

  /**
   * 更新 remote 对象。
   * @param updater remote 更新函数。
   */
  const updateRemote = (updater: (value: GatewayRemoteConfig) => GatewayRemoteConfig) => {
    updateGateway(current => ({
      ...current,
      remote: updater(current.remote ?? {}),
    }))
  }

  /**
   * 更新 tailscale 对象。
   * @param updater tailscale 更新函数。
   */
  const updateTailscale = (updater: (value: GatewayTailscaleConfig) => GatewayTailscaleConfig) => {
    updateGateway(current => ({
      ...current,
      tailscale: updater(current.tailscale ?? {}),
    }))
  }

  /**
   * 更新 reload 对象。
   * @param updater reload 更新函数。
   */
  const updateReload = (updater: (value: GatewayReloadConfig) => GatewayReloadConfig) => {
    updateGateway(current => ({
      ...current,
      reload: updater(current.reload ?? {}),
    }))
  }

  /**
   * 更新 tls 对象。
   * @param updater tls 更新函数。
   */
  const updateTls = (updater: (value: GatewayTlsConfig) => GatewayTlsConfig) => {
    updateGateway(current => ({
      ...current,
      tls: updater(current.tls ?? {}),
    }))
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-700 bg-gray-900/60 p-3">
      <div className="text-xs font-medium text-gray-300">Gateway 配置</div>

      {structuredSecretFields.length > 0 && (
        <div className="rounded-md border border-yellow-900/60 bg-yellow-950/30 px-3 py-2 text-[11px] leading-5 text-yellow-100/90">
          当前检测到对象型 SecretRef:
          {' '}
          {structuredSecretFields.join('、')}
          。这类字段建议在 JSON 视图编辑，避免误覆盖。
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <FormField
          label="port"
          description="Gateway 统一监听端口。"
          error={findIssueByPath(issues, 'gateway.port') ?? null}
        >
          <input
            type="number"
            value={gateway.port ?? ''}
            placeholder="18789"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = toOptionalNumber(event.target.value)
              updateGateway(current => ({
                ...current,
                port: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField
          label="mode"
          description="Gateway 运行模式。"
          error={findIssueByPath(issues, 'gateway.mode') ?? null}
        >
          <SelectField
            value={gateway.mode ?? ''}
            options={MODE_OPTIONS}
            placeholder="请选择模式"
            onChange={nextValue => {
              updateGateway(current => ({
                ...current,
                mode: nextValue || undefined,
              }))
            }}
          />
        </FormField>

        <FormField
          label="bind"
          description="Gateway 监听绑定策略。"
          error={findIssueByPath(issues, 'gateway.bind') ?? null}
        >
          <SelectField
            value={gateway.bind ?? ''}
            options={BIND_OPTIONS}
            placeholder="请选择 bind"
            onChange={nextValue => {
              updateGateway(current => ({
                ...current,
                bind: nextValue || undefined,
              }))
            }}
          />
        </FormField>

        <FormField
          label="customBindHost"
          description="bind=custom 时使用的绑定地址。"
          error={findIssueByPath(issues, 'gateway.customBindHost') ?? null}
        >
          <input
            type="text"
            value={gateway.customBindHost ?? ''}
            placeholder="例如 0.0.0.0"
            className={INPUT_CLASS_NAME}
            onChange={event => {
              const nextValue = event.target.value
              updateGateway(current => ({
                ...current,
                customBindHost: nextValue || undefined,
              }))
            }}
          />
        </FormField>
      </div>

      <div className="space-y-3 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
        <div className="text-xs font-medium text-gray-300">controlUi</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField
            label="controlUi.enabled"
            description="是否启用内置控制台界面。"
            error={findIssueByPath(issues, 'gateway.controlUi.enabled') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.controlUi?.enabled === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateControlUi(current => ({
                    ...current,
                    enabled: checked,
                  }))
                }}
              />
              启用 Control UI
            </label>
          </FormField>

          <FormField
            label="controlUi.allowInsecureAuth"
            description="是否允许不安全认证。"
            error={findIssueByPath(issues, 'gateway.controlUi.allowInsecureAuth') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.controlUi?.allowInsecureAuth === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateControlUi(current => ({
                    ...current,
                    allowInsecureAuth: checked,
                  }))
                }}
              />
              允许不安全认证
            </label>
          </FormField>

          <FormField
            label="controlUi.dangerouslyDisableDeviceAuth"
            description="危险选项，关闭设备身份校验。"
            error={findIssueByPath(issues, 'gateway.controlUi.dangerouslyDisableDeviceAuth') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.controlUi?.dangerouslyDisableDeviceAuth === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateControlUi(current => ({
                    ...current,
                    dangerouslyDisableDeviceAuth: checked,
                  }))
                }}
              />
              禁用设备身份校验
            </label>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField
            label="controlUi.basePath"
            description="Control UI 的基础路径前缀。"
            error={findIssueByPath(issues, 'gateway.controlUi.basePath') ?? null}
          >
            <input
              type="text"
              value={gateway.controlUi?.basePath ?? ''}
              placeholder="例如 /openclaw"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateControlUi(current => ({
                  ...current,
                  basePath: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="controlUi.root"
            description="Control UI 静态资源根目录。"
            error={findIssueByPath(issues, 'gateway.controlUi.root') ?? null}
          >
            <input
              type="text"
              value={gateway.controlUi?.root ?? ''}
              placeholder="例如 dist/control-ui"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateControlUi(current => ({
                  ...current,
                  root: nextValue || undefined,
                }))
              }}
            />
          </FormField>
        </div>

        <FormField
          label="controlUi.allowedOrigins"
          description="允许访问 Control UI/WebSocket 的浏览器来源。"
          error={findIssueByPath(issues, 'gateway.controlUi.allowedOrigins') ?? null}
        >
          <ArrayEditor
            value={gateway.controlUi?.allowedOrigins}
            itemPlaceholder="例如 https://example.com"
            addLabel="新增来源"
            sortable
            onChange={nextValue => {
              updateControlUi(current => ({
                ...current,
                allowedOrigins: nextValue,
              }))
            }}
          />
        </FormField>

        <FormField
          label="controlUi.dangerouslyAllowHostHeaderOriginFallback"
          description="危险选项，保留 Host Header 兜底来源策略。"
          error={findIssueByPath(issues, 'gateway.controlUi.dangerouslyAllowHostHeaderOriginFallback') ?? null}
        >
          <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-blue-500"
              checked={gateway.controlUi?.dangerouslyAllowHostHeaderOriginFallback === true}
              onChange={event => {
                const checked = event.target.checked
                updateControlUi(current => ({
                  ...current,
                  dangerouslyAllowHostHeaderOriginFallback: checked,
                }))
              }}
            />
            允许 Host Header 来源兜底
          </label>
        </FormField>
      </div>

      <div className="space-y-3 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
        <div className="text-xs font-medium text-gray-300">auth</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField
            label="auth.mode"
            description="Gateway 认证模式。"
            error={findIssueByPath(issues, 'gateway.auth.mode') ?? null}
          >
            <SelectField
              value={gateway.auth?.mode ?? ''}
              options={AUTH_MODE_OPTIONS}
              placeholder="请选择认证模式"
              onChange={nextValue => {
                updateAuth(current => ({
                  ...current,
                  mode: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="auth.allowTailscale"
            description="允许 Tailscale 身份头参与认证。"
            error={findIssueByPath(issues, 'gateway.auth.allowTailscale') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.auth?.allowTailscale === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateAuth(current => ({
                    ...current,
                    allowTailscale: checked,
                  }))
                }}
              />
              允许 Tailscale 身份头
            </label>
          </FormField>

          <FormField
            label="auth.token"
            description="token 模式使用的共享密钥。"
            error={findIssueByPath(issues, 'gateway.auth.token') ?? null}
          >
            <SecretInput
              value={resolveSecretText(gateway.auth?.token)}
              placeholder="输入 token"
              onChange={nextValue => {
                updateAuth(current => ({
                  ...current,
                  token: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="auth.password"
            description="password 模式使用的共享密码。"
            error={findIssueByPath(issues, 'gateway.auth.password') ?? null}
          >
            <SecretInput
              value={resolveSecretText(gateway.auth?.password)}
              placeholder="输入 password"
              onChange={nextValue => {
                updateAuth(current => ({
                  ...current,
                  password: nextValue || undefined,
                }))
              }}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <FormField
            label="auth.rateLimit.maxAttempts"
            error={findIssueByPath(issues, 'gateway.auth.rateLimit.maxAttempts') ?? null}
          >
            <input
              type="number"
              value={gateway.auth?.rateLimit?.maxAttempts ?? ''}
              placeholder="10"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = toOptionalNumber(event.target.value)
                updateAuth(current => ({
                  ...current,
                  rateLimit: {
                    ...(current.rateLimit ?? {}),
                    maxAttempts: nextValue,
                  },
                }))
              }}
            />
          </FormField>

          <FormField
            label="auth.rateLimit.windowMs"
            error={findIssueByPath(issues, 'gateway.auth.rateLimit.windowMs') ?? null}
          >
            <input
              type="number"
              value={gateway.auth?.rateLimit?.windowMs ?? ''}
              placeholder="60000"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = toOptionalNumber(event.target.value)
                updateAuth(current => ({
                  ...current,
                  rateLimit: {
                    ...(current.rateLimit ?? {}),
                    windowMs: nextValue,
                  },
                }))
              }}
            />
          </FormField>

          <FormField
            label="auth.rateLimit.lockoutMs"
            error={findIssueByPath(issues, 'gateway.auth.rateLimit.lockoutMs') ?? null}
          >
            <input
              type="number"
              value={gateway.auth?.rateLimit?.lockoutMs ?? ''}
              placeholder="300000"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = toOptionalNumber(event.target.value)
                updateAuth(current => ({
                  ...current,
                  rateLimit: {
                    ...(current.rateLimit ?? {}),
                    lockoutMs: nextValue,
                  },
                }))
              }}
            />
          </FormField>

          <FormField
            label="auth.rateLimit.exemptLoopback"
            error={findIssueByPath(issues, 'gateway.auth.rateLimit.exemptLoopback') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.auth?.rateLimit?.exemptLoopback === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateAuth(current => ({
                    ...current,
                    rateLimit: {
                      ...(current.rateLimit ?? {}),
                      exemptLoopback: checked,
                    },
                  }))
                }}
              />
              豁免 loopback
            </label>
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField
            label="auth.trustedProxy.userHeader"
            description="trusted-proxy 模式下用于透传用户身份的 Header。"
            error={findIssueByPath(issues, 'gateway.auth.trustedProxy.userHeader') ?? null}
          >
            <input
              type="text"
              value={gateway.auth?.trustedProxy?.userHeader ?? ''}
              placeholder="例如 x-forwarded-user"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateAuth(current => ({
                  ...current,
                  trustedProxy: {
                    ...(current.trustedProxy ?? {}),
                    userHeader: nextValue || undefined,
                  },
                }))
              }}
            />
          </FormField>
        </div>

        <FormField
          label="auth.trustedProxy.requiredHeaders"
          description="要求代理请求必须带上的 Header。"
          error={findIssueByPath(issues, 'gateway.auth.trustedProxy.requiredHeaders') ?? null}
        >
          <ArrayEditor
            value={gateway.auth?.trustedProxy?.requiredHeaders}
            itemPlaceholder="输入 Header 名称"
            addLabel="新增 Header"
            sortable
            onChange={nextValue => {
              updateAuth(current => ({
                ...current,
                trustedProxy: {
                  ...(current.trustedProxy ?? {}),
                  requiredHeaders: nextValue,
                },
              }))
            }}
          />
        </FormField>

        <FormField
          label="auth.trustedProxy.allowUsers"
          description="允许通过 trusted-proxy 访问的用户列表。"
          error={findIssueByPath(issues, 'gateway.auth.trustedProxy.allowUsers') ?? null}
        >
          <ArrayEditor
            value={gateway.auth?.trustedProxy?.allowUsers}
            itemPlaceholder="输入用户标识"
            addLabel="新增用户"
            sortable
            onChange={nextValue => {
              updateAuth(current => ({
                ...current,
                trustedProxy: {
                  ...(current.trustedProxy ?? {}),
                  allowUsers: nextValue,
                },
              }))
            }}
          />
        </FormField>
      </div>

      <div className="space-y-3 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
        <div className="text-xs font-medium text-gray-300">remote</div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <FormField
            label="remote.enabled"
            description="是否启用远端 Gateway 配置。"
            error={findIssueByPath(issues, 'gateway.remote.enabled') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.remote?.enabled === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateRemote(current => ({
                    ...current,
                    enabled: checked,
                  }))
                }}
              />
              启用 remote
            </label>
          </FormField>

          <FormField
            label="remote.transport"
            description="远端连接传输方式。"
            error={findIssueByPath(issues, 'gateway.remote.transport') ?? null}
          >
            <SelectField
              value={gateway.remote?.transport ?? ''}
              options={REMOTE_TRANSPORT_OPTIONS}
              placeholder="请选择 transport"
              onChange={nextValue => {
                updateRemote(current => ({
                  ...current,
                  transport: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="remote.tlsFingerprint"
            description="远端 TLS 指纹。"
            error={findIssueByPath(issues, 'gateway.remote.tlsFingerprint') ?? null}
          >
            <input
              type="text"
              value={gateway.remote?.tlsFingerprint ?? ''}
              placeholder="sha256:..."
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateRemote(current => ({
                  ...current,
                  tlsFingerprint: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="remote.url"
            description="远端 Gateway WebSocket 地址。"
            error={findIssueByPath(issues, 'gateway.remote.url') ?? null}
            className="md:col-span-2"
          >
            <input
              type="text"
              value={gateway.remote?.url ?? ''}
              placeholder="例如 wss://gateway.example.com/ws"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateRemote(current => ({
                  ...current,
                  url: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="remote.sshTarget"
            description="SSH 隧道目标，例如 user@host。"
            error={findIssueByPath(issues, 'gateway.remote.sshTarget') ?? null}
          >
            <input
              type="text"
              value={gateway.remote?.sshTarget ?? ''}
              placeholder="例如 user@example.com"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateRemote(current => ({
                  ...current,
                  sshTarget: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="remote.sshIdentity"
            description="SSH 身份文件路径。"
            error={findIssueByPath(issues, 'gateway.remote.sshIdentity') ?? null}
          >
            <input
              type="text"
              value={gateway.remote?.sshIdentity ?? ''}
              placeholder="例如 ~/.ssh/id_ed25519"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateRemote(current => ({
                  ...current,
                  sshIdentity: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="remote.token"
            description="远端 token 认证信息。"
            error={findIssueByPath(issues, 'gateway.remote.token') ?? null}
          >
            <SecretInput
              value={resolveSecretText(gateway.remote?.token)}
              placeholder="输入 remote token"
              onChange={nextValue => {
                updateRemote(current => ({
                  ...current,
                  token: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="remote.password"
            description="远端 password 认证信息。"
            error={findIssueByPath(issues, 'gateway.remote.password') ?? null}
          >
            <SecretInput
              value={resolveSecretText(gateway.remote?.password)}
              placeholder="输入 remote password"
              onChange={nextValue => {
                updateRemote(current => ({
                  ...current,
                  password: nextValue || undefined,
                }))
              }}
            />
          </FormField>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="space-y-3 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
          <div className="text-xs font-medium text-gray-300">tailscale</div>

          <FormField
            label="tailscale.mode"
            error={findIssueByPath(issues, 'gateway.tailscale.mode') ?? null}
          >
            <SelectField
              value={gateway.tailscale?.mode ?? ''}
              options={TAILSCALE_MODE_OPTIONS}
              placeholder="请选择 tailscale 模式"
              onChange={nextValue => {
                updateTailscale(current => ({
                  ...current,
                  mode: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="tailscale.resetOnExit"
            error={findIssueByPath(issues, 'gateway.tailscale.resetOnExit') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.tailscale?.resetOnExit === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateTailscale(current => ({
                    ...current,
                    resetOnExit: checked,
                  }))
                }}
              />
              退出时重置 serve/funnel
            </label>
          </FormField>
        </div>

        <div className="space-y-3 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
          <div className="text-xs font-medium text-gray-300">reload</div>

          <FormField
            label="reload.mode"
            error={findIssueByPath(issues, 'gateway.reload.mode') ?? null}
          >
            <SelectField
              value={gateway.reload?.mode ?? ''}
              options={RELOAD_MODE_OPTIONS}
              placeholder="请选择 reload 模式"
              onChange={nextValue => {
                updateReload(current => ({
                  ...current,
                  mode: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="reload.debounceMs"
            error={findIssueByPath(issues, 'gateway.reload.debounceMs') ?? null}
          >
            <input
              type="number"
              value={gateway.reload?.debounceMs ?? ''}
              placeholder="300"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = toOptionalNumber(event.target.value)
                updateReload(current => ({
                  ...current,
                  debounceMs: nextValue,
                }))
              }}
            />
          </FormField>

          <FormField
            label="reload.deferralTimeoutMs"
            error={findIssueByPath(issues, 'gateway.reload.deferralTimeoutMs') ?? null}
          >
            <input
              type="number"
              value={gateway.reload?.deferralTimeoutMs ?? ''}
              placeholder="300000"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = toOptionalNumber(event.target.value)
                updateReload(current => ({
                  ...current,
                  deferralTimeoutMs: nextValue,
                }))
              }}
            />
          </FormField>
        </div>

        <div className="space-y-3 rounded-md border border-gray-700 bg-gray-950/40 p-2.5">
          <div className="text-xs font-medium text-gray-300">tls</div>

          <FormField
            label="tls.enabled"
            error={findIssueByPath(issues, 'gateway.tls.enabled') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.tls?.enabled === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateTls(current => ({
                    ...current,
                    enabled: checked,
                  }))
                }}
              />
              启用 TLS
            </label>
          </FormField>

          <FormField
            label="tls.autoGenerate"
            error={findIssueByPath(issues, 'gateway.tls.autoGenerate') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.tls?.autoGenerate === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateTls(current => ({
                    ...current,
                    autoGenerate: checked,
                  }))
                }}
              />
              自动生成证书
            </label>
          </FormField>

          <FormField
            label="tls.certPath"
            error={findIssueByPath(issues, 'gateway.tls.certPath') ?? null}
          >
            <input
              type="text"
              value={gateway.tls?.certPath ?? ''}
              placeholder="cert.pem"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateTls(current => ({
                  ...current,
                  certPath: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="tls.keyPath"
            error={findIssueByPath(issues, 'gateway.tls.keyPath') ?? null}
          >
            <input
              type="text"
              value={gateway.tls?.keyPath ?? ''}
              placeholder="key.pem"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateTls(current => ({
                  ...current,
                  keyPath: nextValue || undefined,
                }))
              }}
            />
          </FormField>

          <FormField
            label="tls.caPath"
            error={findIssueByPath(issues, 'gateway.tls.caPath') ?? null}
          >
            <input
              type="text"
              value={gateway.tls?.caPath ?? ''}
              placeholder="ca.pem"
              className={INPUT_CLASS_NAME}
              onChange={event => {
                const nextValue = event.target.value
                updateTls(current => ({
                  ...current,
                  caPath: nextValue || undefined,
                }))
              }}
            />
          </FormField>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField
          label="trustedProxies"
          description="受信任反向代理 IP 列表。"
          error={findIssueByPath(issues, 'gateway.trustedProxies') ?? null}
        >
          <ArrayEditor
            value={gateway.trustedProxies}
            itemPlaceholder="输入代理 IP"
            addLabel="新增代理 IP"
            sortable
            onChange={nextValue => {
              updateGateway(current => ({
                ...current,
                trustedProxies: nextValue,
              }))
            }}
          />
        </FormField>

        <div className="space-y-3">
          <FormField
            label="allowRealIpFallback"
            description="允许 x-real-ip 在缺少 x-forwarded-for 时兜底。"
            error={findIssueByPath(issues, 'gateway.allowRealIpFallback') ?? null}
          >
            <label className="inline-flex h-8 items-center gap-2 rounded-md border border-gray-700 bg-gray-900 px-2.5 text-xs text-gray-200">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 accent-blue-500"
                checked={gateway.allowRealIpFallback === true}
                onChange={event => {
                  const checked = event.target.checked
                  updateGateway(current => ({
                    ...current,
                    allowRealIpFallback: checked,
                  }))
                }}
              />
              允许 x-real-ip 兜底
            </label>
          </FormField>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField
              label="channelHealthCheckMinutes"
              error={findIssueByPath(issues, 'gateway.channelHealthCheckMinutes') ?? null}
            >
              <input
                type="number"
                value={gateway.channelHealthCheckMinutes ?? ''}
                placeholder="5"
                className={INPUT_CLASS_NAME}
                onChange={event => {
                  const nextValue = toOptionalNumber(event.target.value)
                  updateGateway(current => ({
                    ...current,
                    channelHealthCheckMinutes: nextValue,
                  }))
                }}
              />
            </FormField>

            <FormField
              label="channelStaleEventThresholdMinutes"
              error={findIssueByPath(issues, 'gateway.channelStaleEventThresholdMinutes') ?? null}
            >
              <input
                type="number"
                value={gateway.channelStaleEventThresholdMinutes ?? ''}
                placeholder="30"
                className={INPUT_CLASS_NAME}
                onChange={event => {
                  const nextValue = toOptionalNumber(event.target.value)
                  updateGateway(current => ({
                    ...current,
                    channelStaleEventThresholdMinutes: nextValue,
                  }))
                }}
              />
            </FormField>

            <FormField
              label="channelMaxRestartsPerHour"
              error={findIssueByPath(issues, 'gateway.channelMaxRestartsPerHour') ?? null}
            >
              <input
                type="number"
                value={gateway.channelMaxRestartsPerHour ?? ''}
                placeholder="10"
                className={INPUT_CLASS_NAME}
                onChange={event => {
                  const nextValue = toOptionalNumber(event.target.value)
                  updateGateway(current => ({
                    ...current,
                    channelMaxRestartsPerHour: nextValue,
                  }))
                }}
              />
            </FormField>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-[11px] leading-5 text-blue-100/90">
        `http`、`push`、`nodes`、`tools` 等高级 Gateway 配置本轮未做表单化，建议继续在 JSON 视图编辑。
      </div>
    </div>
  )
}
