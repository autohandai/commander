import { createContext, useContext, useState, useCallback } from "react"
import { Toast } from "@/components/ui/toast"

interface ToastData {
  id: string
  title?: string
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  actionLabel?: string
  onAction?: () => void
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastData, 'id'>) => void
  showSuccess: (message: string, title?: string) => void
  showError: (message: string, title?: string) => void
  showWarning: (message: string, title?: string) => void
  showInfo: (message: string, title?: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  const showToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    setToasts(prev => {
      // Deduplicate: skip if a toast with the same title and message already exists
      const isDuplicate = prev.some(
        existing => existing.title === toast.title && existing.message === toast.message
      )
      if (isDuplicate) return prev

      const id = Date.now().toString()
      const next = [...prev, { ...toast, id }]

      // Cap visible toasts at 2
      if (next.length > 2) {
        return next.slice(next.length - 2)
      }

      return next
    })
  }, [])

  const showSuccess = useCallback((message: string, title?: string) => {
    showToast({ message, title, type: 'success' })
  }, [showToast])

  const showError = useCallback((message: string, title?: string) => {
    showToast({ message, title, type: 'error' })
  }, [showToast])

  const showWarning = useCallback((message: string, title?: string) => {
    showToast({ message, title, type: 'warning' })
  }, [showToast])

  const showInfo = useCallback((message: string, title?: string) => {
    showToast({ message, title, type: 'info' })
  }, [showToast])

  const contextValue: ToastContextValue = {
    showToast,
    showSuccess,
    showError,
    showWarning,
    showInfo
  }

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {/* Toast Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            id={toast.id}
            title={toast.title}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            actionLabel={toast.actionLabel}
            onAction={toast.onAction}
            onRemove={removeToast}
          />
        ))}
      </div>
    </ToastContext.Provider>
  )
}
