import { FileText, X } from 'lucide-react'
import type { ImageAttachment } from '../lib/imageUtils'
import { isImageMime } from '../lib/imageUtils'

interface ImagePreviewProps {
  images: ImageAttachment[]
  onRemove: (index: number) => void
}

/**
 * 待发送附件预览条。
 */
export function ImagePreview({ images, onRemove }: ImagePreviewProps) {
  if (images.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 border-b border-[var(--border-default)] px-3 py-3">
      {images.map((img, i) => (
        <div key={`${img.filename}-${i}`} className="group relative">
          {isImageMime(img.mimeType) ? (
            <img
              src={img.data}
              alt={img.filename ?? '图片'}
              className="h-16 w-16 rounded-[14px] border border-[var(--border-default)] object-cover shadow-[var(--shadow-soft)]"
            />
          ) : (
            <div className="flex h-16 w-16 flex-col items-center justify-center rounded-[14px] border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-card)_92%,transparent)]">
              <FileText className="h-6 w-6 text-[var(--text-faint)]" />
            </div>
          )}
          <button
            type="button"
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-card-strong)] text-[var(--text-subtle)] opacity-0 transition-opacity hover:bg-[var(--color-red-600)] hover:text-[var(--color-white)] group-hover:opacity-100"
            onClick={() => onRemove(i)}
          >
            <X className="h-3 w-3" />
          </button>
          {img.filename && (
            <div className="absolute bottom-0 left-0 right-0 truncate rounded-b-[14px] bg-overlay px-1.5 py-0.5 text-[10px] text-[var(--color-gray-200)]">
              {img.filename}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
