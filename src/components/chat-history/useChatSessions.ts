import { useState, useEffect, useCallback, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface ChatSessionInfo {
  id: string
  start_time: number
  end_time: number
  agent: string
  branch: string | null
  message_count: number
  summary: string
  archived: boolean
  custom_title: string | null
  ai_summary: string | null
  forked_from: string | null
  source: 'local' | 'indexed'
  source_file: string | null
  model: string | null
}

export interface SessionMessage {
  id: string
  role: string
  content: string
  timestamp: number
  agent: string
  metadata?: Record<string, unknown>
}

export function useChatSessions(projectPath: string | null) {
  const [allSessions, setAllSessions] = useState<ChatSessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const projectPathRef = useRef(projectPath)
  projectPathRef.current = projectPath

  const refresh = useCallback(async () => {
    if (!projectPathRef.current) {
      setAllSessions([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const sessions = await invoke<ChatSessionInfo[]>('load_unified_chat_sessions', {
        projectPath: projectPathRef.current,
        limit: null,
        agent: null,
        includeArchived: showArchived,
        includeIndexed: true,
      })
      setAllSessions(sessions)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setAllSessions([])
    } finally {
      setLoading(false)
    }
  }, [showArchived])

  useEffect(() => { refresh() }, [refresh, projectPath])

  // Client-side search filter
  const sessions = searchQuery.trim()
    ? allSessions.filter(s => {
        const q = searchQuery.toLowerCase()
        const title = (s.custom_title || s.ai_summary || s.summary || '').toLowerCase()
        return title.includes(q) || (s.agent || '').toLowerCase().includes(q)
      })
    : allSessions

  const search = useCallback((query: string) => setSearchQuery(query), [])

  const archive = useCallback(async (id: string) => {
    setError(null)
    try {
      await invoke('archive_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const unarchive = useCallback(async (id: string) => {
    setError(null)
    try {
      await invoke('unarchive_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const fork = useCallback(async (id: string): Promise<string> => {
    setError(null)
    try {
      const newId = await invoke<string>('fork_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
      return newId
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    }
  }, [refresh])

  const rename = useCallback(async (id: string, title: string) => {
    setError(null)
    try {
      await invoke('rename_chat_session', { projectPath: projectPathRef.current, sessionId: id, title })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const compact = useCallback(async (id: string) => {
    setError(null)
    try {
      const messages = await invoke<SessionMessage[]>('get_session_messages', { projectPath: projectPathRef.current, sessionId: id })
      const userMsgs = messages.filter(m => m.role === 'user')
      const first = userMsgs[0]?.content?.slice(0, 80) || 'Empty session'
      const summary = `${first} (${messages.length} messages)`
      await invoke('update_session_summary', { projectPath: projectPathRef.current, sessionId: id, summary })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const summarizeWithAI = useCallback(async (id: string): Promise<string> => {
    setError(null)
    try {
      await compact(id)
      return 'Summary updated locally'
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    }
  }, [compact])

  const deleteSession = useCallback(async (id: string) => {
    setError(null)
    try {
      await invoke('delete_chat_session', { projectPath: projectPathRef.current, sessionId: id })
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [refresh])

  const loadSession = useCallback(async (id: string): Promise<SessionMessage[]> => {
    setError(null)
    try {
      // Check if this is an indexed session
      const session = allSessions.find(s => s.id === id)
      if (session?.source === 'indexed' && session.source_file) {
        return await invoke<SessionMessage[]>('load_indexed_session_messages', {
          agentId: session.agent,
          sourceFile: session.source_file,
        })
      }
      return await invoke<SessionMessage[]>('get_session_messages', { projectPath: projectPathRef.current, sessionId: id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      throw e
    }
  }, [allSessions])

  const createNew = useCallback(async (): Promise<string> => {
    return crypto.randomUUID()
  }, [])

  const isReadOnly = useCallback((id: string): boolean => {
    const session = allSessions.find(s => s.id === id)
    return session?.source === 'indexed'
  }, [allSessions])

  return {
    sessions,
    loading,
    error,
    search,
    searchQuery,
    createNew,
    loadSession,
    archive,
    unarchive,
    fork,
    compact,
    summarizeWithAI,
    rename,
    deleteSession,
    showArchived,
    setShowArchived,
    refresh,
    isReadOnly,
  }
}
