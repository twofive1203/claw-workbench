import type { ConfigValidationIssue } from '../../../lib/configSchema'

/**
 * 根据路径前缀查找首条校验错误。
 * @param issues 校验问题列表。
 * @param pathPrefix 路径前缀。
 */
export function findIssueByPath(issues: ConfigValidationIssue[], pathPrefix: string): string | undefined {
  const issue = issues.find(item => item.path === pathPrefix || item.path.startsWith(`${pathPrefix}.`))
  return issue?.message
}

/**
 * 过滤某个分区下的校验错误。
 * @param issues 校验问题列表。
 * @param sectionPrefix 分区路径前缀。
 */
export function filterSectionIssues(
  issues: ConfigValidationIssue[],
  sectionPrefix: string,
): ConfigValidationIssue[] {
  return issues.filter(
    item => item.path === sectionPrefix || item.path.startsWith(`${sectionPrefix}.`),
  )
}

