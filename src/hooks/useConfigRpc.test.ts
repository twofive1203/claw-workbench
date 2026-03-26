/**
 * 配置 RPC 兼容逻辑回归测试。
 * @author lichong
 */

import { describe, expect, it } from 'vitest'
import {
  parseConfigText,
  resolveConfigFromPayload,
  resolveRawTextFromPayload,
} from './useConfigRpc'

describe('parseConfigText', () => {
  it('支持解析 JSON5 配置文本', () => {
    const result = parseConfigText(`
      {
        // comment
        models: {
          providers: {
            openai: {
              baseUrl: 'https://example.com',
            },
          },
        },
      }
    `)

    expect(result).toEqual({
      models: {
        providers: {
          openai: {
            baseUrl: 'https://example.com',
          },
        },
      },
    })
  })
})

describe('resolveConfigFromPayload', () => {
  it('优先使用结构化 config 字段', () => {
    const result = resolveConfigFromPayload({
      config: {
        agents: {
          list: [{ id: 'main' }],
        },
      },
      parsed: {
        agents: {
          list: [{ id: 'fallback' }],
        },
      },
    }, '')

    expect(result).toEqual({
      agents: {
        list: [{ id: 'main' }],
      },
    })
  })

  it('兼容新版 snapshot 的 resolved 字段兜底', () => {
    const result = resolveConfigFromPayload({
      resolved: {
        logging: {
          level: 'info',
        },
      },
    }, '')

    expect(result).toEqual({
      logging: {
        level: 'info',
      },
    })
  })

  it('在缺少结构化字段时回退解析 raw JSON5', () => {
    const result = resolveConfigFromPayload({}, `
      {
        agents: {
          defaults: {
            workspace: 'D:/workspace',
          },
        },
      }
    `)

    expect(result).toEqual({
      agents: {
        defaults: {
          workspace: 'D:/workspace',
        },
      },
    })
  })
})

describe('resolveRawTextFromPayload', () => {
  it('优先返回服务端原始 raw 文本', () => {
    expect(resolveRawTextFromPayload({
      raw: '{ answer: 42 }',
      config: { answer: 1 },
    })).toBe('{ answer: 42 }')
  })

  it('缺少 raw 时回退到结构化字段', () => {
    expect(resolveRawTextFromPayload({
      resolved: {
        gateway: {
          port: 18789,
        },
      },
    })).toContain('"port": 18789')
  })
})
