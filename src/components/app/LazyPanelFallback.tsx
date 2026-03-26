import { Loader2 } from 'lucide-react'

/**
 * 懒加载面板占位组件。
 * @param title 当前加载中的面板标题。
 */
export function LazyPanelFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-[var(--color-gray-950)] text-[var(--color-gray-300)]">
      <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-gray-800)] bg-[var(--color-gray-900)] px-4 py-3 text-sm shadow-lg">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{title}</span>
      </div>
    </div>
  )
}
