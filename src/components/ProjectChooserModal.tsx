import { Plus, FolderOpen, GitBranch } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

interface ProjectChooserModalProps {
  isOpen: boolean
  onClose: () => void
  onNewProject: () => void
  onOpenProject: () => void
  onCloneProject: () => void
}

export function ProjectChooserModal({
  isOpen,
  onClose,
  onNewProject,
  onOpenProject,
  onCloneProject,
}: ProjectChooserModalProps) {
  const handleChoice = (action: () => void) => {
    action()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Add a Project</DialogTitle>
          <DialogDescription>
            Choose how you'd like to get started
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={() => handleChoice(onNewProject)}
            className="group flex-1 flex flex-col items-center gap-3 px-4 py-5 rounded-xl border-2 border-border bg-muted/50 hover:border-muted-foreground/40 hover:bg-muted transition-all duration-200"
          >
            <div className="p-3 rounded-lg bg-muted group-hover:bg-accent transition-colors">
              <Plus className="h-6 w-6 text-foreground" />
            </div>
            <div className="space-y-1 text-center">
              <p className="font-semibold text-sm text-foreground">New Project</p>
              <p className="text-xs text-muted-foreground">Start from scratch</p>
            </div>
          </button>

          <button
            onClick={() => handleChoice(onOpenProject)}
            className="group flex-1 flex flex-col items-center gap-3 px-4 py-5 rounded-xl border-2 border-border bg-muted/50 hover:border-muted-foreground/40 hover:bg-muted transition-all duration-200"
          >
            <div className="p-3 rounded-lg bg-muted group-hover:bg-accent transition-colors">
              <FolderOpen className="h-6 w-6 text-foreground" />
            </div>
            <div className="space-y-1 text-center">
              <p className="font-semibold text-sm text-foreground">Open Project</p>
              <p className="text-xs text-muted-foreground">Open existing repo</p>
            </div>
          </button>

          <button
            onClick={() => handleChoice(onCloneProject)}
            className="group flex-1 flex flex-col items-center gap-3 px-4 py-5 rounded-xl border-2 border-border bg-muted/50 hover:border-muted-foreground/40 hover:bg-muted transition-all duration-200"
          >
            <div className="p-3 rounded-lg bg-muted group-hover:bg-accent transition-colors">
              <GitBranch className="h-6 w-6 text-foreground" />
            </div>
            <div className="space-y-1 text-center">
              <p className="font-semibold text-sm text-foreground">Clone</p>
              <p className="text-xs text-muted-foreground">Clone from remote</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
