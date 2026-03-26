/**
 * GitHub Tag 版本校验脚本。
 *
 * 说明：校验 Git 标签名是否与 package.json 中的版本一致。
 * 用法：
 * - node scripts/check-tag-version.mjs
 *
 * @author lichong
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const packageJsonPath = path.join(rootDir, 'package.json')

/**
 * 读取 package.json 中的版本号。
 * @param {string} filePath package.json 文件路径。
 */
function readPackageVersion(filePath) {
  const packageJson = JSON.parse(readFileSync(filePath, 'utf8'))
  return packageJson.version ?? ''
}

/**
 * 校验当前 Git 标签与包版本是否一致。
 * @param {string} tag GitHub Actions 注入的标签名。
 * @param {string} version package.json 中的版本号。
 */
function assertTagMatchesVersion(tag, version) {
  const expected = `v${version}`

  if (tag !== expected) {
    console.error(`Tag ${tag} 与 package.json 版本 ${expected} 不一致`)
    process.exit(1)
  }

  console.log(`版本校验通过：${tag}`)
}

const tag = process.env.GITHUB_REF_NAME ?? ''
const version = readPackageVersion(packageJsonPath)

assertTagMatchesVersion(tag, version)
