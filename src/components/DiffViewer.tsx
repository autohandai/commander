import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Diff, FileText, Eye } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Highlight, themes } from 'prism-react-renderer'

interface DiffViewerProps {
  projectPath: string
  commitHash: string | null
  compareMode?: 'commit' | 'workspace' | 'refs'
  workspacePath?: string
  baseRef?: string
  compareRef?: string
}

interface CommitFile {
  status: string
  path: string
}

export function DiffViewer({ projectPath, commitHash, compareMode = 'commit', workspacePath, baseRef, compareRef }: DiffViewerProps) {
  const [files, setFiles] = useState<CommitFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [leftCode, setLeftCode] = useState<string>('')
  const [rightCode, setRightCode] = useState<string>('')
  const [unifiedDiff, setUnifiedDiff] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [workspaceBranch, setWorkspaceBranch] = useState<string | null>(null)

  useEffect(() => {
    // Reset on target change
    setFiles([])
    setSelectedFile(null)
    setLeftCode('')
    setRightCode('')
    setUnifiedDiff('')

    if (compareMode === 'commit' && commitHash) {
      loadFilesForCommit()
    } else if (compareMode === 'workspace' && workspacePath) {
      // load branch name for the workspace to support side-by-side
      loadWorkspaceBranch()
      loadFilesForWorkspace()
    } else if (compareMode === 'refs' && baseRef && compareRef) {
      // placeholder: refs compare not implemented yet
      // leave empty list for now
    }
  }, [compareMode, commitHash, projectPath, workspacePath, baseRef, compareRef])

  const loadFilesForCommit = async () => {
    if (!commitHash) return
    
    setLoading(true)
    try {
      const commitFiles = await invoke<CommitFile[]>('get_commit_diff_files', {
        projectPath,
        commitHash
      })
      setFiles(commitFiles)
      setSelectedFile(null)
      setLeftCode('')
      setRightCode('')
      setUnifiedDiff('')
    } catch (error) {
      console.error('Failed to load commit files:', error)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  const loadFilesForWorkspace = async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const commitFiles = await invoke<Array<Record<string, string>>>('diff_workspace_vs_main', {
        projectPath,
        worktreePath: workspacePath
      }).catch(() => [])
      const mapped: CommitFile[] = commitFiles.map((r) => ({
        status: (r.status || '') as string,
        path: (r.path || '') as string,
      }))
      setFiles(mapped)
      setSelectedFile(null)
      setLeftCode('')
      setRightCode('')
      setUnifiedDiff('')
    } catch (error) {
      console.error('Failed to load workspace diff files:', error)
      setFiles([])
    } finally {
      setLoading(false)
    }
  }

  const loadWorkspaceBranch = async () => {
    if (!workspacePath) return
    try {
      const worktrees = await invoke<Array<Record<string, string>>>('get_git_worktrees')
      const entry = worktrees.find((wt) => wt.path === workspacePath)
      setWorkspaceBranch(entry?.branch || null)
    } catch {
      setWorkspaceBranch(null)
    }
  }

  const handleFileSelect = async (filePath: string) => {
    setSelectedFile(filePath)
    setLoading(true)
    try {
      if (compareMode === 'commit') {
        if (!commitHash) return
        const diff = await invoke<string>('get_commit_diff_text', { projectPath, commitHash, filePath })
        setUnifiedDiff(diff)
        const [leftContent, rightContent] = await Promise.all([
          invoke<string>('get_file_at_commit', { projectPath, commitHash: 'HEAD~1', filePath }).catch(() => ''),
          invoke<string>('get_file_at_commit', { projectPath, commitHash, filePath }).catch(() => ''),
        ])
        setLeftCode(leftContent)
        setRightCode(rightContent)
      } else if (compareMode === 'workspace') {
        if (!workspacePath) return
        const diff = await invoke<string>('diff_workspace_file', {
          projectPath,
          worktreePath: workspacePath,
          filePath
        })
        setUnifiedDiff(diff)
        const base = 'main'
        const head = workspaceBranch || 'HEAD'
        const [leftContent, rightContent] = await Promise.all([
          invoke<string>('get_file_at_commit', { projectPath, commitHash: base, filePath }).catch(() => ''),
          invoke<string>('get_file_at_commit', { projectPath, commitHash: head, filePath }).catch(() => ''),
        ])
        setLeftCode(leftContent)
        setRightCode(rightContent)
      } else {
        // refs compare not implemented
        setUnifiedDiff('Ref-to-ref comparison not implemented')
        setLeftCode('')
        setRightCode('')
      }
    } catch (error) {
      console.error('Failed to load file diff:', error)
      setUnifiedDiff('Failed to load diff')
      setLeftCode('')
      setRightCode('')
    } finally {
      setLoading(false)
    }
  }

  const getLanguageFromFilename = (filename: string): string => {
    const ext = filename.split('.').pop()?.toLowerCase()
    switch (ext) {
      case 'ts': return 'typescript'
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
      default: return 'text'
    }
  }

  const getStatusColor = (status: string): string => {
    switch (status.toUpperCase()) {
      case 'A': return 'text-green-600 dark:text-green-400'
      case 'M': return 'text-blue-600 dark:text-blue-400'
      case 'D': return 'text-red-600 dark:text-red-400'
      case 'R': return 'text-purple-600 dark:text-purple-400'
      default: return 'text-muted-foreground'
    }
  }

  if (compareMode === 'commit' && !commitHash) {
    return (
      <Card className="p-8 text-center">
        <Diff className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
        <div className="text-lg font-medium mb-2">Select a Commit</div>
        <div className="text-muted-foreground">
          Choose a commit from the git graph to view its changes
        </div>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-[260px_1fr] gap-4">
      {/* Left: Files List */}
      <Card className="p-4 h-full">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4" />
          <span className="font-medium">Changed Files</span>
          <Badge variant="outline" className="text-xs">
            {files.length}
          </Badge>
        </div>

        {loading && files.length === 0 ? (
          <div className="text-sm text-muted-foreground">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="text-sm text-muted-foreground">No files changed</div>
        ) : (
          <ScrollArea className="h-[78vh]">
            <div data-testid="diff-file-list" className="flex flex-col gap-1">
              {files.map((file, idx) => (
                <button
                  key={idx}
                  onClick={() => handleFileSelect(file.path)}
                  className={`flex items-center gap-2 p-2 text-left rounded text-sm transition-colors ${
                    selectedFile === file.path
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/60'
                  }`}
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1 py-0 ${getStatusColor(file.status)}`}
                  >
                    {file.status}
                  </Badge>
                  <span className="font-mono text-xs truncate flex-1">
                    {file.path}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </Card>

      {/* Right: Diff Viewer Panel */}
      <Card className="p-4">
        {!selectedFile ? (
          <div className="h-[78vh] flex items-center justify-center text-sm text-muted-foreground">
            Select a file to view its diff
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <Eye className="h-4 w-4" />
              <span className="font-medium">Diff: </span>
              <code className="text-sm bg-muted px-2 py-1 rounded">
                {selectedFile}
              </code>
            </div>

            <Tabs defaultValue="unified" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="unified">Unified Diff</TabsTrigger>
                <TabsTrigger value="split">Side by Side</TabsTrigger>
              </TabsList>

              <TabsContent value="unified" className="mt-4">
                <div className="border rounded-md bg-muted/10 overflow-hidden">
                  <ScrollArea className="h-[74vh]">
                    <pre className="text-xs p-4 whitespace-pre-wrap">
                      {unifiedDiff.split('\n').map((line, i) => {
                        let className = ''
                        if (line.startsWith('+') && !line.startsWith('+++')) {
                          className = 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20'
                        } else if (line.startsWith('-') && !line.startsWith('---')) {
                          className = 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                        } else if (line.startsWith('@@')) {
                          className = 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-medium'
                        }

                        return (
                          <div key={i} className={className}>
                            {line}
                          </div>
                        )
                      })}
                    </pre>
                  </ScrollArea>
                </div>
              </TabsContent>

              <TabsContent value="split" className="mt-4">
                <div className="grid grid-cols-2 gap-4 h-[74vh]">
                  {/* Left side - Before */}
                  <div className="border rounded-md bg-muted/10 overflow-hidden">
                    <div className="bg-muted px-3 py-2 text-xs font-medium border-b">
                      Before (Parent)
                    </div>
                    <ScrollArea className="h-full">
                      <Highlight
                        theme={themes.github}
                        code={leftCode || '(empty)'}
                        language={getLanguageFromFilename(selectedFile) as any}
                      >
                        {({ className, style, tokens, getLineProps, getTokenProps }) => (
                          <pre className={`${className} text-xs p-3`} style={style}>
                            {tokens.map((line, i) => (
                              <div key={i} {...getLineProps({ line })}>
                                <span className="inline-block w-8 text-muted-foreground text-right mr-3">
                                  {i + 1}
                                </span>
                                {line.map((token, key) => (
                                  <span key={key} {...getTokenProps({ token })} />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    </ScrollArea>
                  </div>

                  {/* Right side - After */}
                  <div className="border rounded-md bg-muted/10 overflow-hidden">
                    <div className="bg-muted px-3 py-2 text-xs font-medium border-b">
                      After (Commit)
                    </div>
                    <ScrollArea className="h-full">
                      <Highlight
                        theme={themes.github}
                        code={rightCode || '(empty)'}
                        language={getLanguageFromFilename(selectedFile) as any}
                      >
                        {({ className, style, tokens, getLineProps, getTokenProps }) => (
                          <pre className={`${className} text-xs p-3`} style={style}>
                            {tokens.map((line, i) => (
                              <div key={i} {...getLineProps({ line })}>
                                <span className="inline-block w-8 text-muted-foreground text-right mr-3">
                                  {i + 1}
                                </span>
                                {line.map((token, key) => (
                                  <span key={key} {...getTokenProps({ token })} />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    </ScrollArea>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </Card>
    </div>
  )
}
