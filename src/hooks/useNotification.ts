import { useCallback } from 'react'

/**
 * 桌面通知 Hook。
 * 当前按产品要求统一关闭系统通知，避免继续触发权限申请、系统弹窗和任务栏闪烁。
 */
export function useNotification() {
  /**
   * 发送桌面通知。
   * 当前统一禁用，保留空实现以避免影响现有调用方。
   * @param _title 通知标题。
   * @param _body 通知正文。
   */
  const notify = useCallback((title: string, body: string) => {
    void title
    void body
    return Promise.resolve()
  }, [])

  return { notify }
}
