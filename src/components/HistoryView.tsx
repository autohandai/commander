import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RecentProject } from '@/hooks/use-recent-projects'
import { assignLanes, enhanceWithConnections, type DagRow } from '@/lib/commit-graph'
import { GitGraph } from '@/components/GitGraph'
import { DiffViewer } from '@/components/DiffViewer'
import { ChatHistoryPanel } from '@/components/ChatHistoryPanel'
import { HistoryControls } from '@/components/HistoryControls'

interface Props { 
  project: RecentProject 
}

export function HistoryView({ project }: Props) {
  const [commits, setCommits] = useState<DagRow[]>([])
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<string>('main')
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(project.path)
  const [loading, setLoading] = useState(true)

  // Enhanced commits with graph data
  const enhancedCommits = useMemo(() => {
    const withLanes = assignLanes(commits)
    return enhanceWithConnections(withLanes)
  }, [commits])

  const maxLanes = useMemo(() => {
    return Math.max(1, enhancedCommits.length ? Math.max(...enhancedCommits.map(c => c.lane)) + 1 : 1)
  }, [enhancedCommits])

  // Load git commit history
  useEffect(() => {
    loadCommitHistory()
  }, [project.path, selectedBranch, selectedWorkspace])

  const loadCommitHistory = async () => {
    setLoading(true)
    try {
      const commitRows = await invoke<DagRow[]>('get_git_commit_dag', { 
        projectPath: selectedWorkspace || project.path,
        limit: 50,
        branch: selectedBranch
      })
      setCommits(commitRows || [])
    } catch (error) {
      console.error('Failed to load commit history:', error)
      setCommits([])
    } finally {
      setLoading(false)
    }
  }

  const handleCommitSelect = (commitHash: string) => {
    setSelectedCommit(selectedCommit === commitHash ? null : commitHash)
  }

  const handleRefresh = () => {
    loadCommitHistory()
  }

  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch)
    setSelectedCommit(null) // Clear selection when changing branch
  }

  const handleWorkspaceChange = (workspacePath: string) => {
    setSelectedWorkspace(workspacePath)
    setSelectedCommit(null) // Clear selection when changing workspace
  }

  if (loading && commits.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium mb-2">Loading Git History</div>
          <div className="text-muted-foreground">Please wait...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full min-w-0">
      {/* Floating Controls */}
      <HistoryControls
        project={project}
        onRefresh={handleRefresh}
        selectedBranch={selectedBranch}
        selectedWorkspace={selectedWorkspace}
        onBranchChange={handleBranchChange}
        onWorkspaceChange={handleWorkspaceChange}
      />

      {/* Left: Git Graph */}
      <div className="flex-1 bg-muted/10 border-r overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="p-3 border-b bg-background">
            <div className="font-medium text-sm">Git History</div>
            <div className="text-xs text-muted-foreground">
              {enhancedCommits.length} commits • {maxLanes} {maxLanes === 1 ? 'branch' : 'branches'}
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            {enhancedCommits.length === 0 ? (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <div className="text-center">
                  <div className="text-sm mb-1">No commits found</div>
                  <div className="text-xs">Try selecting a different branch or workspace</div>
                </div>
              </div>
            ) : (
              <GitGraph
                commits={enhancedCommits}
                onCommitSelect={handleCommitSelect}
                selectedCommit={selectedCommit}
                maxLanes={maxLanes}
              />
            )}
          </div>
        </div>
      </div>

      {/* Center: Diff Viewer */}
      <div className="flex-1 min-w-0 p-4 overflow-auto">
        <DiffViewer
          projectPath={selectedWorkspace || project.path}
          commitHash={selectedCommit}
        />
      </div>

      {/* Right: Chat History */}
      <ChatHistoryPanel project={project} />
    </div>
  )
}