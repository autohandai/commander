import { useRef, useState, useEffect } from 'react'
import { PlusCircle, Search, Database } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SessionActionMenu } from './SessionActionMenu'
import type { ChatSessionInfo } from './useChatSessions'

function relativeTime(unixSeconds: number): string {
  const now = Date.now() / 1000
  const diff = now - unixSeconds
  if (diff < 60) return '<1m'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 172800) return 'yesterday'
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(unixSeconds * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function sessionTitle(s: ChatSessionInfo): string {
  return s.custom_title || s.ai_summary || s.summary || 'Untitled'
}

interface ChatSessionPaletteProps {
  sessions: ChatSessionInfo[]
  loading: boolean
  searchQuery: string
  onSearch: (query: string) => void
  onSelect: (sessionId: string) => void
  onNewChat: () => void
  onClose: () => void
  onArchive: (id: string) => void
  onUnarchive: (id: string) => void
  onRename: (id: string) => void
  onFork: (id: string) => void
  onCompact: (id: string) => void
  onSummarizeAI: (id: string) => void
  onDelete: (id: string) => void
}

export function ChatSessionPalette({
  sessions, loading, searchQuery, onSearch, onSelect, onNewChat, onClose,
  onArchive, onUnarchive, onRename, onFork, onCompact, onSummarizeAI, onDelete,
}: ChatSessionPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const totalItems = 1 + sessions.length

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => { setSelectedIndex(0) }, [sessions.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex === 0) {
        onNewChat()
      } else {
        const session = sessions[selectedIndex - 1]
        if (session) onSelect(session.id)
      }
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="palette-backdrop"
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
      />
      {/* Palette */}
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/3 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover shadow-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search threads..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
          />
        </div>

        {/* Results list */}
        <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-activedescendant={`palette-item-${selectedIndex}`}>
          {/* New Chat option */}
          <button
            id="palette-item-0"
            role="option"
            aria-selected={selectedIndex === 0}
            className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${selectedIndex === 0 ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'}`}
            onClick={onNewChat}
          >
            <PlusCircle className="h-4 w-4" />
            New Chat
          </button>

          {/* Session rows */}
          {loading ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">Loading...</div>
          ) : sessions.length === 0 && searchQuery ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matching sessions</div>
          ) : (
            sessions.map((session, i) => {
              const itemIndex = i + 1
              const isSelected = selectedIndex === itemIndex
              return (
                <div
                  key={session.id}
                  id={`palette-item-${itemIndex}`}
                  role="option"
                  aria-selected={isSelected}
                  className={`group flex w-full items-center gap-2 px-3 py-2 text-sm cursor-pointer ${isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/50'} ${session.source === 'indexed' ? 'opacity-80' : ''}`}
                  onClick={() => onSelect(session.id)}
                >
                  {session.source === 'indexed' && (
                    <Database className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{sessionTitle(session)}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">{session.agent}</Badge>
                  {session.model && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 shrink-0">{session.model}</Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground shrink-0">{relativeTime(session.start_time)}</span>
                  <SessionActionMenu
                    sessionId={session.id}
                    archived={session.archived}
                    readOnly={session.source === 'indexed'}
                    onArchive={onArchive}
                    onUnarchive={onUnarchive}
                    onRename={onRename}
                    onFork={onFork}
                    onCompact={onCompact}
                    onSummarizeAI={onSummarizeAI}
                    onDelete={onDelete}
                  />
                </div>
              )
            })
          )}
        </div>

        {/* Footer hints */}
        <div className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono">&#8597;</kbd> navigate</span>
            <span><kbd className="font-mono">&#8629;</kbd> select</span>
          </div>
          <span><kbd className="font-mono">esc</kbd> close</span>
        </div>
      </div>
    </>
  )
}
