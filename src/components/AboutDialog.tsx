import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import pkg from '../../package.json'

interface AboutDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const version = pkg.version

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>About Commander</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold">
              C
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold truncate">Autohand.ai – Commander</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">v{version}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Command any AI coding CLI agent from one screen. Orchestrate Claude, Codex, and Gemini workflows seamlessly.
              </p>
            </div>
          </div>

          <Separator />

          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">License</span>
              <span>Proprietary</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Homepage</span>
              <a href="https://autohand.ai" target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">autohand.ai</a>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

