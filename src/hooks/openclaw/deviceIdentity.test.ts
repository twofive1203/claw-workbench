/**
 * 设备身份回归测试。
 * @author lichong
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearDeviceIdentity, loadOrCreateDeviceIdentity } from './deviceIdentity'

const WEB_IDENTITY_STORAGE_KEY = 'openclaw.device.identity.v1'
const originalCrypto = globalThis.crypto

/**
 * 构造不带 subtle 的 crypto 对象，用于模拟 HTTP 非安全上下文。
 * @param source 原始浏览器 crypto 实例。
 */
function createCryptoWithoutSubtle(source: Crypto): Crypto {
  return {
    getRandomValues: source.getRandomValues.bind(source),
    randomUUID: source.randomUUID?.bind(source),
  } as Crypto
}

describe('deviceIdentity fallback', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await clearDeviceIdentity()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('crypto', originalCrypto)
    window.localStorage.clear()
    await clearDeviceIdentity()
  })

  it('crypto.subtle 缺失时仍可生成并持久化设备身份', async () => {
    vi.stubGlobal('crypto', createCryptoWithoutSubtle(originalCrypto))

    const identity = await loadOrCreateDeviceIdentity()
    const persisted = window.localStorage.getItem(WEB_IDENTITY_STORAGE_KEY)

    expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/)
    expect(identity.publicKey).toHaveLength(32)
    expect(identity.privateKey).toHaveLength(32)
    expect(persisted).toContain(identity.deviceId)
  })
})
