import { useState, useEffect } from "react"
import { Check, X, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

interface ToastProps {
  id: string
  title?: string
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  onRemove: (id: string) => void
}

export function Toast({ 
  id, 
  title, 
  message, 
  type = 'info', 
  duration = 5000, 
  onRemove 
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => onRemove(id), 300) // Wait for animation to complete
    }, duration)

    return () => clearTimeout(timer)
  }, [id, duration, onRemove])

  const handleClose = () => {
    setIsVisible(false)
    setTimeout(() => onRemove(id), 300)
  }

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

  return (
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
        <p className="text-sm text-gray-700">{message}</p>
      </div>
      
      <button
        onClick={handleClose}
        className="flex-shrink-0 ml-2 p-1 rounded-md hover:bg-gray-100 transition-colors"
      >
        <X className="h-3 w-3 text-gray-400" />
      </button>
    </div>
  )
}