/**
 * 版本同步脚本。
 *
 * 说明：以根目录 package.json 作为主版本入口，手工同步到 Tauri 与 Cargo。
 * 用法：
 * - node scripts/set-version.mjs 0.2.0
 * - node scripts/set-version.mjs --check
 *
 * @author towfive
 */

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const packageJsonPath = path.join(rootDir, 'package.json')
const tauriConfigPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json')
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml')

/**
 * 读取 JSON 文件。
 * @param {string} filePath 文件路径。
 */
function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

/**
 * 写入 JSON 文件。
 * @param {string} filePath 文件路径。
 * @param {unknown} value JSON 数据。
 */
function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

/**
 * 读取文本文件。
 * @param {string} filePath 文件路径。
 */
function readText(filePath) {
  return readFileSync(filePath, 'utf8')
}

/**
 * 写入文本文件。
 * @param {string} filePath 文件路径。
 * @param {string} value 文本内容。
 */
function writeText(filePath, value) {
  writeFileSync(filePath, value, 'utf8')
}

/**
 * 校验版本号格式。
 * @param {string | undefined} version 目标版本。
 */
function assertVersion(version) {
  const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
  if (!version || !versionPattern.test(version)) {
    throw new Error('版本号格式无效，请使用 x.y.z 或 x.y.z-prerelease')
  }
}

/**
 * 更新 Cargo.toml 中的包版本。
 * @param {string} cargoToml Cargo 配置文本。
 * @param {string} version 目标版本。
 */
function updateCargoVersion(cargoToml, version) {
  const nextContent = cargoToml.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/,
    `$1${version}$3`
  )

  if (nextContent === cargoToml) {
    throw new Error('未找到 Cargo.toml 的 [package].version 字段')
  }

  return nextContent
}

/**
 * 收集当前版本信息。
 */
function collectVersions() {
  const packageJson = readJson(packageJsonPath)
  const tauriConfig = readJson(tauriConfigPath)
  const cargoToml = readText(cargoTomlPath)
  const cargoMatch = cargoToml.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)

  return {
    packageJson: packageJson.version ?? null,
    tauriConfig: tauriConfig.version ?? null,
    cargo: cargoMatch?.[1] ?? null,
  }
}

/**
 * 输出当前版本状态。
 * @param {{ packageJson: string | null, tauriConfig: string | null, cargo: string | null }} versions 版本集合。
 */
function printVersions(versions) {
  console.log(`package.json      ${versions.packageJson ?? 'N/A'}`)
  console.log(`src-tauri config  ${versions.tauriConfig ?? 'N/A'}`)
  console.log(`Cargo.toml        ${versions.cargo ?? 'N/A'}`)
}

const arg = process.argv[2]

if (arg === '--check') {
  const versions = collectVersions()
  printVersions(versions)

  const uniqueVersions = new Set(Object.values(versions).filter(Boolean))
  if (uniqueVersions.size > 1) {
    console.error('版本不一致，请先执行版本同步')
    process.exit(1)
  }

  console.log('版本一致，可继续手工发版')
  process.exit(0)
}

assertVersion(arg)

const packageJson = readJson(packageJsonPath)
const tauriConfig = readJson(tauriConfigPath)
const cargoToml = readText(cargoTomlPath)

packageJson.version = arg
tauriConfig.version = arg

writeJson(packageJsonPath, packageJson)
writeJson(tauriConfigPath, tauriConfig)
writeText(cargoTomlPath, updateCargoVersion(cargoToml, arg))

console.log(`版本已同步为 ${arg}`)
printVersions(collectVersions())
