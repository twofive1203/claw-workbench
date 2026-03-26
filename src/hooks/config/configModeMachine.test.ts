/**
 * 配置模式状态机纯函数测试。
 * @author towfive
 */

import { describe, expect, it } from 'vitest'
import {
  resolveConfigLoadStrategy,
  resolveRpcAvailabilityTransition,
  shouldPreferRpcAfterServerSwitch,
} from './configModeMachine'

describe('resolveConfigLoadStrategy', () => {
  it('rpc 模式断连时优先等待 RPC 并保留 rpc 展示', () => {
    expect(resolveConfigLoadStrategy({
      mode: 'rpc',
      preferRpcOnNextLoad: false,
      isRpcAvailable: false,
    })).toEqual({
      shouldPreferRpc: true,
      shouldTryRpcImmediately: false,
      shouldWaitForRpc: true,
      shouldKeepRpcModeAfterLocalFallback: true,
    })
  })

  it('local 模式且未要求优先 RPC 时直接走本地', () => {
    expect(resolveConfigLoadStrategy({
      mode: 'local',
      preferRpcOnNextLoad: false,
      isRpcAvailable: false,
    })).toEqual({
      shouldPreferRpc: false,
      shouldTryRpcImmediately: false,
      shouldWaitForRpc: false,
      shouldKeepRpcModeAfterLocalFallback: false,
    })
  })
})

describe('shouldPreferRpcAfterServerSwitch', () => {
  it('仅在 server key 变化时返回 true', () => {
    expect(shouldPreferRpcAfterServerSwitch('server-a', 'server-b')).toBe(true)
    expect(shouldPreferRpcAfterServerSwitch('server-a', 'server-a')).toBe(false)
  })
})

describe('resolveRpcAvailabilityTransition', () => {
  it('RPC 断开时安排延迟降级', () => {
    expect(resolveRpcAvailabilityTransition({
      ready: true,
      hasConfigPath: true,
      previousRpcReady: true,
      isRpcAvailable: false,
    })).toEqual({
      shouldScheduleLocalDemotion: true,
      shouldReloadFromRpc: false,
    })
  })

  it('RPC 从不可用恢复后触发重新加载', () => {
    expect(resolveRpcAvailabilityTransition({
      ready: true,
      hasConfigPath: true,
      previousRpcReady: false,
      isRpcAvailable: true,
    })).toEqual({
      shouldScheduleLocalDemotion: false,
      shouldReloadFromRpc: true,
    })
  })

  it('未就绪或无路径时恢复也不触发重载', () => {
    expect(resolveRpcAvailabilityTransition({
      ready: false,
      hasConfigPath: true,
      previousRpcReady: false,
      isRpcAvailable: true,
    }).shouldReloadFromRpc).toBe(false)

    expect(resolveRpcAvailabilityTransition({
      ready: true,
      hasConfigPath: false,
      previousRpcReady: false,
      isRpcAvailable: true,
    }).shouldReloadFromRpc).toBe(false)
  })
})
