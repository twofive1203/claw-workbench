/**
 * 附件缓存回归测试。
 * @author towfive
 */

import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatAttachment, ChatMessage } from '../types'
import { ATTACHMENTS_STORAGE_KEY, persistSessionAttachments, restoreSessionAttachments } from './chatAttachmentCache'

/**
 * 构造测试附件。
 * @param filename 文件名。
 * @param seed base64 内容种子。
 */
function createAttachment(filename: string, seed: string): ChatAttachment {
  return {
    data: `data:image/png;base64,${seed}`,
    content: seed,
    mimeType: 'image/png',
    filename,
    fileName: filename,
  }
}

/**
 * 构造测试消息。
 * @param id 消息 id。
 * @param sessionKey 会话 key。
 * @param content 消息内容。
 * @param timestamp 时间戳。
 */
function createMessage(id: string, sessionKey: string, content: string, timestamp: number): ChatMessage {
  return {
    id,
    sessionKey,
    role: 'user',
    content,
    timestamp,
  }
}

describe('chatAttachmentCache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('按完整内容恢复附件，避免长前缀消息互相覆盖', () => {
    const sessionKey = 'agent:demo:main'
    const sharedPrefix = '相同前缀'.repeat(30)
    const firstContent = `${sharedPrefix}-第一条`
    const secondContent = `${sharedPrefix}-第二条`

    persistSessionAttachments({
      sessionKey,
      messageId: 'local-1',
      role: 'user',
      content: firstContent,
      timestamp: 1000,
      attachments: [createAttachment('first.png', 'Zmlyc3Q=')],
    })
    persistSessionAttachments({
      sessionKey,
      messageId: 'local-2',
      role: 'user',
      content: secondContent,
      timestamp: 2000,
      attachments: [createAttachment('second.png', 'c2Vjb25k')],
    })

    const restored = restoreSessionAttachments(sessionKey, [
      createMessage('remote-1', sessionKey, firstContent, 1100),
      createMessage('remote-2', sessionKey, secondContent, 2100),
    ])

    expect(restored[0].attachments?.[0]?.filename).toBe('first.png')
    expect(restored[1].attachments?.[0]?.filename).toBe('second.png')
  })

  it('相同内容重试多次时，按顺序恢复各自附件', () => {
    const sessionKey = 'agent:demo:retry'
    const content = '请帮我处理这张图片'

    persistSessionAttachments({
      sessionKey,
      messageId: 'retry-local-1',
      role: 'user',
      content,
      timestamp: 1000,
      attachments: [createAttachment('first-retry.png', 'MQ==')],
    })
    persistSessionAttachments({
      sessionKey,
      messageId: 'retry-local-2',
      role: 'user',
      content,
      timestamp: 3000,
      attachments: [createAttachment('second-retry.png', 'Mg==')],
    })

    const restored = restoreSessionAttachments(sessionKey, [
      createMessage('retry-remote-1', sessionKey, content, 1100),
      createMessage('retry-remote-2', sessionKey, content, 3200),
    ])

    expect(restored[0].attachments?.[0]?.filename).toBe('first-retry.png')
    expect(restored[1].attachments?.[0]?.filename).toBe('second-retry.png')
  })

  it('兼容旧版缓存结构，避免历史消息展示受影响', () => {
    const sessionKey = 'agent:demo:legacy'
    const content = '旧版本缓存消息内容'
    const legacyKey = `user:${content.slice(0, 100)}`

    localStorage.setItem(ATTACHMENTS_STORAGE_KEY, JSON.stringify({
      [sessionKey]: {
        [legacyKey]: [createAttachment('legacy.png', 'bGVnYWN5')],
      },
    }))

    const restored = restoreSessionAttachments(sessionKey, [
      createMessage('legacy-1', sessionKey, content, 1000),
    ])

    expect(restored[0].attachments?.[0]?.filename).toBe('legacy.png')
  })
})
