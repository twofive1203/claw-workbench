/**
 * OpenClaw 纯函数回归测试。
 * @author towfive
 */

import { describe, expect, it } from 'vitest'
import { normalizeHistoryMessages, normalizeSessionSummary } from './useOpenClaw'

describe('useOpenClaw pure helpers', () => {
  it('归一化历史消息时处理角色映射和附件字段', () => {
    const sessionKey = 'agent:demo:main'
    const messages = normalizeHistoryMessages(sessionKey, [
      {
        id: 'msg-system',
        role: 'developer',
        content: '系统规则',
        timestamp: 1000,
      },
      {
        id: 'msg-user',
        role: 'user',
        content: '请分析图片',
        timestamp: 2000,
        attachments: [
          {
            content: 'YWJj',
            mimeType: 'image/png',
            fileName: 'demo.png',
          },
        ],
      },
    ])

    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.attachments?.[0]?.data).toBe('data:image/png;base64,YWJj')
    expect(messages[1]?.attachments?.[0]?.fileName).toBe('demo.png')
  })

  it('归一化会话摘要时补齐 agent 与模型前缀', () => {
    const session = normalizeSessionSummary({
      key: 'agent:assistant-1:main',
      displayName: '主会话',
      modelProvider: 'openai',
      model: 'gpt-4.1',
      sendPolicy: 'allow',
      updatedAt: 123456,
    }, 'fallback-agent')

    expect(session).not.toBeNull()
    expect(session?.agentId).toBe('assistant-1')
    expect(session?.model).toBe('openai/gpt-4.1')
    expect(session?.sendPolicy).toBe('allow')
    expect(session?.updatedAt).toBe(123456)
  })
})
