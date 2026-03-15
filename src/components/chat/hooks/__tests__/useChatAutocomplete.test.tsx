import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatAutocomplete } from '@/components/chat/hooks/useChatAutocomplete'

const agents = [
  { id: 'claude', name: 'claude', displayName: 'Claude Code CLI', description: 'desc' },
]
const caps = { claude: [{ id: 'analysis', name: 'Code Analysis', description: 'Deep', category: 'Analysis' }] }

describe('useChatAutocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls searchFiles when @ and query provided, listFiles when empty', async () => {
    const searchFiles = vi.fn().mockResolvedValue(undefined)
    const listFiles = vi.fn().mockResolvedValue(undefined)
    let options: any[] = []
    let show = false
    let index = -1
    const { result } = renderHook(() =>
      useChatAutocomplete({
        enabledAgents: { claude: true },
        agents,
        agentCapabilities: caps,
        fileMentionsEnabled: true,
        projectPath: '/p',
        files: [],
        subAgents: {} as any,
        listFiles,
        searchFiles,
        codeExtensions: ['ts'],
        setOptions: (o) => (options = o),
        setSelectedIndex: (i) => (index = i),
        setShow: (s) => (show = s),
      })
    )
    await act(async () => {
      void result.current.updateAutocomplete('@hel', 3)
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })
    expect(searchFiles).toHaveBeenCalled()
    await act(async () => {
      void result.current.updateAutocomplete('@', 1)
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })
    expect(listFiles).toHaveBeenCalled()
  })

  it('debounces rapid @query updates so only the latest file search runs', async () => {
    const searchFiles = vi.fn().mockResolvedValue(undefined)
    const listFiles = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useChatAutocomplete({
        enabledAgents: { claude: true },
        agents,
        agentCapabilities: caps,
        fileMentionsEnabled: true,
        projectPath: '/p',
        files: [],
        subAgents: {} as any,
        listFiles,
        searchFiles,
        codeExtensions: ['ts'],
        setOptions: vi.fn(),
        setSelectedIndex: vi.fn(),
        setShow: vi.fn(),
      })
    )

    await act(async () => {
      void result.current.updateAutocomplete('@a', 2)
      void result.current.updateAutocomplete('@ab', 3)
      void result.current.updateAutocomplete('@abc', 4)
    })

    expect(searchFiles).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(149)
    })
    expect(searchFiles).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })

    expect(searchFiles).toHaveBeenCalledTimes(1)
    expect(searchFiles).toHaveBeenCalledWith('abc', {
      directory_path: '/p',
      extensions: ['ts'],
      max_depth: 3,
    })
  })

  it('deduplicates unchanged autocomplete tokens so cursor updates do not rescan files', async () => {
    const searchFiles = vi.fn().mockResolvedValue(undefined)
    const listFiles = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useChatAutocomplete({
        enabledAgents: { claude: true },
        agents,
        agentCapabilities: caps,
        fileMentionsEnabled: true,
        projectPath: '/p',
        files: [],
        subAgents: {} as any,
        listFiles,
        searchFiles,
        codeExtensions: ['ts'],
        setOptions: vi.fn(),
        setSelectedIndex: vi.fn(),
        setShow: vi.fn(),
      })
    )

    await act(async () => {
      void result.current.updateAutocomplete('@same', 5)
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })
    expect(searchFiles).toHaveBeenCalledTimes(1)

    await act(async () => {
      void result.current.updateAutocomplete('@same', 5)
      vi.advanceTimersByTime(150)
      await Promise.resolve()
    })

    expect(searchFiles).toHaveBeenCalledTimes(1)
  })

  it('cancels pending file lookups when autocomplete context is cleared', async () => {
    const searchFiles = vi.fn().mockResolvedValue(undefined)
    const listFiles = vi.fn().mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useChatAutocomplete({
        enabledAgents: { claude: true },
        agents,
        agentCapabilities: caps,
        fileMentionsEnabled: true,
        projectPath: '/p',
        files: [],
        subAgents: {} as any,
        listFiles,
        searchFiles,
        codeExtensions: ['ts'],
        setOptions: vi.fn(),
        setSelectedIndex: vi.fn(),
        setShow: vi.fn(),
      })
    )

    await act(async () => {
      void result.current.updateAutocomplete('@abc', 4)
      void result.current.updateAutocomplete('plain text', 10)
      vi.advanceTimersByTime(200)
      await Promise.resolve()
    })

    expect(searchFiles).not.toHaveBeenCalled()
    expect(listFiles).not.toHaveBeenCalled()
  })
})
