import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv'
import addFormats from 'ajv-formats'
import type { OpenClawConfig } from '../types/config'

/**
 * 配置校验问题。
 * @param path 问题字段路径。
 * @param message 校验错误信息。
 */
export interface ConfigValidationIssue {
  path: string
  message: string
}

/**
 * 配置校验结果。
 * @param valid 是否校验通过。
 * @param issues 校验问题列表。
 */
export interface ConfigValidationResult {
  valid: boolean
  issues: ConfigValidationIssue[]
}

/**
 * OpenClaw 配置 Schema（Phase 1 最小集）。
 * 说明：只覆盖已实现的表单字段，其余字段通过 additionalProperties 保留。
 */
const OPENCLAW_CONFIG_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: true,
  properties: {
    wizard: {
      type: 'object',
      additionalProperties: true,
      properties: {
        lastRunAt: { type: 'string' },
        lastRunVersion: { type: 'string' },
        lastRunCommit: { type: 'string' },
        lastRunCommand: { type: 'string' },
        lastRunMode: { type: 'string' },
      },
    },
    ui: {
      type: 'object',
      additionalProperties: true,
      properties: {
        seamColor: { type: 'string' },
        assistant: {
          type: 'object',
          additionalProperties: true,
          properties: {
            name: { type: 'string' },
            avatar: { type: 'string' },
          },
        },
      },
    },
    plugins: {
      type: 'object',
      additionalProperties: true,
      properties: {
        enabled: { type: 'boolean' },
        allow: {
          type: 'array',
          items: { type: 'string' },
        },
        deny: {
          type: 'array',
          items: { type: 'string' },
        },
        load: {
          type: 'object',
          additionalProperties: true,
          properties: {
            paths: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
        slots: {
          type: 'object',
          additionalProperties: true,
          properties: {
            memory: { type: 'string' },
            contextEngine: { type: 'string' },
          },
        },
        entries: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: true,
          },
        },
        installs: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    models: {
      type: 'object',
      additionalProperties: true,
      properties: {
        providers: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: true,
            properties: {
              baseUrl: { type: 'string' },
              apiKey: { type: 'string' },
              api: { type: 'string' },
              auth: { type: 'string' },
              authHeader: { type: 'boolean' },
              headers: {
                type: 'object',
                additionalProperties: { type: 'string' },
              },
              models: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: true,
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    reasoning: {
                      anyOf: [{ type: 'boolean' }, { type: 'string' }],
                    },
                    contextWindow: { type: 'number' },
                    maxTokens: { type: 'number' },
                    cost: {
                      type: 'object',
                      additionalProperties: { type: 'number' },
                    },
                  },
                  required: ['id'],
                },
              },
            },
          },
        },
      },
    },
    agents: {
      type: 'object',
      additionalProperties: true,
      properties: {
        defaults: {
          type: 'object',
          additionalProperties: true,
          properties: {
            model: {
              type: 'object',
              additionalProperties: true,
              properties: {
                primary: { type: 'string' },
                fallbacks: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
            models: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                additionalProperties: true,
              },
            },
            workspace: { type: 'string' },
            userTimezone: { type: 'string' },
            thinkingDefault: { type: 'string' },
            timeoutSeconds: { type: 'number' },
            contextTokens: { type: 'number' },
            heartbeat: {
              type: 'object',
              additionalProperties: true,
              properties: {
                every: { type: 'string' },
              },
            },
          },
        },
        list: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: true,
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              default: { type: 'boolean' },
              workspace: { type: 'string' },
              agentDir: { type: 'string' },
              model: {
                anyOf: [
                  { type: 'string' },
                  {
                    type: 'object',
                    additionalProperties: true,
                    properties: {
                      primary: { type: 'string' },
                      fallbacks: {
                        type: 'array',
                        items: { type: 'string' },
                      },
                    },
                  },
                ],
              },
              models: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  additionalProperties: true,
                },
              },
              tools: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  profile: { type: 'string' },
                  allow: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  alsoAllow: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  deny: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
              skills: {
                type: 'array',
                items: { type: 'string' },
              },
              identity: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  name: { type: 'string' },
                  theme: { type: 'string' },
                  emoji: { type: 'string' },
                  avatar: { type: 'string' },
                  avatarUrl: { type: 'string' },
                },
              },
              groupChat: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  mentionPatterns: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  historyLimit: { type: 'number' },
                },
              },
              heartbeat: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  every: { type: 'string' },
                },
              },
              subagents: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  allowAgents: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  model: {
                    anyOf: [
                      { type: 'string' },
                      {
                        type: 'object',
                        additionalProperties: true,
                        properties: {
                          primary: { type: 'string' },
                          fallbacks: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                        },
                      },
                    ],
                  },
                  thinking: { type: 'string' },
                },
              },
            },
            required: ['id'],
          },
        },
      },
    },
    channels: {
      type: 'object',
      additionalProperties: true,
      properties: {
        defaults: {
          type: 'object',
          additionalProperties: true,
          properties: {
            groupPolicy: { type: 'string' },
            heartbeat: {
              type: 'object',
              additionalProperties: true,
              properties: {
                showOk: { type: 'boolean' },
                showAlerts: { type: 'boolean' },
                useIndicator: { type: 'boolean' },
              },
            },
          },
        },
        modelByChannel: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            additionalProperties: { type: 'string' },
          },
        },
      },
    },
    gateway: {
      type: 'object',
      additionalProperties: true,
      properties: {
        port: { type: 'number' },
        mode: { type: 'string' },
        bind: { type: 'string' },
        customBindHost: { type: 'string' },
        controlUi: {
          type: 'object',
          additionalProperties: true,
          properties: {
            enabled: { type: 'boolean' },
            basePath: { type: 'string' },
            root: { type: 'string' },
            allowedOrigins: {
              type: 'array',
              items: { type: 'string' },
            },
            dangerouslyAllowHostHeaderOriginFallback: { type: 'boolean' },
            allowInsecureAuth: { type: 'boolean' },
            dangerouslyDisableDeviceAuth: { type: 'boolean' },
          },
        },
        auth: {
          type: 'object',
          additionalProperties: true,
          properties: {
            mode: { type: 'string' },
            token: {
              anyOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
            },
            password: {
              anyOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
            },
            allowTailscale: { type: 'boolean' },
            rateLimit: {
              type: 'object',
              additionalProperties: true,
              properties: {
                maxAttempts: { type: 'number' },
                windowMs: { type: 'number' },
                lockoutMs: { type: 'number' },
                exemptLoopback: { type: 'boolean' },
              },
            },
            trustedProxy: {
              type: 'object',
              additionalProperties: true,
              properties: {
                userHeader: { type: 'string' },
                requiredHeaders: {
                  type: 'array',
                  items: { type: 'string' },
                },
                allowUsers: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
        tailscale: {
          type: 'object',
          additionalProperties: true,
          properties: {
            mode: { type: 'string' },
            resetOnExit: { type: 'boolean' },
          },
        },
        remote: {
          type: 'object',
          additionalProperties: true,
          properties: {
            enabled: { type: 'boolean' },
            url: { type: 'string' },
            transport: { type: 'string' },
            token: {
              anyOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
            },
            password: {
              anyOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
            },
            tlsFingerprint: { type: 'string' },
            sshTarget: { type: 'string' },
            sshIdentity: { type: 'string' },
          },
        },
        reload: {
          type: 'object',
          additionalProperties: true,
          properties: {
            mode: { type: 'string' },
            debounceMs: { type: 'number' },
            deferralTimeoutMs: { type: 'number' },
          },
        },
        tls: {
          type: 'object',
          additionalProperties: true,
          properties: {
            enabled: { type: 'boolean' },
            autoGenerate: { type: 'boolean' },
            certPath: { type: 'string' },
            keyPath: { type: 'string' },
            caPath: { type: 'string' },
          },
        },
        trustedProxies: {
          type: 'array',
          items: { type: 'string' },
        },
        allowRealIpFallback: { type: 'boolean' },
        channelHealthCheckMinutes: { type: 'number' },
        channelStaleEventThresholdMinutes: { type: 'number' },
        channelMaxRestartsPerHour: { type: 'number' },
      },
    },
    logging: {
      type: 'object',
      additionalProperties: true,
      properties: {
        level: { type: 'string' },
        consoleLevel: { type: 'string' },
        consoleStyle: { type: 'string' },
        file: { type: 'string' },
        redactSensitive: { type: 'string' },
      },
    },
    bindings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          agentId: { type: 'string' },
          match: {
            type: 'object',
            additionalProperties: true,
            properties: {
              channel: { type: 'string' },
              accountId: { type: 'string' },
              peer: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  kind: { type: 'string' },
                  id: { type: 'string' },
                },
              },
            },
            required: ['channel'],
          },
        },
        required: ['agentId', 'match'],
      },
    },
  },
}

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
})
addFormats(ajv)

let cachedValidator: ValidateFunction | null = null

/**
 * 获取校验函数（带缓存）。
 * @param schema 目标 JSON Schema。
 */
function getValidator(schema: Record<string, unknown>): ValidateFunction {
  if (schema === OPENCLAW_CONFIG_SCHEMA && cachedValidator) {
    return cachedValidator
  }

  const validator = ajv.compile(schema)
  if (schema === OPENCLAW_CONFIG_SCHEMA) {
    cachedValidator = validator
  }
  return validator
}

/**
 * 将 JSON Pointer 转换为点路径。
 * @param value JSON Pointer 片段。
 */
function decodePointerToken(value: string): string {
  return value.replace(/~1/g, '/').replace(/~0/g, '~')
}

/**
 * 将 AJV 报错对象转换为统一问题结构。
 * @param error AJV 错误对象。
 */
function mapAjvError(error: ErrorObject): ConfigValidationIssue {
  const pathSegments = error.instancePath
    .split('/')
    .filter(Boolean)
    .map(decodePointerToken)

  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    pathSegments.push(error.params.missingProperty)
  }

  return {
    path: pathSegments.length > 0 ? pathSegments.join('.') : '(root)',
    message: error.message ?? '未知校验错误',
  }
}

/**
 * 加载配置 Schema（当前为内置静态 schema）。
 */
export async function loadConfigSchema(): Promise<Record<string, unknown>> {
  return OPENCLAW_CONFIG_SCHEMA
}

/**
 * 校验 OpenClaw 配置。
 * @param config 目标配置对象。
 * @param schema 可选自定义 schema。
 */
export function validateOpenClawConfig(
  config: OpenClawConfig,
  schema: Record<string, unknown> = OPENCLAW_CONFIG_SCHEMA,
): ConfigValidationResult {
  const validator = getValidator(schema)
  const valid = validator(config)
  if (valid) {
    return { valid: true, issues: [] }
  }

  const issues = (validator.errors ?? []).map(mapAjvError)
  return {
    valid: false,
    issues,
  }
}
