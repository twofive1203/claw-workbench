import { useEffect, type RefObject } from 'react'
import { useI18n } from './useI18n'

const TEXT_NODE_ORIGINAL_MAP = new WeakMap<Text, string>()
const TEXT_NODE_RENDERED_MAP = new WeakMap<Text, string>()
const ATTR_ORIGINAL_MAP = new WeakMap<Element, Map<string, string | null>>()
const ATTR_RENDERED_MAP = new WeakMap<Element, Map<string, string | null>>()
const TRANSLATABLE_ATTRS = ['title', 'placeholder', 'aria-label'] as const
const SKIP_SUBTREE_TAGS = new Set(['PRE', 'CODE', 'SCRIPT', 'STYLE', 'SVG', 'PATH', 'NOSCRIPT'])

/**
 * 读取属性缓存值。
 * @param cache 属性缓存表。
 * @param element 目标元素。
 * @param attrName 属性名。
 */
function readAttrCacheValue(
  cache: WeakMap<Element, Map<string, string | null>>,
  element: Element,
  attrName: string,
): string | null | undefined {
  const attrMap = cache.get(element)
  if (!attrMap || !attrMap.has(attrName)) return undefined
  return attrMap.get(attrName) ?? null
}

/**
 * 写入属性缓存值。
 * @param cache 属性缓存表。
 * @param element 目标元素。
 * @param attrName 属性名。
 * @param value 属性值。
 */
function writeAttrCacheValue(
  cache: WeakMap<Element, Map<string, string | null>>,
  element: Element,
  attrName: string,
  value: string | null,
): void {
  let attrMap = cache.get(element)
  if (!attrMap) {
    attrMap = new Map<string, string | null>()
    cache.set(element, attrMap)
  }
  attrMap.set(attrName, value)
}

/**
 * 判断元素是否应跳过整棵子树翻译。
 * @param element 目标元素。
 */
function shouldSkipSubtree(element: Element): boolean {
  if (element.closest('[data-no-i18n]')) return true
  if (SKIP_SUBTREE_TAGS.has(element.tagName)) return true
  if (element.getAttribute('contenteditable') === 'true') return true
  return false
}

/**
 * 翻译单个文本节点。
 * @param node 文本节点。
 * @param isEnglish 当前是否英文。
 * @param tr 翻译函数。
 */
function applyTextNode(node: Text, isEnglish: boolean, tr: (text: string) => string): void {
  const currentText = node.nodeValue ?? ''
  const cachedOriginalText = TEXT_NODE_ORIGINAL_MAP.get(node)
  const lastRenderedText = TEXT_NODE_RENDERED_MAP.get(node)

  if (cachedOriginalText === undefined) {
    TEXT_NODE_ORIGINAL_MAP.set(node, currentText)
  } else if (lastRenderedText !== undefined && currentText !== lastRenderedText) {
    TEXT_NODE_ORIGINAL_MAP.set(node, currentText)
  }

  const originalText = TEXT_NODE_ORIGINAL_MAP.get(node) ?? currentText
  const nextText = isEnglish ? tr(originalText) : originalText
  TEXT_NODE_RENDERED_MAP.set(node, nextText)

  if (currentText !== nextText) {
    node.nodeValue = nextText
  }
}

/**
 * 翻译元素属性。
 * @param element 目标元素。
 * @param isEnglish 当前是否英文。
 * @param tr 翻译函数。
 */
function applyElementAttrs(element: Element, isEnglish: boolean, tr: (text: string) => string): void {
  for (const attrName of TRANSLATABLE_ATTRS) {
    if (!element.hasAttribute(attrName)) continue

    const currentValue = element.getAttribute(attrName)
    if (currentValue === null) continue

    const cachedOriginalValue = readAttrCacheValue(ATTR_ORIGINAL_MAP, element, attrName)
    const lastRenderedValue = readAttrCacheValue(ATTR_RENDERED_MAP, element, attrName)

    if (cachedOriginalValue === undefined) {
      writeAttrCacheValue(ATTR_ORIGINAL_MAP, element, attrName, currentValue)
    } else if (lastRenderedValue !== undefined && currentValue !== lastRenderedValue) {
      writeAttrCacheValue(ATTR_ORIGINAL_MAP, element, attrName, currentValue)
    }

    const originalValue = readAttrCacheValue(ATTR_ORIGINAL_MAP, element, attrName)
    if (originalValue === undefined || originalValue === null) continue

    const nextValue = isEnglish ? tr(originalValue) : originalValue
    writeAttrCacheValue(ATTR_RENDERED_MAP, element, attrName, nextValue)

    if (currentValue !== nextValue) {
      element.setAttribute(attrName, nextValue)
    }
  }
}

/**
 * 递归翻译节点。
 * @param node 当前节点。
 * @param isEnglish 当前是否英文。
 * @param tr 翻译函数。
 */
function applyNode(node: Node, isEnglish: boolean, tr: (text: string) => string): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const parentElement = node.parentElement
    if (!parentElement || shouldSkipSubtree(parentElement)) return
    applyTextNode(node as Text, isEnglish, tr)
    return
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return

  const element = node as Element
  if (shouldSkipSubtree(element)) return

  applyElementAttrs(element, isEnglish, tr)
  for (const child of Array.from(element.childNodes)) {
    applyNode(child, isEnglish, tr)
  }
}

/**
 * 对指定子树启用界面文案国际化兜底。
 * @param ref 根节点引用。
 */
export function useLocalizedSubtree<T extends HTMLElement>(ref: RefObject<T | null>): void {
  const { isEnglish, trText } = useI18n()

  useEffect(() => {
    const root = ref.current
    if (!root) return

    applyNode(root, isEnglish, trText)

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') {
          applyNode(mutation.target, isEnglish, trText)
          continue
        }

        if (mutation.type === 'attributes') {
          applyNode(mutation.target, isEnglish, trText)
          continue
        }

        if (mutation.type === 'childList') {
          for (const node of Array.from(mutation.addedNodes)) {
            applyNode(node, isEnglish, trText)
          }
        }
      }
    })

    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATABLE_ATTRS],
    })

    return () => {
      observer.disconnect()
    }
  }, [isEnglish, ref, trText])
}
