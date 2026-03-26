import { Suspense, lazy, type ComponentProps } from 'react'
import { ConfigPanel } from '../config/ConfigPanel'
import { LogsPanel } from '../LogsPanel'
import { MemoryPanel } from '../MemoryPanel'
import { LazyPanelFallback } from './LazyPanelFallback'
import type { ActivePanel } from './activePanel'

const LazyConfigPanel = lazy(async () => ({ default: (await import('../config/ConfigPanel')).ConfigPanel }))
const LazyMemoryPanel = lazy(async () => ({ default: (await import('../MemoryPanel')).MemoryPanel }))
const LazyLogsPanel = lazy(async () => ({ default: (await import('../LogsPanel')).LogsPanel }))

interface AppPrimaryPanelProps {
  activePanel: ActivePanel
  tr: (key: string, params?: import('../../i18n/messages').I18nParams) => string
  configPanelProps: Omit<ComponentProps<typeof ConfigPanel>, 'onClose'>
  memoryPanelProps: Omit<ComponentProps<typeof MemoryPanel>, 'onClose'>
  logsPanelProps: Omit<ComponentProps<typeof LogsPanel>, 'onClose'>
  onClosePanel: () => void
}

/**
 * 主内容区互斥面板。
 * @param props 组件属性。
 */
export function AppPrimaryPanel(props: AppPrimaryPanelProps) {
  const { activePanel, tr, configPanelProps, memoryPanelProps, logsPanelProps, onClosePanel } = props

  if (activePanel === 'config') {
    return (
      <Suspense fallback={<LazyPanelFallback title={`${tr('panel.config.title')} · ${tr('common.loading')}`} />}>
        <LazyConfigPanel {...configPanelProps} onClose={onClosePanel} />
      </Suspense>
    )
  }

  if (activePanel === 'memory') {
    return (
      <Suspense fallback={<LazyPanelFallback title={`${tr('panel.memory.title')} · ${tr('common.loading')}`} />}>
        <LazyMemoryPanel {...memoryPanelProps} onClose={onClosePanel} />
      </Suspense>
    )
  }

  if (activePanel === 'logs') {
    return (
      <Suspense fallback={<LazyPanelFallback title={`${tr('panel.logs.title')} · ${tr('common.loading')}`} />}>
        <LazyLogsPanel {...logsPanelProps} onClose={onClosePanel} />
      </Suspense>
    )
  }

  return null
}
