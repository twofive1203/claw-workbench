/**
 * 国际化纯函数回归测试。
 * @author towfive
 */

import { describe, expect, it } from 'vitest'
import { normalizeLocale, translateByKey, translateUiText } from './messages'

describe('i18n helpers', () => {
  it('规范化语言值', () => {
    expect(normalizeLocale('en-GB')).toBe('en-US')
    expect(normalizeLocale('zh-CN')).toBe('zh-CN')
    expect(normalizeLocale(undefined)).toBe('zh-CN')
  })

  it('优先命中精确翻译', () => {
    expect(translateUiText('配置编辑器', 'en-US')).toBe('Config Editor')
  })

  it('支持短语级动态替换', () => {
    expect(translateUiText('总计 10（估算）', 'en-US')).toBe('Total 10 (estimated)')
    expect(translateUiText('失败: 网络错误', 'en-US')).toBe('Failed: 网络错误')
  })

  it('支持稳定 key 翻译与占位参数', () => {
    expect(translateByKey('app.status.failed_with_reason', 'en-US', { reason: 'Network Error' })).toBe('Failed: Network Error')
    expect(translateByKey('app.multi_model.enabled_count', 'zh-CN', { count: 3 })).toBe('已开启 3 路新对话')
  })
})
