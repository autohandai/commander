import { useState, useEffect, useCallback } from 'react'
import { listen } from '@tauri-apps/api/event'
import { useSettings } from '@/contexts/settings-context'
import { useChatSessions, type SessionMessage } from './useChatSessions'
import { ChatSessionPalette } from './ChatSessionPalette'
import { ChatSessionSidebar } from './ChatSessionSidebar'
import { ChatSessionStrip } from './ChatSessionStrip'

interface ChatHistoryManagerProps {
  projectPath: string | null
  onLoadSession: (messages: SessionMessage[], sessionId: string) => void
  onNewChat: () => void
  /** Notify parent when sidebar variant is open (for SidebarAutoCollapseManager) */
  onSidebarOverride?: (isOpen: boolean) => void
}

export function ChatHistoryManager({ projectPath, onLoadSession, onNewChat, onSidebarOverride }: ChatHistoryManagerProps) {
  const { settings } = useSettings()
  const style = settings.chat_history_style ?? 'palette'
  const [isOpen, setIsOpen] = useState(false)

  const hook = useChatSessions(projectPath)

  // Listen for Cmd+Shift+H shortcut
  useEffect(() => {
    const unlisten = listen('shortcut://toggle-chat-history', () => {
      setIsOpen(prev => !prev)
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Notify parent for sidebar override (sidebar mode only)
  useEffect(() => {
    if (style === 'sidebar') {
      onSidebarOverride?.(isOpen)
    } else {
      onSidebarOverride?.(false)
    }
  }, [isOpen, style, onSidebarOverride])

  const handleSelect = useCallback(async (sessionId: string) => {
    try {
      const messages = await hook.loadSession(sessionId)
      onLoadSession(messages, sessionId)
      setIsOpen(false)
    } catch {
      // Error handled by hook
    }
  }, [hook.loadSession, onLoadSession])

  const handleNewChat = useCallback(() => {
    onNewChat()
    setIsOpen(false)
  }, [onNewChat])

  const handleClose = useCallback(() => setIsOpen(false), [])

  const handleRename = useCallback((id: string) => {
    const title = window.prompt('Session title:')
    if (title) hook.rename(id, title)
  }, [hook.rename])

  // Palette mode (default)
  if (style === 'palette' && isOpen && projectPath) {
    return (
      <ChatSessionPalette
        sessions={hook.sessions}
        loading={hook.loading}
        searchQuery={hook.searchQuery}
        onSearch={hook.search}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
        onClose={handleClose}
        onArchive={hook.archive}
        onUnarchive={hook.unarchive}
        onRename={handleRename}
        onFork={hook.fork}
        onCompact={hook.compact}
        onSummarizeAI={hook.summarizeWithAI}
        onDelete={hook.deleteSession}
      />
    )
  }

  // Sidebar mode
  if (style === 'sidebar' && isOpen && projectPath) {
    return (
      <ChatSessionSidebar
        sessions={hook.sessions}
        loading={hook.loading}
        onSelect={handleSelect}
        onClose={handleClose}
        onArchive={hook.archive}
        onUnarchive={hook.unarchive}
        onRename={handleRename}
        onFork={hook.fork}
        onCompact={hook.compact}
        onSummarizeAI={hook.summarizeWithAI}
        onDelete={hook.deleteSession}
      />
    )
  }

  // Strip mode — always visible when project is open
  if (style === 'strip' && projectPath) {
    return (
      <ChatSessionStrip
        sessions={hook.sessions}
        onSelect={handleSelect}
        onNewChat={handleNewChat}
      />
    )
  }

  return null
}
