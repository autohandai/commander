import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PermissionRequest } from './hooks/useAutohandSession'

interface PermissionDialogProps {
  request: PermissionRequest | null
  isOpen: boolean
  onApprove: () => void
  onDeny: () => void
}

export function PermissionDialog({ request, isOpen, onApprove, onDeny }: PermissionDialogProps) {
  if (!request) return null

  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {request.is_destructive ? 'Destructive Action' : 'Permission Required'}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                <span className="font-medium">Tool:</span>{' '}
                <code className="rounded bg-muted px-1 py-0.5 text-sm">{request.tool_name}</code>
              </p>
              <p>{request.description}</p>
              {request.file_path && (
                <p>
                  <span className="font-medium">File:</span>{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-sm">{request.file_path}</code>
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDeny}>Deny</AlertDialogCancel>
          <AlertDialogAction onClick={onApprove}>Allow</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
