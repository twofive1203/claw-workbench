/**
 * 消息状态纯函数回归测试。
 * @author towfive
 */

import { describe, expect, it } from 'vitest'
import type { ChatMessage } from '../../types'
import { mergePendingUserMessages } from './messageState'

/**
 * 构造聊天消息，减少测试样板代码。
 * @param patch 覆盖字段。
 */
function buildMessage(patch: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role' | 'content' | 'timestamp'>): ChatMessage {
  return {
    sessionKey: 'agent:demo:main',
    ...patch,
  }
}

describe('messageState pending user merge', () => {
  it('历史覆盖时保留尾部未同步的用户消息', () => {
    const currentMessages: ChatMessage[] = [
      buildMessage({ id: 'history-user', role: 'user', content: '第一句', timestamp: 1000 }),
      buildMessage({ id: 'history-assistant', role: 'assistant', content: '第一句回复', timestamp: 2000 }),
      buildMessage({ id: 'local-user', role: 'user', content: '第二句', timestamp: 2500 }),
    ]

    const historyMessages: ChatMessage[] = [
      buildMessage({ id: 'server-user', role: 'user', content: '第一句', timestamp: 1000 }),
      buildMessage({ id: 'server-assistant', role: 'assistant', content: '第一句回复', timestamp: 2600 }),
    ]

    const merged = mergePendingUserMessages(historyMessages, currentMessages)

    expect(merged).toHaveLength(3)
    expect(merged[2]?.role).toBe('user')
    expect(merged[2]?.content).toBe('第二句')
  })

  it('历史已包含用户消息时不重复追加', () => {
    const currentMessages: ChatMessage[] = [
      buildMessage({ id: 'local-user-1', role: 'user', content: '重复问题', timestamp: 1000 }),
      buildMessage({ id: 'local-assistant', role: 'assistant', content: '处理中', timestamp: 1500, messageState: 'streaming' }),
    ]

    const historyMessages: ChatMessage[] = [
      buildMessage({ id: 'server-user-1', role: 'user', content: '重复问题', timestamp: 1000 }),
      buildMessage({ id: 'server-assistant', role: 'assistant', content: '已收到', timestamp: 2000 }),
    ]

    const merged = mergePendingUserMessages(historyMessages, currentMessages)

    expect(merged).toHaveLength(2)
    expect(merged.filter(message => message.role === 'user')).toHaveLength(1)
  })

  it('历史为空时保留本地尾部用户消息', () => {
    const currentMessages: ChatMessage[] = [
      buildMessage({ id: 'local-user-1', role: 'user', content: '新问题', timestamp: 1000 }),
    ]

    const merged = mergePendingUserMessages([], currentMessages)

    expect(merged).toHaveLength(1)
    expect(merged[0]?.content).toBe('新问题')
  })
})
