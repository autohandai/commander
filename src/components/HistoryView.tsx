import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Diff, GitCommit, MessageSquare } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { parseWorkspaceWorktrees, WorkspaceEntry } from '@/lib/workspaces'
import { useToast } from '@/components/ToastProvider'
import { RecentProject } from '@/hooks/use-recent-projects'
import { Badge } from '@/components/ui/badge'
import type { DagWithLane } from '@/lib/commit-graph'

interface Props { project: RecentProject }

export function HistoryView({ project }: Props) {
  // legacy list (unused, kept for potential fallback)
  // const [commits, setCommits] = useState<Array<Record<string,string>>>([])
  // reserved for future: show commit details
  // const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [diff, setDiff] = useState<Array<Record<string,string>>>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)
  const { showSuccess, showError } = useToast()

  // Commit graph + per-commit diffs
  const [dag, setDag] = useState<DagWithLane[]>([])
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitFiles, setCommitFiles] = useState<Array<Record<string,string>>>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileDiff, setFileDiff] = useState<string>('')

  useEffect(() => {
    // invoke<Array<Record<string,string>>>('get_git_log', { projectPath: project.path, limit: 50 })
    //   .then(setCommits)
    //   .catch(() => setCommits([]))
    invoke<Array<any>>('get_git_commit_dag', { projectPath: project.path, limit: 50 })
      .then(async rows => {
        const { assignLanes } = await import('@/lib/commit-graph')
        setDag(assignLanes(rows as any))
      })
      .catch(() => setDag([]))
  }, [project.path])

  useEffect(() => {
    invoke<Array<Record<string,string>>>('get_git_worktrees')
      .then(list => {
        const ws = parseWorkspaceWorktrees(list as any, project.path)
        setWorkspaces(ws)
        setWorkspacePath(ws[0]?.path || null)
      })
      .catch(() => { setWorkspaces([]); setWorkspacePath(null) })
  }, [project.path])

  return (
    <div className="flex h-full min-w-0">
      <div className="w-96 border-r bg-muted/20 h-full">
        <div className="p-3 font-medium text-sm flex items-center gap-2"><GitCommit className="h-4 w-4"/>Commits</div>
        <Separator />
        <ScrollArea className="h-[calc(100%-40px)] p-2 pr-1">
          <div className="space-y-1">
            {dag.map(row => (
              <button
                key={row.hash}
                onClick={async () => {
                  setSelectedCommit(row.hash)
                  setSelectedFile(null)
                  setFileDiff('')
                  const files = await invoke<Array<Record<string,string>>>('get_commit_diff_files', { projectPath: project.path, commitHash: row.hash })
                  setCommitFiles(files)
                }}
                className={`w-full text-left p-2 rounded transition-colors ${selectedCommit === row.hash ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
              >
                <div className="flex items-start gap-2">
                  <div className="w-10 flex justify-center">
                    <div className={`w-2 h-2 rounded-full mt-1`} style={{ backgroundColor: `hsl(${(row.lane*80)%360} 70% 50%)` }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      {row.subject}
                      {row.refs?.slice(0,2).map((ref, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{ref}</Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{row.author} • {row.date}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium flex items-center gap-2"><GitCommit className="h-4 w-4"/>Selected Commit</div>
        </div>
        <Card className="p-3 mb-4">
          {!selectedCommit ? (
            <div className="text-sm text-muted-foreground">Select a commit to view its changes.</div>
          ) : (
            <div className="flex gap-4">
              <div className="w-72 border-r pr-3">
                <div className="text-xs text-muted-foreground mb-2">Files</div>
                <div className="space-y-1">
                  {commitFiles.map((f, idx) => (
                    <button
                      key={idx}
                      className={`w-full text-left p-2 rounded text-sm ${selectedFile===f.path? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
                      onClick={async () => {
                        setSelectedFile(f.path)
                        const txt = await invoke<string>('get_commit_diff_text', { projectPath: project.path, commitHash: selectedCommit, filePath: f.path })
                        setFileDiff(txt)
                      }}
                    >
                      <span className="inline-block w-8 text-[10px] uppercase text-muted-foreground">{f.status}</span>
                      <span className="font-mono truncate">{f.path}</span>
                    </button>
                  ))}
                  {commitFiles.length===0 && (
                    <div className="text-xs text-muted-foreground">No files changed</div>
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground mb-2">Unified Diff</div>
                <pre className="text-xs bg-muted/20 rounded p-3 overflow-auto max-h-[50vh] whitespace-pre-wrap break-words">{fileDiff || 'Select a file to view diff'}</pre>
              </div>
            </div>
          )}
        </Card>
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium flex items-center gap-2"><Diff className="h-4 w-4"/>Workspace vs Main</div>
          <div className="flex items-center gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Workspace</Label>
              <Select value={workspacePath || ''} onValueChange={setWorkspacePath}>
                <SelectTrigger className="h-8 w-56">
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map(ws => (
                    <SelectItem key={ws.path} value={ws.path}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={async () => {
              if (!workspacePath) { setDiff([]); return }
              const d = await invoke<Array<Record<string,string>>>('diff_workspace_vs_main', { projectPath: project.path, worktreePath: workspacePath })
              setDiff(d)
            }}>Refresh Diff</Button>
            <Button size="sm" variant="outline" onClick={async () => {
              if (!workspacePath) return
              const ws = workspaces.find(w => w.path === workspacePath)
              const ok = confirm(`Merge workspace "${ws?.name || 'current'}" into main?`)
              if (!ok) return
              try {
                await invoke('merge_workspace_to_main', { projectPath: project.path, worktreePath: workspacePath, message: `Merge ${ws?.name || 'workspace'} into main` })
                showSuccess('Workspace merged into main')
                const d = await invoke<Array<Record<string,string>>>('diff_workspace_vs_main', { projectPath: project.path, worktreePath: workspacePath })
                setDiff(d)
              } catch (e) {
                showError('Failed to merge workspace')
              }
            }}>Merge to Main</Button>
          </div>
        </div>
        <Card className="p-3">
          {diff.length === 0 ? (
            <div className="text-sm text-muted-foreground">No differences or no workspace selected.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {diff.map((d, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-10 text-xs rounded px-2 py-0.5 bg-muted">{d.status}</span>
                  <span className="font-mono truncate">{d.path}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <div className="mt-4">
          <div className="font-medium flex items-center gap-2"><MessageSquare className="h-4 w-4"/>Chat History</div>
          <div className="text-sm text-muted-foreground">Project chat history will appear here when persisted.</div>
        </div>
      </div>
    </div>
  )
}
