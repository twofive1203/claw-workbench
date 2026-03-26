/**
 * 文件附件（发送格式）。
 */
export interface ImageAttachment {
  data: string
  content: string
  mimeType: string
  filename?: string
  fileName?: string
  /** 文本文件的纯文本内容（用于内联到消息） */
  textContent?: string
}

/**
 * 将 File 转为 base64 data URL。
 */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/**
 * 将 File 读取为纯文本。
 */
function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

/**
 * 判断 MIME 类型是否为图片。
 */
export function isImageMime(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * 判断文件是否为可读文本类型。
 */
export function isTextFile(file: File): boolean {
  const { type, name } = file
  if (type.startsWith('text/')) return true
  if (type === 'application/json' || type === 'application/xml') return true
  if (type === 'application/javascript' || type === 'application/typescript') return true
  // 按扩展名兜底
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const textExts = [
    'txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'css', 'scss', 'less',
    'html', 'htm', 'xml', 'svg', 'yaml', 'yml', 'toml', 'ini', 'cfg',
    'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1', 'psm1',
    'py', 'rb', 'rs', 'go', 'java', 'kt', 'c', 'cpp', 'h', 'hpp',
    'cs', 'swift', 'r', 'lua', 'pl', 'php', 'sql', 'graphql', 'gql',
    'env', 'gitignore', 'dockerignore', 'editorconfig', 'eslintrc',
    'prettierrc', 'babelrc', 'log', 'csv', 'tsv', 'conf', 'properties',
    'gradle', 'makefile', 'cmake', 'dockerfile', 'vagrantfile',
    'tf', 'hcl', 'proto', 'vue', 'svelte', 'astro',
  ]
  return textExts.includes(ext)
}

/**
 * 将单个文件转为附件。文本文件额外读取纯文本内容。
 */
export async function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  const data = await fileToDataUrl(file)
  const mimeType = file.type || 'application/octet-stream'
  const attachment: ImageAttachment = {
    data,
    content: data,
    mimeType,
    filename: file.name,
    fileName: file.name,
  }

  if (isTextFile(file)) {
    try {
      attachment.textContent = await fileToText(file)
    } catch {
      // 读取失败就跳过，仍作为 base64 发送
    }
  }

  return attachment
}

/**
 * 从剪贴板数据中提取图片文件。
 */
export function getImagesFromClipboard(clipboard: DataTransfer): File[] {
  const files: File[] = []
  for (const item of Array.from(clipboard.items)) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

/**
 * 从剪贴板数据中提取所有文件。
 */
export function getFilesFromClipboard(clipboard: DataTransfer): File[] {
  const files: File[] = []
  for (const item of Array.from(clipboard.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

/**
 * 从拖拽数据中提取所有文件。
 */
export function getFilesFromDrop(dataTransfer: DataTransfer): File[] {
  return Array.from(dataTransfer.files)
}

/**
 * 从拖拽数据中提取文件（兼容旧调用）。
 */
export function getImagesFromDrop(dataTransfer: DataTransfer): File[] {
  return getFilesFromDrop(dataTransfer)
}

/**
 * 将文本附件内联到消息文本中。
 * 返回增强后的消息文本和过滤后的纯图片附件列表。
 */
export function inlineTextAttachments(
  text: string,
  attachments: ImageAttachment[],
): { message: string; imageAttachments: ImageAttachment[] } {
  const textParts: string[] = []
  const imageAttachments: ImageAttachment[] = []

  for (const att of attachments) {
    if (att.textContent) {
      const ext = att.filename?.split('.').pop() ?? ''
      textParts.push(`<file name="${att.filename}">\n\`\`\`${ext}\n${att.textContent}\n\`\`\`\n</file>`)
    } else if (isImageMime(att.mimeType)) {
      imageAttachments.push(att)
    }
    // 非文本非图片的二进制文件：仍作为 attachment 发送
    if (!att.textContent && !isImageMime(att.mimeType)) {
      imageAttachments.push(att)
    }
  }

  const inlinedText = textParts.length > 0
    ? `${textParts.join('\n\n')}\n\n${text}`
    : text

  return { message: inlinedText, imageAttachments }
}
