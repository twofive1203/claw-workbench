import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { useMonaco } from '@monaco-editor/react'
import type { ConfigValidationIssue } from '../../lib/configSchema'
import { loadConfigSchema } from '../../lib/configSchema'
import { toErrorText } from '../../lib/parsers'
import { isRecord, normalizeRootConfig, type OpenClawConfig } from '../../types/config'

/**
 * JSON 编辑器属性。
 * @param config 当前配置对象。
 * @param configPath 当前配置文件路径。
 * @param onChange 配置变化回调。
 * @param issues 当前配置校验问题列表。
 * @param showConfigPath 是否展示配置路径栏。
 */
interface JsonEditorProps {
  config: OpenClawConfig
  configPath: string
  onChange: (config: OpenClawConfig) => void
  issues: ConfigValidationIssue[]
  showConfigPath?: boolean
}

const SCHEMA_URI = 'openclaw://schema/openclaw-config.json'

/**
 * 将配置对象序列化为格式化 JSON 文本。
 * @param config 配置对象。
 */
function stringifyConfig(config: OpenClawConfig): string {
  return JSON.stringify(config, null, 2)
}

/**
 * 生成 Monaco 模型路径。
 * @param configPath 配置文件路径。
 */
function toModelPath(configPath: string): string {
  const path = configPath.trim()
  if (!path) return 'file:///openclaw.json'
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(path)) return path

  const normalizedPath = path.replace(/\\/g, '/')
  if (/^[a-zA-Z]:\//.test(normalizedPath)) {
    return `file:///${normalizedPath}`
  }
  if (normalizedPath.startsWith('/')) {
    return `file://${normalizedPath}`
  }
  return `file:///${normalizedPath}`
}

/**
 * 将 JSON 文本解析并转为规范化字符串。
 * 仅当根节点为对象时返回结果，否则返回 null。
 * @param text 原始 JSON 文本。
 */
function toCanonicalJsonText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return '{}'

  try {
    const parsed = JSON.parse(text)
    if (!isRecord(parsed)) return null
    return stringifyConfig(normalizeRootConfig(parsed))
  } catch {
    return null
  }
}

/**
 * 内部编辑器组件，管理 JSON 文本编辑与校验。
 * 通过 Monaco 实例同步外部配置，避免重建导致光标跳转。
 */
function JsonEditorInner(props: {
  externalText: string
  modelPath: string
  issues: ConfigValidationIssue[]
  onChange: (config: OpenClawConfig) => void
  configPath: string
  showConfigPath: boolean
  schema: Record<string, unknown> | null
}) {
  const {
    externalText,
    modelPath,
    issues,
    onChange,
    configPath,
    showConfigPath,
    schema,
  } = props
  const monaco = useMonaco()
  const editorRef = useRef<{
    getValue: () => string
    setValue: (value: string) => void
  } | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  /**
   * 注入 JSON Schema，启用补全和实时校验。
   */
  useEffect(() => {
    if (!monaco || !schema) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(monaco.languages.json as any).jsonDefaults.setDiagnosticsOptions({
      validate: true,
      enableSchemaRequest: false,
      allowComments: false,
      schemas: [
        {
          uri: SCHEMA_URI,
          fileMatch: [modelPath],
          schema,
        },
      ],
    })
  }, [modelPath, monaco, schema])

  /**
   * 外部配置变化时同步编辑器文本。
   * 若当前文本语义上与外部一致，则不覆盖，以避免光标跳回开头。
   */
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const currentCanonicalText = toCanonicalJsonText(editor.getValue())
    if (currentCanonicalText === externalText) {
      return
    }

    editor.setValue(externalText)
  }, [externalText])

  /**
   * 编辑器挂载后缓存实例，供外部同步使用。
   * @param editor Monaco 编辑器实例。
   */
  const handleEditorMount = useCallback((editor: {
    getValue: () => string
    setValue: (value: string) => void
  }) => {
    editorRef.current = editor
  }, [])

  /**
   * 处理编辑器文本变更。
   * @param value 编辑器最新文本。
   */
  const handleEditorChange = useCallback((value?: string) => {
    const nextText = value ?? ''

    if (!nextText.trim()) {
      setParseError(null)
      onChange({})
      return
    }

    try {
      const parsed = JSON.parse(nextText)
      if (!isRecord(parsed)) {
        setParseError('根节点必须是 JSON 对象')
        return
      }

      setParseError(null)
      onChange(normalizeRootConfig(parsed))
    } catch (jsonError) {
      setParseError(`JSON 解析失败：${toErrorText(jsonError)}`)
    }
  }, [onChange])

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-gray-800 bg-gray-900/60">
      {showConfigPath && (
        <div className="border-b border-gray-800 px-3 py-2">
          <div className="mb-1 text-[11px] text-gray-500">当前文件</div>
          <div className="truncate rounded-md border border-gray-700 bg-gray-950/70 px-2.5 py-1.5 text-xs text-gray-300">
            {configPath || '未设置配置路径'}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1" data-no-i18n>
        <Editor
          path={modelPath}
          language="json"
          defaultValue={externalText}
          theme="vs-dark"
          onMount={handleEditorMount}
          onChange={handleEditorChange}
          options={{
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbersMinChars: 3,
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
          }}
        />
      </div>

      <div className="border-t border-gray-800 px-3 py-2 text-xs">
        {parseError ? (
          <div className="rounded-md border border-red-900/70 bg-red-950/40 px-2 py-1 text-red-200">
            {parseError}
          </div>
        ) : issues.length > 0 ? (
          <div className="rounded-md border border-amber-900/70 bg-amber-950/30 px-2 py-1 text-amber-200">
            当前有 {issues.length} 个配置校验问题，请修复后再保存
          </div>
        ) : (
          <div className="rounded-md border border-emerald-900/60 bg-emerald-950/20 px-2 py-1 text-emerald-200">
            JSON 格式正常，未发现校验问题
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * JSON 配置编辑器。
 * 负责组装 schema 与编辑器参数，外部配置变化时通过内部同步逻辑更新文本。
 * @param props 组件属性。
 */
export function JsonEditor(props: JsonEditorProps) {
  const { config, configPath, onChange, issues, showConfigPath = true } = props
  const [schema, setSchema] = useState<Record<string, unknown> | null>(null)

  const modelPath = useMemo(() => toModelPath(configPath), [configPath])
  const configText = useMemo(() => stringifyConfig(config), [config])

  /**
   * 初始化加载配置 schema。
   */
  useEffect(() => {
    let cancelled = false

    async function doLoad() {
      try {
        const nextSchema = await loadConfigSchema()
        if (cancelled) return
        setSchema(nextSchema)
      } catch {
        // schema 加载失败时静默处理，编辑器仍可使用
      }
    }

    void doLoad()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <JsonEditorInner
      externalText={configText}
      modelPath={modelPath}
      issues={issues}
      onChange={onChange}
      configPath={configPath}
      showConfigPath={showConfigPath}
      schema={schema}
    />
  )
}
