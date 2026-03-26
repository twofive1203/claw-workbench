import { describe, expect, it } from 'vitest'
import { isRecord, toErrorText, toOptionalText, toText } from './parsers'

describe('parsers', () => {
  it('toText 仅返回裁剪后的非空字符串', () => {
    expect(toText('  demo  ')).toBe('demo')
    expect(toText('   ')).toBeNull()
    expect(toText(123)).toBeNull()
  })

  it('toOptionalText 对空值返回 undefined', () => {
    expect(toOptionalText('  hello  ')).toBe('hello')
    expect(toOptionalText('')).toBeUndefined()
    expect(toOptionalText(null)).toBeUndefined()
  })

  it('toErrorText 优先读取 Error.message', () => {
    expect(toErrorText(new Error('boom'))).toBe('boom')
    expect(toErrorText('raw-error')).toBe('raw-error')
  })

  it('isRecord 仅接受普通对象', () => {
    expect(isRecord({ ok: true })).toBe(true)
    expect(isRecord([])).toBe(false)
    expect(isRecord(null)).toBe(false)
  })
})
