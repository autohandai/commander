import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { GitBranch, FolderTree, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RecentProject } from '@/hooks/use-recent-projects'

interface WorkspaceEntry {
  name: string
  path: string
  branch?: string
}

interface HistoryControlsProps {
  project: RecentProject
  onRefresh: () => void
  selectedBranch?: string
  selectedWorkspace?: string
  onBranchChange?: (branch: string) => void
  onWorkspaceChange?: (workspacePath: string) => void
}

export function HistoryControls({
  project,
  onRefresh,
  selectedBranch,
  selectedWorkspace,
  onBranchChange,
  onWorkspaceChange
}: HistoryControlsProps) {
  const [branches, setBranches] = useState<string[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadBranchesAndWorkspaces()
  }, [project.path])

  const loadBranchesAndWorkspaces = async () => {
    setLoading(true)
    try {
      // Load git branches
      const branchList = await invoke<string[]>('get_git_branches', {
        projectPath: project.path
      }).catch(() => [])
      setBranches(branchList)

      // Load git worktrees/workspaces
      const worktreeList = await invoke<Array<Record<string, string>>>('get_git_worktrees')
        .catch(() => [])
      
      const workspaceEntries: WorkspaceEntry[] = worktreeList
        .filter((wt: any) => wt.path?.startsWith(project.path))
        .map((wt: any) => ({
          name: wt.path?.split('/').pop() || 'workspace',
          path: wt.path,
          branch: wt.branch
        }))

      // Add main project as first workspace
      workspaceEntries.unshift({
        name: 'main',
        path: project.path,
        branch: 'main'
      })

      setWorkspaces(workspaceEntries)
    } catch (error) {
      console.error('Failed to load branches and workspaces:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = () => {
    loadBranchesAndWorkspaces()
    onRefresh()
  }

  const handleBranchSelect = (value: string) => {
    onBranchChange && onBranchChange(value)
    // Auto-refresh history when branch changes
    onRefresh()
  }

  const handleWorkspaceSelect = (value: string) => {
    onWorkspaceChange && onWorkspaceChange(value)
    // Auto-refresh history/diff when workspace changes
    onRefresh()
  }

  return (
    <Card className="absolute top-4 left-1/2 -translate-x-1/2 z-10 shadow-lg border bg-background/95 backdrop-blur-sm">
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* Branch Selector */}
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedBranch || ''}
              onValueChange={handleBranchSelect}
              disabled={loading}
            >
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map(branch => (
                  <SelectItem key={branch} value={branch}>
                    <div className="flex items-center gap-2">
                      <span>{branch}</span>
                      {branch === 'main' && (
                        <Badge variant="outline" className="text-[10px] px-1">
                          main
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Workspace Selector */}
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedWorkspace || ''}
              onValueChange={handleWorkspaceSelect}
              disabled={loading}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Workspace" />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map(workspace => (
                  <SelectItem key={workspace.path} value={workspace.path}>
                    <div className="flex items-center gap-2">
                      <span>{workspace.name}</span>
                      {workspace.branch && workspace.branch !== 'main' && (
                        <Badge variant="outline" className="text-[10px] px-1">
                          {workspace.branch}
                        </Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-2"
          >
            <RotateCcw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Status Info */}
        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span>Project:</span>
            <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
              {project.name}
            </code>
          </div>
          {selectedWorkspace && selectedWorkspace !== project.path && (
            <div className="flex items-center gap-1">
              <span>Workspace:</span>
              <code className="bg-muted px-1 py-0.5 rounded text-[10px]">
                {workspaces.find(w => w.path === selectedWorkspace)?.name}
              </code>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
