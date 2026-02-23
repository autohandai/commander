import { useState, useCallback } from 'react'
import type { PermissionRequest } from './useAutohandSession'

interface UseAutohandPermissionParams {
  onRespond: (requestId: string, approved: boolean) => Promise<void>
}

export function useAutohandPermission({ onRespond }: UseAutohandPermissionParams) {
  const [pendingRequest, setPendingRequest] = useState<PermissionRequest | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const showPermissionDialog = useCallback((request: PermissionRequest) => {
    setPendingRequest(request)
    setIsOpen(true)
  }, [])

  const approve = useCallback(async () => {
    if (!pendingRequest) return
    await onRespond(pendingRequest.request_id, true)
    setIsOpen(false)
    setPendingRequest(null)
  }, [pendingRequest, onRespond])

  const deny = useCallback(async () => {
    if (!pendingRequest) return
    await onRespond(pendingRequest.request_id, false)
    setIsOpen(false)
    setPendingRequest(null)
  }, [pendingRequest, onRespond])

  return {
    pendingRequest,
    isOpen,
    showPermissionDialog,
    approve,
    deny,
  }
}
