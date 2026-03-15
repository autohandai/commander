import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useChatSessions } from '../useChatSessions'

const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: any[]) => mockInvoke(...args) }))

const mockSessions = [
  { id: 's1', start_time: 1000, end_time: 2000, agent: 'claude', branch: 'main', message_count: 5, summary: 'First chat', archived: false, custom_title: null, ai_summary: null, forked_from: null, source: 'local' as const, source_file: null, model: null },
  { id: 's2', start_time: 3000, end_time: 4000, agent: 'codex', branch: 'dev', message_count: 3, summary: 'Second chat', archived: false, custom_title: null, ai_summary: null, forked_from: null, source: 'local' as const, source_file: null, model: null },
  { id: 's3', start_time: 500, end_time: 600, agent: 'claude', branch: 'main', message_count: 2, summary: 'Archived chat', archived: true, custom_title: null, ai_summary: null, forked_from: null, source: 'local' as const, source_file: null, model: null },
]

describe('useChatSessions', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      switch (cmd) {
        case 'load_unified_chat_sessions': return args?.includeArchived ? mockSessions : mockSessions.filter(s => !s.archived)
        case 'load_chat_sessions': return args?.includeArchived ? mockSessions : mockSessions.filter(s => !s.archived)
        case 'get_session_messages': return [{ id: 'm1', role: 'user', content: 'hello', timestamp: 1000, agent: 'claude' }]
        case 'load_indexed_session_messages': return [{ id: 'idx-m1', role: 'user', content: 'indexed hello', timestamp: 2000, agent: args?.agentId || 'claude' }]
        case 'archive_chat_session': return null
        case 'unarchive_chat_session': return null
        case 'fork_chat_session': return 'new-fork-id'
        case 'delete_chat_session': return null
        case 'rename_chat_session': return null
        case 'update_session_summary': return null
        default: return null
      }
    })
  })

  it('loads non-archived sessions on mount', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toHaveLength(2)
    expect(result.current.sessions.every((s: any) => !s.archived)).toBe(true)
  })

  it('includes archived sessions when showArchived is true', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.setShowArchived(true) })
    await waitFor(() => expect(result.current.sessions).toHaveLength(3))
  })

  it('filters sessions by search query', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.search('First') })
    expect(result.current.sessions).toHaveLength(1)
    expect(result.current.sessions[0].id).toBe('s1')
  })

  it('archives a session and refreshes', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await result.current.archive('s1') })
    expect(mockInvoke).toHaveBeenCalledWith('archive_chat_session', { projectPath: '/projects/test', sessionId: 's1' })
  })

  it('forks a session and returns new ID', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let newId = ''
    await act(async () => { newId = await result.current.fork('s1') })
    expect(newId).toBe('new-fork-id')
    expect(mockInvoke).toHaveBeenCalledWith('fork_chat_session', { projectPath: '/projects/test', sessionId: 's1' })
  })

  it('loads session messages', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let messages: any[] = []
    await act(async () => { messages = await result.current.loadSession('s1') })
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('hello')
  })

  it('sets error on backend failure', async () => {
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_unified_chat_sessions') throw new Error('disk full')
      return null
    })
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toContain('disk full')
  })

  it('returns empty sessions when projectPath is null', async () => {
    const { result } = renderHook(() => useChatSessions(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.sessions).toHaveLength(0)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('creates a new session ID', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let newId = ''
    await act(async () => { newId = await result.current.createNew() })
    expect(newId).toBeTruthy()
    expect(typeof newId).toBe('string')
  })

  it('isReadOnly returns true for indexed sessions', async () => {
    const indexedSessions = [
      ...mockSessions,
      { id: 'idx-claude-ext1', start_time: 5000, end_time: 6000, agent: 'claude', branch: null, message_count: 10, summary: 'Indexed session', archived: false, custom_title: null, ai_summary: null, forked_from: null, source: 'indexed' as const, source_file: '/home/.claude/test.jsonl', model: 'opus' },
    ]
    mockInvoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'load_unified_chat_sessions') return indexedSessions
      return null
    })
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.isReadOnly('idx-claude-ext1')).toBe(true)
    expect(result.current.isReadOnly('s1')).toBe(false)
  })

  it('loads indexed session via load_indexed_session_messages', async () => {
    const indexedSessions = [
      { id: 'idx-claude-ext1', start_time: 5000, end_time: 6000, agent: 'claude', branch: null, message_count: 10, summary: 'Indexed', archived: false, custom_title: null, ai_summary: null, forked_from: null, source: 'indexed' as const, source_file: '/home/.claude/test.jsonl', model: 'opus' },
    ]
    mockInvoke.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === 'load_unified_chat_sessions') return indexedSessions
      if (cmd === 'load_indexed_session_messages') return [{ id: 'idx-m1', role: 'user', content: 'indexed msg', timestamp: 5000, agent: 'claude' }]
      return null
    })
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    let messages: any[] = []
    await act(async () => { messages = await result.current.loadSession('idx-claude-ext1') })
    expect(messages).toHaveLength(1)
    expect(messages[0].content).toBe('indexed msg')
    expect(mockInvoke).toHaveBeenCalledWith('load_indexed_session_messages', { agentId: 'claude', sourceFile: '/home/.claude/test.jsonl' })
  })

  it('calls load_unified_chat_sessions with includeIndexed', async () => {
    const { result } = renderHook(() => useChatSessions('/projects/test'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(mockInvoke).toHaveBeenCalledWith('load_unified_chat_sessions', expect.objectContaining({ includeIndexed: true }))
  })
})
