import type { ShutdownNotification, UpdateNotification } from '../types'

/**
 * 系统通知组件属性。
 * @param shutdown 关机通知。
 * @param update 更新通知。
 * @param onDismissUpdate 关闭更新通知回调。
 * @author towfive
 */
interface SystemNotificationProps {
  shutdown: ShutdownNotification | null
  update: UpdateNotification | null
  onDismissUpdate: () => void
}

/**
 * 系统通知条。
 * 当前按产品要求统一关闭页面内系统通知条，避免继续展示关机与更新提醒。
 * @param props 组件属性。
 */
export function SystemNotification(props: SystemNotificationProps) {
  void props
  return null
}
