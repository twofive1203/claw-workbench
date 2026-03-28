import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useRef } from 'react'
import { Loader2, Square } from 'lucide-react'
import { ToolCallBlock } from './ToolCallBlock'
import { cn } from '../lib/utils'
import type { ChatAttachment, ChatMediaItem, ChatMessage, SessionSummary } from '../types'
import { useLocalizedSubtree } from '../i18n/useLocalizedSubtree'

/**
 * 多模型对话卡片属性。
 * @author towfive
 * @param title 卡片标题。
 * @param session 当前会话摘要。
 * @param messages 当前卡片消息列表。
 * @param modelOptions 可选模型列表。
 * @param selectedModel 当前选中模型。
 * @param isTyping 是否正在生成。
 * @param isLoadingHistory 是否正在加载历史。
 * @param showToolCallDetails 是否展示工具调用详情。
 * @param assistantName 助手显示名称。
 * @param onSelectModel 切换模型回调。
 * @param onFocus 聚焦当前卡片回调。
 * @param onAbort 中止当前卡片生成回调。
 */
interface MultiModelConversationPaneProps {
  title: string
  session: SessionSummary | null
  messages: ChatMessage[]
  modelOptions: string[]
  selectedModel: string
  isTyping: boolean
  isLoadingHistory: boolean
  showToolCallDetails: boolean
  assistantName: string
  onSelectModel: (model: string) => void
  onFocus: () => void
  onAbort: () => void
}

/**
 * 格式化卡片中的时间文案。
 * @param timestamp 消息时间戳。
 */
function formatPaneMessageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * 解析卡片消息的展示角色。
 * @param role 消息角色。
 */
function resolvePaneRoleLabel(role: ChatMessage['role']): string {
  if (role === 'user') return '你'
  if (role === 'system') return '系统'
  return '模型'
}

/**
 * 解析卡片消息展示模型。
 * @param message 当前消息。
 * @param session 当前会话摘要。
 */
function resolvePaneMessageModel(message: ChatMessage, session: SessionSummary | null): string | null {
  const rawModel = message.model?.trim() || session?.model?.trim() || ''
  return rawModel || null
}

/**
 * 提取消息中的可展示图片。
 * @param message 当前消息。
 */
function resolvePaneImages(message: ChatMessage): Array<{ src: string; alt: string }> {
  const mediaImages = (message.mediaItems ?? [])
    .filter((item: ChatMediaItem) => !item.omitted && item.src.trim().length > 0)
    .map((item, index) => ({
      src: item.src,
      alt: `${message.role}-media-${index + 1}`,
    }))

  const attachmentImages = (message.attachments ?? [])
    .filter((item: ChatAttachment) => item.mimeType.startsWith('image/') && item.data.trim().length > 0)
    .map((item, index) => ({
      src: item.data,
      alt: item.filename ?? item.fileName ?? `${message.role}-attachment-${index + 1}`,
    }))

  return [...attachmentImages, ...mediaImages]
}

/**
 * 多模型对话卡片。
 * @param props 组件属性。
 */
export function MultiModelConversationPane(props: MultiModelConversationPaneProps) {
  const {
    title,
    session,
    messages,
    modelOptions,
    selectedModel,
    isTyping,
    isLoadingHistory,
    showToolCallDetails,
    assistantName,
    onSelectModel,
    onFocus,
    onAbort,
  } = props
  const paneRef = useRef<HTMLElement | null>(null)

  useLocalizedSubtree(paneRef)

  return (
    <section ref={paneRef} className="wb-card-strong flex min-h-[360px] flex-col overflow-hidden rounded-[22px]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-[var(--text-strong)]">{title}</div>
          <div data-no-i18n className="truncate text-[11px] text-[var(--text-faint)]">
            {session?.displayName ?? session?.key ?? '未命名会话'}
          </div>
        </div>

        <select
          value={selectedModel}
          onChange={(event) => onSelectModel(event.target.value)}
          className="wb-select min-w-[156px]"
        >
          <option value="">默认模型</option>
          {modelOptions.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="wb-mini-button"
          onClick={onFocus}
        >
          聚焦
        </button>

        <button
          type="button"
          disabled={!isTyping}
          className={cn(
            'wb-mini-button',
            isTyping
              ? 'border-[color-mix(in_srgb,var(--color-orange-500)_30%,transparent)] text-[var(--color-orange-200)]'
              : '',
          )}
          onClick={onAbort}
        >
          <Square className="h-3 w-3 fill-current" />
          停止
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
        {isLoadingHistory && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--text-faint)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载会话中
          </div>
        ) : messages.length === 0 ? (
          <div className="wb-empty-state flex flex-1 items-center justify-center px-4 text-sm">
            发送一条消息开始多模型对比
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isUserMessage = message.role === 'user'
              const isSystemMessage = message.role === 'system'
              const messageModel = resolvePaneMessageModel(message, session)
              const images = resolvePaneImages(message)

              return (
                <article key={message.id} className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-faint)]">
                    <span className="font-medium text-[var(--text-subtle)]">{resolvePaneRoleLabel(message.role)}</span>
                    <span>{formatPaneMessageTime(message.timestamp)}</span>
                    {messageModel && <span>{messageModel}</span>}
                    {message.speakerName && !isUserMessage && <span data-no-i18n>{message.speakerName}</span>}
                  </div>

                  <div
                    className={cn(
                      'rounded-[20px] border px-4 py-3 text-sm leading-6 shadow-[var(--inset-highlight)]',
                      isUserMessage
                        ? 'border-[color-mix(in_srgb,var(--color-blue-500)_32%,transparent)] bg-user-bubble text-user-bubble-foreground'
                        : isSystemMessage
                          ? 'border-[color-mix(in_srgb,var(--color-red-700)_28%,transparent)] bg-[color-mix(in_srgb,var(--color-red-950)_48%,transparent)] text-[var(--color-red-200)]'
                          : 'border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)] text-[var(--text-strong)]',
                    )}
                  >
                    {message.content.trim().length > 0 ? (
                      isUserMessage || isSystemMessage ? (
                        <div data-no-i18n className="whitespace-pre-wrap break-words">{message.content}</div>
                      ) : (
                        <div data-no-i18n className="prose prose-invert max-w-none break-words text-sm prose-p:my-2 prose-pre:my-2 prose-code:text-[13px]">
                          <Markdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              table: ({ ...props }) => (
                                <div className="markdown-table-wrap">
                                  <table {...props} />
                                </div>
                              ),
                            }}
                          >
                            {message.content}
                          </Markdown>
                        </div>
                      )
                    ) : (
                      <div className="text-[var(--text-faint)]">{assistantName} 正在输出…</div>
                    )}

                    {images.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 gap-2">
                        {images.map((image) => (
                          <img
                            key={`${message.id}-${image.src}`}
                            src={image.src}
                            alt={image.alt}
                            className="max-h-64 rounded-2xl border border-[var(--border-default)] object-contain shadow-[var(--shadow-soft)]"
                          />
                        ))}
                      </div>
                    )}

                    {showToolCallDetails && message.toolCalls && message.toolCalls.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.toolCalls.map((toolCall) => (
                          <ToolCallBlock key={toolCall.toolCallId} call={toolCall} />
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}

            {isTyping && (
              <div className="rounded-[20px] border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_94%,transparent)] px-4 py-3 text-sm text-[var(--text-faint)]">
                <span className="typing-dots">{assistantName} 思考中</span>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
