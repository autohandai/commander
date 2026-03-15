import { MoreHorizontal, Archive, ArchiveRestore, GitFork, Pencil, Trash2, Minimize2, Sparkles } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface SessionActionMenuProps {
  sessionId: string
  archived?: boolean
  readOnly?: boolean
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onRename: (id: string) => void
  onFork: (id: string) => void
  onCompact: (id: string) => void
  onSummarizeAI: (id: string) => void
  onDelete: (id: string) => void
  trigger?: React.ReactNode
}

export function SessionActionMenu({
  sessionId, archived, readOnly, onArchive, onUnarchive, onRename, onFork, onCompact, onSummarizeAI, onDelete, trigger,
}: SessionActionMenuProps) {
  // Hide the entire menu for read-only (indexed) sessions
  if (readOnly) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onRename(sessionId)}>
          <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onFork(sessionId)}>
          <GitFork className="h-3.5 w-3.5 mr-2" /> Fork
        </DropdownMenuItem>
        {archived ? (
          <DropdownMenuItem onClick={() => onUnarchive(sessionId)}>
            <ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Unarchive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onArchive(sessionId)}>
            <Archive className="h-3.5 w-3.5 mr-2" /> Archive
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onCompact(sessionId)}>
          <Minimize2 className="h-3.5 w-3.5 mr-2" /> Compact
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSummarizeAI(sessionId)}>
          <Sparkles className="h-3.5 w-3.5 mr-2" /> Summarize with AI
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onDelete(sessionId)} className="text-destructive focus:text-destructive">
          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
