import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { MessageSquare, User, Bot } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { RecentProject } from '@/hooks/use-recent-projects'

interface ChatMessage {
  role: string
  content: string
  timestamp: number
  agent?: string
}

interface ChatSession {
  start: number
  agent?: string
  summary: string
  messages: ChatMessage[]
}

interface ChatHistoryPanelProps {
  project: RecentProject
}

export function ChatHistoryPanel({ project }: ChatHistoryPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    loadChatHistory()
  }, [project.path])

  const loadChatHistory = async () => {
    setLoading(true)
    try {
      const messages = await invoke<ChatMessage[]>('load_project_chat', { 
        projectPath: project.path 
      })
      if (Array.isArray(messages)) {
        const groupedSessions = groupMessagesBySession(messages)
        setSessions(groupedSessions)
      }
    } catch (error) {
      console.error('Failed to load chat history:', error)
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  const groupMessagesBySession = (messages: ChatMessage[]): ChatSession[] => {
    if (messages.length === 0) return []
    
    const sessions: ChatSession[] = []
    let currentSession: ChatMessage[] = []
    let lastTimestamp = 0
    let lastAgent = ''

    for (const message of messages) {
      // Start new session if gap > 5 minutes or different agent
      const timeDiff = message.timestamp - lastTimestamp
      const shouldStartNewSession = timeDiff > 5 * 60 * 1000 || 
        (message.agent && message.agent !== lastAgent && currentSession.length > 0)

      if (shouldStartNewSession && currentSession.length > 0) {
        sessions.push({
          start: currentSession[0].timestamp,
          agent: lastAgent,
          summary: generateSessionSummary(currentSession),
          messages: [...currentSession]
        })
        currentSession = []
      }

      currentSession.push(message)
      lastTimestamp = message.timestamp
      lastAgent = message.agent || lastAgent
    }

    // Add final session
    if (currentSession.length > 0) {
      sessions.push({
        start: currentSession[0].timestamp,
        agent: lastAgent,
        summary: generateSessionSummary(currentSession),
        messages: [...currentSession]
      })
    }

    return sessions.reverse() // Show newest first
  }

  const generateSessionSummary = (messages: ChatMessage[]): string => {
    const userMessages = messages.filter(m => m.role === 'user')
    if (userMessages.length === 0) return 'Empty session'
    
    const firstUserMessage = userMessages[0].content
    return firstUserMessage.length > 80 
      ? firstUserMessage.substring(0, 80) + '...'
      : firstUserMessage
  }

  // Filter + sort sessions for display
  const displaySessions = sessions
    .filter(s => {
      if (!filter.trim()) return true
      const q = filter.toLowerCase()
      return (
        (s.summary || '').toLowerCase().includes(q) ||
        (s.agent || '').toLowerCase().includes(q)
      )
    })
    .sort((a, b) => (sortAsc ? a.start - b.start : b.start - a.start))

  if (loading) {
    return (
      <div className="w-full h-full border-l bg-muted/20 flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading chat history...</div>
      </div>
    )
  }

  return (
    <div className="w-full border-l bg-muted/20 flex flex-col h-full">
      {/* Header + Controls */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium text-sm">
            <MessageSquare className="h-4 w-4" />
            Chat History
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Filter sessions"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-8 w-44"
            />
            <Button
              variant="outline"
              size="sm"
              aria-label={sortAsc ? 'Newest first' : 'Oldest first'}
              onClick={() => setSortAsc(s => !s)}
            >
              {sortAsc ? 'Newest first' : 'Oldest first'}
            </Button>
            <Button variant="outline" size="sm" onClick={loadChatHistory}>Refresh</Button>
          </div>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          {displaySessions.length} session{displaySessions.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-hidden">
        {selectedSession ? (
          // Show messages for selected session
          <div className="h-full flex flex-col">
            <div className="p-2 border-b bg-background">
              <button
                onClick={() => setSelectedSession(null)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                ← Back to sessions
              </button>
              <div className="text-sm font-medium mt-1">
                {new Date(selectedSession.start).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                {selectedSession.agent} • {selectedSession.messages.length} messages
              </div>
            </div>
            <ScrollArea className="flex-1 p-2">
              <div className="space-y-3">
                {selectedSession.messages.map((message, idx) => (
                  <div key={idx} className="text-xs">
                    <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                      {message.role === 'user' ? (
                        <User className="h-3 w-3" />
                      ) : (
                        <Bot className="h-3 w-3" />
                      )}
                      <span>{message.role}</span>
                      <span>•</span>
                      <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-foreground whitespace-pre-wrap break-words">
                      {message.content.length > 200 
                        ? message.content.substring(0, 200) + '...'
                        : message.content
                      }
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          // Show sessions list
          <ScrollArea className="h-full p-2">
            {displaySessions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <div className="text-sm">No chat history yet</div>
                <div className="text-xs">Start a conversation to see it here</div>
              </div>
            ) : (
              <div className="space-y-2">
                {displaySessions.map((session, idx) => (
                  <Card key={idx} className="p-3 cursor-pointer hover:shadow-sm transition-shadow">
                    <button
                      onClick={() => setSelectedSession(session)}
                      className="w-full text-left"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-muted-foreground">
                          {new Date(session.start).toLocaleDateString()}
                        </div>
                        {session.agent && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {session.agent}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium">
                        {new Date(session.start).toLocaleTimeString()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {session.summary}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {session.messages.length} message{session.messages.length !== 1 ? 's' : ''}
                      </div>
                    </button>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
