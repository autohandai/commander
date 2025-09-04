import { useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function useWorkingDir(projectPath?: string, workspaceEnabled: boolean = true) {
  return useCallback(async (): Promise<string> => {
    if (!projectPath) return ''
    if (!workspaceEnabled) return projectPath
    try {
      const list = await invoke<Array<Record<string, string>>>('get_git_worktrees')
      const ws = list.find((w) => (w.path || '').startsWith(projectPath + '/.commander')) as any
      const resolvedPath = ws && ws.path ? ws.path : projectPath
      return resolvedPath
    } catch {
      return projectPath
    }
  }, [projectPath, workspaceEnabled])
}

