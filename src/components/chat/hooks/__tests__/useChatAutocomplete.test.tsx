import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatAutocomplete } from '@/components/chat/hooks/useChatAutocomplete'

const agents = [
  { id: 'claude', name: 'claude', displayName: 'Claude Code CLI', description: 'desc' },
]
const caps = { claude: [{ id: 'analysis', name: 'Code Analysis', description: 'Deep', category: 'Analysis' }] }

describe('useChatAutocomplete', () => {
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
    await act(() => result.current.updateAutocomplete('@hel', 3))
    expect(searchFiles).toHaveBeenCalled()
    await act(() => result.current.updateAutocomplete('@', 1))
    expect(listFiles).toHaveBeenCalled()
  })
})
