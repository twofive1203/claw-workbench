/**
 * OpenClaw 设备身份管理：Ed25519 密钥对生命周期、v3 签名载荷、deviceToken 存取。
 * 对齐官方 Control UI 的 device-identity / device-auth 实现。
 * @author towfive
 */

import * as ed from '@noble/ed25519'
import { sha256, sha512 } from '@noble/hashes/sha2.js'

/**
 * 异步计算 SHA-512，用于覆盖 noble 默认的 Web Crypto subtle 依赖。
 * @param message 待计算哈希的消息字节。
 */
function sha512AsyncFallback(message: Uint8Array): Promise<Uint8Array> {
  return Promise.resolve(sha512(message))
}

/**
 * 为 HTTP/IP 远程访问场景配置纯 JS 哈希实现，避免 noble 默认依赖 crypto.subtle。
 */
ed.hashes.sha512 = sha512
ed.hashes.sha512Async = sha512AsyncFallback

// ===================== 类型 =====================

/** 设备身份（内存表示）。 */
export interface DeviceIdentity {
  /** SHA-256(publicKey).hex */
  deviceId: string
  /** 原始 32 字节公钥 */
  publicKey: Uint8Array
  /** 原始 32 字节私钥 */
  privateKey: Uint8Array
}

/** 持久化的设备身份（序列化友好）。 */
interface StoredIdentity {
  deviceId: string
  /** base64url 编码 */
  publicKey: string
  /** base64url 编码 */
  privateKey: string
}

/** 持久化的设备令牌条目。 */
interface StoredDeviceAuthEntry {
  version: number
  deviceId: string
  tokens: Record<string, { token: string; role: string }>
}

/** buildDeviceAuthPayload 参数。 */
export interface DeviceAuthPayloadParams {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: readonly string[]
  signedAtMs: number
  token: string | null
  nonce: string
  platform: string
  deviceFamily: string
}

// ===================== base64url 辅助 =====================

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ===================== hex 辅助 =====================

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// ===================== 存储层 =====================

const IDENTITY_STORE_FILE = 'device-identity.json'
const IDENTITY_STORE_KEY = 'identity'
const AUTH_STORE_FILE = 'device-auth.json'
const AUTH_STORE_KEY = 'auth'
const WEB_AUTH_STORAGE_KEY = 'openclaw.device.auth.v1'
const WEB_IDENTITY_STORAGE_KEY = 'openclaw.device.identity.v1'

/** Tauri plugin-store 接口（避免静态导入）。 */
interface PluginStoreInstance {
  get<T>(key: string): Promise<T | undefined>
  set(key: string, value: unknown): Promise<void>
}

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

/** 加载 Tauri plugin-store 实例。 */
async function loadPluginStore(file: string): Promise<PluginStoreInstance> {
  const { Store: PluginStore } = await import('@tauri-apps/plugin-store')
  return PluginStore.load(file, { defaults: {}, autoSave: 100 })
}

// ===================== 设备身份：生成 & 存储 =====================

/** 内存缓存，避免重复读取存储。 */
let cachedIdentity: DeviceIdentity | null = null

/**
 * 计算字节数组的 SHA-256 摘要。
 * @param bytes 输入字节数组。
 */
async function digestSha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    try {
      // 注意：TS 的 lib.dom BufferSource 类型不接受 SharedArrayBuffer；slice() 会返回基于 ArrayBuffer 的拷贝。
      const hashBuffer = await subtle.digest('SHA-256', bytes.slice())
      return new Uint8Array(hashBuffer)
    } catch {
      // 远程 Web 通过 HTTP/IP 访问时，部分浏览器可能存在 subtle 可见但不可用的情况，这里回退到纯 JS 实现。
    }
  }

  return sha256(bytes)
}

/**
 * 从 SHA-256(公钥原始字节) 派生 deviceId。
 * @param publicKey 公钥原始字节（通常为 32 bytes）。
 */
async function deriveDeviceId(publicKey: Uint8Array): Promise<string> {
  const hashBytes = await digestSha256(publicKey)
  return toHex(hashBytes)
}

/**
 * 生成新的 Ed25519 密钥对。
 */
async function generateIdentity(): Promise<DeviceIdentity> {
  const { secretKey, publicKey } = await ed.keygenAsync()
  const deviceId = await deriveDeviceId(publicKey)
  return { deviceId, publicKey, privateKey: secretKey }
}

/**
 * 持久化设备身份到存储。
 */
async function persistIdentity(identity: DeviceIdentity): Promise<void> {
  const stored: StoredIdentity = {
    deviceId: identity.deviceId,
    publicKey: toBase64Url(identity.publicKey),
    privateKey: toBase64Url(identity.privateKey),
  }

  if (isTauri) {
    const store = await loadPluginStore(IDENTITY_STORE_FILE)
    await store.set(IDENTITY_STORE_KEY, stored)
  } else {
    try {
      window.localStorage.setItem(WEB_IDENTITY_STORAGE_KEY, JSON.stringify(stored))
    } catch { /* localStorage 不可用时静默跳过 */ }
  }
}

/**
 * 从存储加载设备身份。
 */
async function loadPersistedIdentity(): Promise<DeviceIdentity | null> {
  let stored: StoredIdentity | null | undefined = null

  if (isTauri) {
    const store = await loadPluginStore(IDENTITY_STORE_FILE)
    stored = await store.get<StoredIdentity>(IDENTITY_STORE_KEY)
  } else {
    try {
      const raw = window.localStorage.getItem(WEB_IDENTITY_STORAGE_KEY)
      if (raw) stored = JSON.parse(raw) as StoredIdentity
    } catch { /* ignore */ }
  }

  if (!stored?.deviceId || !stored.publicKey || !stored.privateKey) return null

  try {
    const publicKey = fromBase64Url(stored.publicKey)
    const privateKey = fromBase64Url(stored.privateKey)
    // 校验长度
    if (publicKey.length !== 32 || privateKey.length !== 32) return null
    return { deviceId: stored.deviceId, publicKey, privateKey }
  } catch {
    return null
  }
}

/**
 * 加载或创建设备身份（幂等，带内存缓存）。
 */
export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  if (cachedIdentity) return cachedIdentity

  const persisted = await loadPersistedIdentity()
  if (persisted) {
    cachedIdentity = persisted
    return persisted
  }

  const identity = await generateIdentity()
  await persistIdentity(identity)
  cachedIdentity = identity
  return identity
}

/**
 * 清除本地设备身份（用于身份重置场景）。
 */
export async function clearDeviceIdentity(): Promise<void> {
  cachedIdentity = null

  if (isTauri) {
    try {
      const store = await loadPluginStore(IDENTITY_STORE_FILE)
      await store.set(IDENTITY_STORE_KEY, null)
    } catch { /* ignore */ }
  } else {
    try {
      window.localStorage.removeItem(WEB_IDENTITY_STORAGE_KEY)
    } catch { /* ignore */ }
  }
}

// ===================== v3 签名载荷 =====================

/**
 * 构造 v3 格式签名载荷（管道分隔）。
 * 格式: "v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily"
 */
export function buildDeviceAuthPayload(params: DeviceAuthPayloadParams): string {
  // 注意：scopes 必须保持与 connect 请求中发送的顺序一致，不能擅自排序。
  // 网关侧验签会按原始 scopes 顺序重建 payload；排序会导致 device signature invalid。
  const scopes = [...params.scopes].join(',')
  const token = params.token ?? ''
  const platform = params.platform.toLowerCase().replace(/\s/g, '')
  const deviceFamily = params.deviceFamily.toLowerCase().replace(/\s/g, '')

  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|')
}

// ===================== 签名 =====================

/**
 * 用 Ed25519 私钥签名载荷，返回 base64url 编码签名。
 */
export async function signDevicePayload(privateKey: Uint8Array, payload: string): Promise<string> {
  const message = new TextEncoder().encode(payload)
  const signature = await ed.signAsync(message, privateKey)
  return toBase64Url(signature)
}

// ===================== deviceToken 存取 =====================

/**
 * 存储网关颁发的 deviceToken。
 */
export async function storeDeviceToken(deviceId: string, role: string, token: string): Promise<void> {
  if (isTauri) {
    const store = await loadPluginStore(AUTH_STORE_FILE)
    const existing = await store.get<StoredDeviceAuthEntry>(AUTH_STORE_KEY)
    const entry: StoredDeviceAuthEntry = {
      version: 1,
      deviceId,
      tokens: existing?.tokens ?? {},
    }
    entry.tokens[role] = { token, role }
    await store.set(AUTH_STORE_KEY, entry)
  } else {
    try {
      const raw = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY)
      const existing: StoredDeviceAuthEntry = raw
        ? JSON.parse(raw)
        : { version: 1, deviceId, tokens: {} }
      existing.deviceId = deviceId
      existing.tokens[role] = { token, role }
      window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, JSON.stringify(existing))
    } catch { /* ignore */ }
  }
}

/**
 * 加载已存储的 deviceToken。
 */
export async function loadDeviceToken(deviceId: string, role: string): Promise<string | null> {
  let entry: StoredDeviceAuthEntry | null | undefined = null

  if (isTauri) {
    const store = await loadPluginStore(AUTH_STORE_FILE)
    entry = await store.get<StoredDeviceAuthEntry>(AUTH_STORE_KEY)
  } else {
    try {
      const raw = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY)
      if (raw) entry = JSON.parse(raw) as StoredDeviceAuthEntry
    } catch { /* ignore */ }
  }

  if (!entry || entry.deviceId !== deviceId) return null
  return entry.tokens[role]?.token ?? null
}

/**
 * 清除已存储的 deviceToken。
 * @param deviceId 设备 ID（用于校验当前条目，避免误删）。
 * @param role 角色名（例如 operator）。
 */
export async function clearDeviceToken(deviceId: string, role: string): Promise<void> {
  if (isTauri) {
    const store = await loadPluginStore(AUTH_STORE_FILE)
    const existing = await store.get<StoredDeviceAuthEntry>(AUTH_STORE_KEY)
    if (!existing || existing.deviceId !== deviceId) return
    if (existing.tokens[role]) {
      delete existing.tokens[role]
      await store.set(AUTH_STORE_KEY, existing)
    }
  } else {
    try {
      const raw = window.localStorage.getItem(WEB_AUTH_STORAGE_KEY)
      if (!raw) return
      const existing = JSON.parse(raw) as StoredDeviceAuthEntry
      if (existing.deviceId !== deviceId) return
      if (existing.tokens[role]) {
        delete existing.tokens[role]
        window.localStorage.setItem(WEB_AUTH_STORAGE_KEY, JSON.stringify(existing))
      }
    } catch { /* ignore */ }
  }
}

// ===================== 平台检测 =====================

/**
 * 检测当前运行平台标识。
 */
export function detectPlatform(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'web'
}

// ===================== 公钥编码导出 =====================

export { toBase64Url, fromBase64Url }
