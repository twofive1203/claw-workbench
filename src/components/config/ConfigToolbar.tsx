import { FileJson, FolderOpen, FormInput, Loader2, RotateCcw, Save, X } from 'lucide-react'
import { useI18n } from '../../i18n/useI18n'
import { cn } from '../../lib/utils'
import type { ConfigRpcState } from '../../types/config'

/**
 * 配置编辑器视图模式。
 */
export type ConfigViewMode = 'form' | 'json'

/**
 * 配置工具栏属性。
 * @param configPath 当前配置文件路径。
 * @param mode 当前读写模式（RPC/本地）。
 * @param isDirty 是否存在未保存变更。
 * @param isLoading 是否正在加载配置。
 * @param isSaving 是否正在保存配置。
 * @param error 错误信息。
 * @param viewMode 当前视图模式。
 * @param onPickFile 选择文件回调。
 * @param onSave 保存回调。
 * @param onRevert 还原回调。
 * @param onViewChange 视图切换回调。
 * @param onClose 关闭面板回调。
 */
interface ConfigToolbarProps {
  configPath: string
  mode: ConfigRpcState
  isDirty: boolean
  isLoading: boolean
  isSaving: boolean
  error: string | null
  viewMode: ConfigViewMode
  onPickFile: () => Promise<string | null>
  onSave: () => Promise<boolean>
  onRevert: () => void
  onViewChange: (viewMode: ConfigViewMode) => void
  onClose?: () => void
}

/**
 * 配置编辑器顶部工具栏。
 * @param props 组件属性。
 */
export function ConfigToolbar(props: ConfigToolbarProps) {
  const {
    configPath,
    mode,
    isDirty,
    isLoading,
    isSaving,
    error,
    viewMode,
    onPickFile,
    onSave,
    onRevert,
    onViewChange,
    onClose,
  } = props
  const { tr } = useI18n()

  return (
    <div className="space-y-2 border-b border-gray-800 bg-gray-900 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {mode !== 'rpc' && (
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-[11px] text-gray-500">{tr('config.file_path')}</div>
            <div className="truncate rounded-md border border-gray-700 bg-gray-950/70 px-2.5 py-1.5 text-xs text-gray-300">
              {configPath || tr('config.path_unset')}
            </div>
          </div>
        )}

        <div
          className={cn(
            'rounded-md border px-2 py-1 text-[11px]',
            isDirty
              ? 'border-amber-700/70 bg-amber-900/30 text-amber-200'
              : 'border-emerald-700/60 bg-emerald-900/20 text-emerald-200',
          )}
        >
          {isDirty ? tr('config.unsaved') : tr('config.saved')}
        </div>

        <div
          className={cn(
            'rounded-md border px-2 py-1 text-[11px]',
            mode === 'rpc'
              ? 'border-blue-700/70 bg-blue-900/30 text-blue-200'
              : 'border-gray-700 bg-gray-900/50 text-gray-300',
          )}
        >
          {tr('config.current_mode')}
          {' '}
          {mode === 'rpc' ? tr('config.mode_rpc') : tr('config.mode_local')}
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs text-gray-200 hover:border-gray-600"
          onClick={() => void onPickFile()}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {tr('config.select_file')}
        </button>

        <button
          type="button"
          disabled={!isDirty || isSaving || isLoading}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs',
            !isDirty || isSaving || isLoading
              ? 'cursor-not-allowed border border-gray-700 bg-gray-800 text-gray-500'
              : 'border border-gray-600 bg-gray-900 text-gray-200 hover:border-gray-500',
          )}
          onClick={onRevert}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {tr('config.revert')}
        </button>

        <button
          type="button"
          disabled={!isDirty || isSaving}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs',
            !isDirty || isSaving
              ? 'cursor-not-allowed border border-gray-700 bg-gray-800 text-gray-500'
              : 'border border-blue-600 bg-blue-600 text-white hover:bg-blue-500',
          )}
          onClick={() => void onSave()}
        >
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {mode === 'rpc' ? tr('config.save_to_gateway') : tr('config.save_to_local')}
        </button>

        <div className="inline-flex items-center rounded-md border border-gray-700 bg-gray-950 p-0.5">
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
              viewMode === 'form'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800',
            )}
            title={tr('config.switch_form')}
            onClick={() => onViewChange('form')}
          >
            <FormInput className="h-3.5 w-3.5" />
            {tr('config.form')}
          </button>

          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
              viewMode === 'json'
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800',
            )}
            title={tr('config.switch_json')}
            onClick={() => onViewChange('json')}
          >
            <FileJson className="h-3.5 w-3.5" />
            JSON
          </button>
        </div>

        {onClose && (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-950 text-gray-300 hover:border-gray-600 hover:text-gray-100"
            title={tr('config.close_panel')}
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {(isLoading || error) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {isLoading && (
            <div className="inline-flex items-center gap-1 rounded-md border border-gray-700 bg-gray-950/70 px-2 py-1 text-gray-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {tr('config.loading')}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-900/70 bg-red-950/40 px-2 py-1 text-red-200">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
