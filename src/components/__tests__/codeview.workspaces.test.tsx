import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CodeView } from '@/components/CodeView'
import { SettingsProvider } from '@/contexts/settings-context'

const fakeInvoke = async (cmd: string) => {
  if (cmd === 'get_git_worktrees') {
    return [
      { path: '/p/.commander/ws1', branch: 'workspace/ws1' },
      { path: '/p/.commander/feat', branch: 'workspace/feat' },
    ]
  }
  if (cmd === 'read_file_content') return ''
  return null
}

const project = { name: 'p', path: '/p', last_accessed: 0, is_git_repo: true, git_branch: 'main', git_status: 'clean' }

if (typeof document !== 'undefined') describe('CodeView workspaces', () => {
  it('lists workspaces and allows selection', async () => {
    render(
      <SettingsProvider>
        <CodeView project={project as any} tauriInvoke={fakeInvoke as any} />
      </SettingsProvider>
    )
    expect(screen.queryByText('View')).not.toBeInTheDocument()
    expect(screen.queryByText(/workspace view/i)).not.toBeInTheDocument()
    // Switch to workspace view automatically (since mocked list is non-empty)
    await waitFor(() => expect(screen.getByText('Workspace')).toBeInTheDocument())
    // Open workspace select
    fireEvent.mouseDown(screen.getByRole('combobox'))
    await waitFor(() => {
      expect(screen.getByText('ws1')).toBeInTheDocument()
      expect(screen.getByText('feat')).toBeInTheDocument()
    })
  })
})
