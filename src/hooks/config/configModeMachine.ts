/**
 * 配置读写模式状态机。
 * @author towfive
 */

import type { ConfigRpcState } from '../../types/config'

/**
 * 配置加载策略入参。
 * @param mode 当前界面展示模式。
 * @param preferRpcOnNextLoad 下一次加载是否优先等待 RPC。
 * @param isRpcAvailable 当前 RPC 是否可用。
 */
export interface ConfigLoadStrategyInput {
  mode: ConfigRpcState
  preferRpcOnNextLoad: boolean
  isRpcAvailable: boolean
}

/**
 * 配置加载策略结果。
 * @param shouldPreferRpc 当前是否倾向 RPC。
 * @param shouldTryRpcImmediately 是否立即尝试 RPC。
 * @param shouldWaitForRpc 是否需要先等待 RPC 恢复。
 * @param shouldKeepRpcModeAfterLocalFallback 本次降级到本地后是否仍保留 rpc 模式展示。
 */
export interface ConfigLoadStrategy {
  shouldPreferRpc: boolean
  shouldTryRpcImmediately: boolean
  shouldWaitForRpc: boolean
  shouldKeepRpcModeAfterLocalFallback: boolean
}

/**
 * RPC 可用性变化判定入参。
 * @param ready Hook 是否已初始化完成。
 * @param hasConfigPath 当前是否已有配置路径。
 * @param previousRpcReady 变化前 RPC 是否可用。
 * @param isRpcAvailable 变化后 RPC 是否可用。
 */
export interface RpcAvailabilityTransitionInput {
  ready: boolean
  hasConfigPath: boolean
  previousRpcReady: boolean
  isRpcAvailable: boolean
}

/**
 * RPC 可用性变化判定结果。
 * @param shouldScheduleLocalDemotion 是否需要启动延迟降级。
 * @param shouldReloadFromRpc 是否需要在恢复后重新走一次 RPC 加载。
 */
export interface RpcAvailabilityTransitionResult {
  shouldScheduleLocalDemotion: boolean
  shouldReloadFromRpc: boolean
}

/**
 * 根据当前上下文解析一次配置加载的模式策略。
 * @param input 判定入参。
 */
export function resolveConfigLoadStrategy(input: ConfigLoadStrategyInput): ConfigLoadStrategy {
  const shouldPreferRpc = input.mode === 'rpc' || input.preferRpcOnNextLoad
  const shouldTryRpcImmediately = input.isRpcAvailable
  const shouldWaitForRpc = !input.isRpcAvailable && shouldPreferRpc
  const shouldKeepRpcModeAfterLocalFallback = shouldPreferRpc
    && input.mode === 'rpc'
    && !input.isRpcAvailable

  return {
    shouldPreferRpc,
    shouldTryRpcImmediately,
    shouldWaitForRpc,
    shouldKeepRpcModeAfterLocalFallback,
  }
}

/**
 * 判断 server 切换后下一次加载是否应优先等待 RPC。
 * @param previousServerKey 上一个 server key。
 * @param currentServerKey 当前 server key。
 */
export function shouldPreferRpcAfterServerSwitch(previousServerKey: string, currentServerKey: string): boolean {
  return previousServerKey !== currentServerKey
}

/**
 * 解析 RPC 可用性变化后需要执行的模式动作。
 * @param input 判定入参。
 */
export function resolveRpcAvailabilityTransition(
  input: RpcAvailabilityTransitionInput,
): RpcAvailabilityTransitionResult {
  if (!input.isRpcAvailable) {
    return {
      shouldScheduleLocalDemotion: true,
      shouldReloadFromRpc: false,
    }
  }

  return {
    shouldScheduleLocalDemotion: false,
    shouldReloadFromRpc: input.ready && input.hasConfigPath && !input.previousRpcReady,
  }
}
