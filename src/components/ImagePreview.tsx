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
    <div className="flex flex-wrap gap-2 rounded-t-xl border border-b-0 border-gray-700 bg-gray-900/80 px-3 py-2">
      {images.map((img, i) => (
        <div key={`${img.filename}-${i}`} className="group relative">
          {isImageMime(img.mimeType) ? (
            <img
              src={img.data}
              alt={img.filename ?? '图片'}
              className="h-16 w-16 rounded-lg border border-gray-600 object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-gray-600 bg-gray-800">
              <FileText className="h-6 w-6 text-gray-400" />
            </div>
          )}
          <button
            type="button"
            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-gray-300 opacity-0 transition-opacity hover:bg-red-600 hover:text-white group-hover:opacity-100"
            onClick={() => onRemove(i)}
          >
            <X className="h-3 w-3" />
          </button>
          {img.filename && (
            <div className="absolute bottom-0 left-0 right-0 truncate rounded-b-lg bg-overlay px-1 text-[10px] text-gray-300">
              {img.filename}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
