import { useState, useEffect, useCallback } from "react"
import { Check, X, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

const MESSAGE_TRUNCATE_LENGTH = 120

interface ToastProps {
  id: string
  title?: string
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  onRemove: (id: string) => void
  actionLabel?: string
  onAction?: () => void
}

export function Toast({
  id,
  title,
  message,
  type = 'info',
  duration = 5000,
  onRemove,
  actionLabel,
  onAction,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [showDetail, setShowDetail] = useState(false)
  const isTruncated = message.length > MESSAGE_TRUNCATE_LENGTH

  useEffect(() => {
    if (showDetail) return // don't auto-dismiss while reading detail
    if (duration != null && duration <= 0) return // persistent toast — user must close manually
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => onRemove(id), 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [id, duration, onRemove, showDetail])

  const handleClose = useCallback(() => {
    setIsVisible(false)
    setTimeout(() => onRemove(id), 300)
  }, [id, onRemove])

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <Check className="h-4 w-4 text-green-600" />
      case 'error':
        return <X className="h-4 w-4 text-red-600" />
      case 'warning':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />
      case 'info':
      default:
        return <Info className="h-4 w-4 text-blue-600" />
    }
  }

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'border-green-200 bg-green-50'
      case 'error':
        return 'border-red-200 bg-red-50'
      case 'warning':
        return 'border-yellow-200 bg-yellow-50'
      case 'info':
      default:
        return 'border-blue-200 bg-blue-50'
    }
  }

  const displayMessage = isTruncated && !showDetail
    ? message.slice(0, MESSAGE_TRUNCATE_LENGTH) + '...'
    : message

  return (
    <>
      <div
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border shadow-lg transition-all duration-300 ease-in-out",
          getStyles(),
          isVisible
            ? "translate-x-0 opacity-100 scale-100"
            : "translate-x-full opacity-0 scale-95"
        )}
      >
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>

        <div className="flex-1 min-w-0">
          {title && (
            <p className="text-sm font-medium text-gray-900 mb-1">{title}</p>
          )}
          <p className="text-sm text-gray-700">{displayMessage}</p>
          {isTruncated && !showDetail && (
            <button
              onClick={() => setShowDetail(true)}
              className="mt-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              Read more
            </button>
          )}
        </div>
        {actionLabel && (
          <button
            onClick={() => { onAction?.(); handleClose(); }}
            className="flex-shrink-0 ml-2 px-2 py-1 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 transition-colors"
          >
            {actionLabel}
          </button>
        )}

        <button
          onClick={handleClose}
          className="flex-shrink-0 ml-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          <X className="h-3 w-3 text-gray-400" />
        </button>
      </div>

      {/* Detail modal */}
      {showDetail && (
        <ErrorDetailModal
          title={title}
          message={message}
          type={type}
          onClose={() => { setShowDetail(false); handleClose(); }}
        />
      )}
    </>
  )
}

function ErrorDetailModal({
  title,
  message,
  type,
  onClose,
}: {
  title?: string
  message: string
  type: string
  onClose: () => void
}) {
  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const getHeaderColor = () => {
    switch (type) {
      case 'error': return 'text-red-700'
      case 'warning': return 'text-yellow-700'
      case 'success': return 'text-green-700'
      default: return 'text-blue-700'
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className={cn("text-sm font-semibold", getHeaderColor())}>
            {title || 'Error Details'}
          </h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
        <ScrollArea className="max-h-[60vh]">
          <div className="p-4">
            <pre className="whitespace-pre-wrap break-words text-sm text-foreground font-mono leading-relaxed">
              {message}
            </pre>
          </div>
        </ScrollArea>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(message)
              } catch { /* ignore */ }
            }}
            className="mr-2 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Copy
          </button>
          <button
            onClick={onClose}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
