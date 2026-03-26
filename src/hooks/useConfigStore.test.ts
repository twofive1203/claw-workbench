/**
 * 配置存储纯函数回归测试。
 * @author towfive
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROVIDER_USER_AGENT_HEADER_NAME,
  DEFAULT_PROVIDER_USER_AGENT_HEADER_VALUE,
} from '../types/config'
import { applyProviderUserAgentOverride, createJsonMergePatch } from './useConfigStore'

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
