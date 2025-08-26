import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface RecentProject {
  name: string
  path: string
  last_accessed: number
  is_git_repo: boolean
  git_branch: string | null
  git_status: string | null
}

export function useRecentProjects() {
  const [projects, setProjects] = useState<RecentProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const projectsData = await invoke<RecentProject[]>('list_recent_projects')
      setProjects(projectsData)
    } catch (err) {
      console.error('Failed to load recent projects:', err)
      setError(err instanceof Error ? err.message : 'Failed to load projects')
      setProjects([])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshProjects = useCallback(async () => {
    try {
      setError(null)
      const projectsData = await invoke<RecentProject[]>('refresh_recent_projects')
      setProjects(projectsData)
    } catch (err) {
      console.error('Failed to refresh recent projects:', err)
      setError(err instanceof Error ? err.message : 'Failed to refresh projects')
    }
  }, [])

  const addProjectToRecent = useCallback(async (projectPath: string) => {
    try {
      await invoke('add_project_to_recent', { project_path: projectPath })
      // Refresh the projects list to reflect the change
      await refreshProjects()
    } catch (err) {
      console.error('Failed to add project to recent:', err)
      setError(err instanceof Error ? err.message : 'Failed to add project to recent')
    }
  }, [refreshProjects])

  // Load projects on mount
  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  return {
    projects,
    loading,
    error,
    refreshProjects,
    addProjectToRecent,
    reload: loadProjects
  }
}