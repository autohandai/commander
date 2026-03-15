import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RecentProject } from '@/hooks/use-recent-projects'
import { assignLanes, enhanceWithConnections, type DagRow } from '@/lib/commit-graph'
import { GitGraph } from '@/components/GitGraph'
import { DiffViewer } from '@/components/DiffViewer'
import { HistoryControls } from '@/components/HistoryControls'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

interface Props { 
  project: RecentProject 
}

export function HistoryView({ project }: Props) {
  const [commits, setCommits] = useState<DagRow[]>([])
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<string>('main')
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>(project.path)
  const [loading, setLoading] = useState(true)
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffMode, setDiffMode] = useState<'commit' | 'workspace'>('commit')

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
    if (selectedCommit === commitHash) {
      setSelectedCommit(null)
      setDiffOpen(false)
      return
    }
    setSelectedCommit(commitHash)
    setDiffMode('commit')
    setDiffOpen(true)
  }

  const handleRefresh = () => {
    loadCommitHistory()
  }

  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch)
    // Do not clear selectedCommit; keep current diff visible if open
  }

  const handleWorkspaceChange = (workspacePath: string) => {
    setSelectedWorkspace(workspacePath)
    // Do not clear selectedCommit; keep current diff visible if open
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
    

      {/* Git Graph (full width) */}
      <div className="flex-1 min-w-0 bg-muted/10 overflow-hidden h-full">
        <div className="h-full flex flex-col">
          <div className="p-3 border-b bg-background flex items-center justify-between gap-2">
            <div>
              <div className="font-medium text-sm">Git History</div>
              <div className="text-xs text-muted-foreground">
                {enhancedCommits.length} commits • {maxLanes} {maxLanes === 1 ? 'branch' : 'branches'}
              </div>
            </div>
            <div className="flex items-center gap-2" />
          </div>
          
          <ScrollArea className="flex-1">
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
          </ScrollArea>
        </div>
      </div>

      {/* Diff Viewer Modal */}
      <Dialog open={diffOpen} onOpenChange={(open) => { if (!open) { setSelectedCommit(null); setDiffOpen(false) } }}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>{diffMode === 'commit' ? 'Commit Diff' : 'Workspace vs Main'}</DialogTitle>
          </DialogHeader>
          {/* Floating Controls (inside dialog to tweak target) */}
          <HistoryControls
            project={project}
            onRefresh={handleRefresh}
            selectedBranch={selectedBranch}
            selectedWorkspace={selectedWorkspace}
            onBranchChange={handleBranchChange}
            onWorkspaceChange={handleWorkspaceChange}
          />
          <ScrollArea className="h-[calc(100%-3rem)]">
            {diffMode === 'commit' ? (
              <DiffViewer
                projectPath={selectedWorkspace || project.path}
                commitHash={selectedCommit}
                compareMode="commit"
              />
            ) : selectedWorkspace && selectedWorkspace !== project.path ? (
              <DiffViewer
                projectPath={project.path}
                commitHash={null}
                compareMode="workspace"
                workspacePath={selectedWorkspace}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Select a workspace in the controls to compare with main.
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

    </div>
  )
}
