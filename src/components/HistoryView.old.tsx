import { useEffect, useMemo, useState } from 'react'
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
import { Highlight, themes } from 'prism-react-renderer'

interface Props { project: RecentProject }

export function HistoryView({ project }: Props) {
  const { showSuccess, showError } = useToast()
  const [dag, setDag] = useState<DagWithLane[]>([])
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([])
  const [workspacePath, setWorkspacePath] = useState<string | null>(null)

  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitFiles, setCommitFiles] = useState<Array<{status:string; path:string}>>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [leftCode, setLeftCode] = useState<string>('')
  const [rightCode, setRightCode] = useState<string>('')
  const [fileDiff, setFileDiff] = useState<string>('')

  const [wsDiff, setWsDiff] = useState<Array<{status:string; path:string}>>([])
  const [chat, setChat] = useState<Array<{ role:string; content:string; timestamp:number; agent?:string }>>([])

  useEffect(() => {
    invoke<Array<any>>('get_git_commit_dag', { projectPath: project.path, limit: 50 })
      .then(async rows => {
        const { assignLanes } = await import('@/lib/commit-graph')
        setDag(assignLanes(rows as any))
      })
      .catch(() => setDag([]))
    invoke<Array<Record<string,string>>>('get_git_worktrees')
      .then(list => {
        const ws = parseWorkspaceWorktrees(list as any, project.path)
        setWorkspaces(ws)
        setWorkspacePath(ws[0]?.path || null)
      })
      .catch(() => { setWorkspaces([]); setWorkspacePath(null) })
    invoke<Array<any>>('load_project_chat', { projectPath: project.path })
      .then(msgs => { if (Array.isArray(msgs)) setChat(msgs as any) })
      .catch(() => setChat([]))
  }, [project.path])

  const maxLanes = useMemo(() => Math.max(1, (dag.length ? Math.max(...dag.map(d => d.lane)) : 0) + 1), [dag])

  const languageFromFilename = (name: string): string | undefined => {
    const ext = name.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'ts': return 'ts'
      case 'tsx': return 'tsx'
      case 'js': return 'javascript'
      case 'jsx': return 'jsx'
      case 'json': return 'json'
      case 'md': case 'mdx': return 'markdown'
      case 'html': return 'markup'
      case 'css': return 'css'
      case 'scss': case 'sass': return 'scss'
      case 'py': return 'python'
      case 'rs': return 'rust'
      case 'go': return 'go'
      case 'yml': case 'yaml': return 'yaml'
      default: return undefined
    }
  }

  return (
    <div className="flex h-full min-w-0">
      {/* Left: Commit history with simple graph gutter */}
      <div className="w-96 border-r bg-muted/20 h-full">
        <div className="p-3 font-medium text-sm flex items-center gap-2"><GitCommit className="h-4 w-4"/>Commit History</div>
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
                  setLeftCode(''); setRightCode('')
                  const files = await invoke<Array<{status:string; path:string}>>('get_commit_diff_files', { projectPath: project.path, commitHash: row.hash })
                  setCommitFiles(files)
                }}
                className={`w-full text-left p-2 rounded transition-colors ${selectedCommit === row.hash ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'}`}
              >
                <div className="flex items-start gap-2">
                  <div className="w-10 flex">
                    {Array.from({length: maxLanes}).map((_, i) => (
                      <div key={i} className="flex-1 relative">
                        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-border" />
                        {i === row.lane && (
                          <div className="w-2 h-2 rounded-full mt-1 mx-auto" style={{ backgroundColor: `hsl(${(row.lane*80)%360} 70% 50%)` }} />
                        )}
                      </div>
                    ))}
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

      {/* Right: Diff and Chat */}
      <div className="flex-1 min-w-0 p-4 space-y-4">
        {/* Selected commit: files and side-by-side */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-medium flex items-center gap-2"><GitCommit className="h-4 w-4"/>Selected Commit</div>
          </div>
          <Card className="p-3">
            {!selectedCommit ? (
              <div className="text-sm text-muted-foreground">Select a commit to view its changes.</div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-1 border-r pr-3">
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
                          const row = dag.find(r => r.hash === selectedCommit)
                          const parent = row?.parents?.[0]
                          const [left, right] = await Promise.all([
                            parent ? invoke<string>('get_file_at_commit', { projectPath: project.path, commitHash: parent, filePath: f.path }) : Promise.resolve(''),
                            invoke<string>('get_file_at_commit', { projectPath: project.path, commitHash: selectedCommit, filePath: f.path })
                          ])
                          setLeftCode(left); setRightCode(right)
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
                <div className="col-span-2 min-w-0 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Parent</div>
                    <div className="border rounded bg-muted/10 overflow-auto max-h-[50vh]">
                      <Highlight theme={themes.github} code={leftCode} language={(languageFromFilename(selectedFile || '') || 'markup') as any}>
                        {({ className, style, tokens, getLineProps, getTokenProps }) => (
                          <pre className={`${className} text-xs p-3`} style={style}>
                            {tokens.map((line: any, i: number) => (
                              <div key={i} {...getLineProps({ line })}>
                                {line.map((token: any, key: number) => (
                                  <span key={key} {...getTokenProps({ token })} />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Commit</div>
                    <div className="border rounded bg-muted/10 overflow-auto max-h-[50vh]">
                      <Highlight theme={themes.github} code={rightCode} language={(languageFromFilename(selectedFile || '') || 'markup') as any}>
                        {({ className, style, tokens, getLineProps, getTokenProps }) => (
                          <pre className={`${className} text-xs p-3`} style={style}>
                            {tokens.map((line: any, i: number) => (
                              <div key={i} {...getLineProps({ line })}>
                                {line.map((token: any, key: number) => (
                                  <span key={key} {...getTokenProps({ token })} />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">Unified Diff</div>
                    <pre className="text-xs bg-muted/20 rounded p-3 overflow-auto max-h-[40vh] whitespace-pre-wrap break-words">{
                      (fileDiff || 'Select a file to view diff').split('\n').map((line, i) => {
                        const cls = line.startsWith('+') ? 'text-green-600 dark:text-green-400' : line.startsWith('-') ? 'text-red-600 dark:text-red-400' : ''
                        return <div key={i} className={cls}>{line}</div>
                      })
                    }</pre>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Workspace vs main diff + merge */}
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium flex items-center gap-2"><Diff className="h-4 w-4"/>Workspace vs Main</div>
          <div className="flex items-center gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Workspace</Label>
              <Select value={workspacePath || ''} onValueChange={setWorkspacePath}>
                <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Select workspace" /></SelectTrigger>
                <SelectContent>{workspaces.map(ws => (<SelectItem key={ws.path} value={ws.path}>{ws.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={async () => { if (!workspacePath) { setWsDiff([]); return } const d = await invoke<Array<{status:string; path:string}>>('diff_workspace_vs_main', { projectPath: project.path, worktreePath: workspacePath }); setWsDiff(d) }}>Refresh Diff</Button>
            <Button size="sm" variant="outline" onClick={async () => { if (!workspacePath) return; const ws = workspaces.find(w => w.path === workspacePath); const ok = confirm(`Merge workspace "${ws?.name || 'current'}" into main?`); if (!ok) return; try { await invoke('merge_workspace_to_main', { projectPath: project.path, worktreePath: workspacePath, message: `Merge ${ws?.name || 'workspace'} into main` }); showSuccess('Workspace merged into main'); const d = await invoke<Array<{status:string; path:string}>>('diff_workspace_vs_main', { projectPath: project.path, worktreePath: workspacePath }); setWsDiff(d) } catch { showError('Failed to merge workspace') } }}>Merge to Main</Button>
          </div>
        </div>
        <Card className="p-3">
          {wsDiff.length === 0 ? (<div className="text-sm text-muted-foreground">No differences or no workspace selected.</div>) : (
            <div className="space-y-1 text-sm">{wsDiff.map((d, i) => (<div key={i} className="flex items-center gap-3"><span className="w-10 text-xs rounded px-2 py-0.5 bg-muted">{d.status}</span><span className="font-mono truncate">{d.path}</span></div>))}</div>
          )}
        </Card>

        {/* Chat history side-by-side */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div className="font-medium flex items-center gap-2 mb-2"><MessageSquare className="h-4 w-4"/>Chat Sessions</div>
            <Card className="p-3">
              <div className="space-y-2">{groupSessions(chat).map((s, i) => (<div key={i} className="text-sm"><div className="text-xs text-muted-foreground">{new Date(s.start).toLocaleString()} • {s.agent || 'unknown'}</div><div className="truncate">{s.summary}</div></div>))}{chat.length===0 && <div className="text-sm text-muted-foreground">No chat yet for this project.</div>}</div>
            </Card>
          </div>
          <div>
            <div className="font-medium mb-2">Recent Messages</div>
            <Card className="p-3"><div className="space-y-2 text-sm">{chat.slice(-10).map((m, idx) => (<div key={idx} className="border-b last:border-b-0 pb-2"><div className="text-xs text-muted-foreground">{m.role} • {new Date(m.timestamp).toLocaleTimeString()} • {m.agent}</div><div className="whitespace-pre-wrap">{m.content}</div></div>))}</div></Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function groupSessions(msgs: Array<{ role:string; content:string; timestamp:number; agent?:string }>) {
  const sessions: Array<{ start:number; agent?:string; summary:string }> = []
  let cur: any = null
  for (const m of msgs) {
    if (!cur) { cur = { start: m.timestamp, agent: m.agent, texts: [m.content] }; continue }
    if ((m.timestamp - cur.start) > 5*60*1000 || m.agent !== cur.agent) { sessions.push({ start: cur.start, agent: cur.agent, summary: cur.texts.join(' ').slice(0,120) }); cur = { start: m.timestamp, agent: m.agent, texts: [m.content] } }
    else { cur.texts.push(m.content) }
  }
  if (cur) sessions.push({ start: cur.start, agent: cur.agent, summary: cur.texts.join(' ').slice(0,120) })
  return sessions
}
