/**
 * 配置存储纯函数回归测试。
 * @author towfive
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROVIDER_USER_AGENT_HEADER_NAME,
  DEFAULT_PROVIDER_USER_AGENT_HEADER_VALUE,
} from '../types/config'
import {
  applyProviderUserAgentOverride,
  createJsonMergePatch,
  extractConfigValidationIssuesFromRpcError,
  shouldRunClientSchemaValidation,
  validateConfigForEditor,
} from './useConfigStore'

describe('createJsonMergePatch', () => {
  it('生成嵌套对象的 merge patch', () => {
    const base = {
      unchanged: 1,
      nested: {
        keep: true,
        remove: 'old',
        update: 'before',
      },
      list: [1, 2],
      removedRoot: 'gone',
    }
    const next = {
      unchanged: 1,
      nested: {
        keep: true,
        update: 'after',
      },
      list: [1, 2, 3],
      addedRoot: 'new',
    }

    expect(createJsonMergePatch(base, next)).toEqual({
      nested: {
        remove: null,
        update: 'after',
      },
      list: [1, 2, 3],
      removedRoot: null,
      addedRoot: 'new',
    })
  })

  it('未发生变化时返回 undefined', () => {
    const value = {
      models: {
        default: 'gpt-4.1',
      },
    }

    expect(createJsonMergePatch(value, value)).toBeUndefined()
  })
})

describe('applyProviderUserAgentOverride', () => {
  it('为新建 provider 补齐默认 User-Agent', () => {
    const result = applyProviderUserAgentOverride(
      {},
      {
        models: {
          providers: {
            openai: {
              baseUrl: 'https://example.com',
              models: [],
            },
          },
        },
      },
    )

    expect(result).toEqual({
      models: {
        providers: {
          openai: {
            baseUrl: 'https://example.com',
            models: [],
            headers: {
              [DEFAULT_PROVIDER_USER_AGENT_HEADER_NAME]: DEFAULT_PROVIDER_USER_AGENT_HEADER_VALUE,
            },
          },
        },
      },
    })
  })

  it('仅为已修改 provider 补齐 User-Agent，已有用户配置时保持不变', () => {
    const base = {
      models: {
        providers: {
          keep: {
            baseUrl: 'https://keep.example.com',
          },
          edited: {
            baseUrl: 'https://before.example.com',
          },
        },
      },
    }

    const result = applyProviderUserAgentOverride(base, {
      models: {
        providers: {
          keep: {
            baseUrl: 'https://keep.example.com',
          },
          edited: {
            baseUrl: 'https://after.example.com',
            headers: {
              Authorization: 'Bearer token',
              'user-agent': 'custom-user-agent',
            },
          },
        },
      },
    })

    expect(result).toEqual({
      models: {
        providers: {
          keep: {
            baseUrl: 'https://keep.example.com',
          },
          edited: {
            baseUrl: 'https://after.example.com',
            headers: {
              Authorization: 'Bearer token',
              'user-agent': 'custom-user-agent',
            },
          },
        },
      },
    })
  })
})

describe('shouldRunClientSchemaValidation', () => {
  it('本地模式始终启用前端 schema 校验', () => {
    expect(shouldRunClientSchemaValidation('local', null)).toBe(true)
  })

  it('RPC 模式且无远端 schema 时跳过前端校验', () => {
    expect(shouldRunClientSchemaValidation('rpc', null)).toBe(false)
  })

  it('RPC 模式即使存在远端 schema 也跳过前端校验', () => {
    expect(shouldRunClientSchemaValidation('rpc', { type: 'object' })).toBe(false)
  })
})

describe('validateConfigForEditor', () => {
  it('RPC 模式缺少远端 schema 时跳过前端校验', () => {
    const result = validateConfigForEditor({
      gateway: {
        port: '18789' as unknown as number,
      },
    }, 'rpc', null)

    expect(result).toEqual({
      valid: true,
      issues: [],
    })
  })
})

describe('extractConfigValidationIssuesFromRpcError', () => {
  it('支持从 error.details.details.issues 提取服务端校验问题', () => {
    const issues = extractConfigValidationIssuesFromRpcError({
      code: 'INVALID_REQUEST',
      details: {
        details: {
          issues: [
            { path: 'gateway.bind', message: 'must be string' },
          ],
        },
      },
    })

    expect(issues).toEqual([
      { path: 'gateway.bind', message: 'must be string' },
    ])
  })
})
