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
}

interface CommitFile {
  status: string
  path: string
}

export function DiffViewer({ projectPath, commitHash }: DiffViewerProps) {
  const [files, setFiles] = useState<CommitFile[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [leftCode, setLeftCode] = useState<string>('')
  const [rightCode, setRightCode] = useState<string>('')
  const [unifiedDiff, setUnifiedDiff] = useState<string>('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (commitHash) {
      loadCommitFiles()
    } else {
      setFiles([])
      setSelectedFile(null)
      setLeftCode('')
      setRightCode('')
      setUnifiedDiff('')
    }
  }, [commitHash, projectPath])

  const loadCommitFiles = async () => {
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

  const handleFileSelect = async (filePath: string) => {
    if (!commitHash) return
    
    setSelectedFile(filePath)
    setLoading(true)
    
    try {
      // Get unified diff
      const diff = await invoke<string>('get_commit_diff_text', {
        projectPath,
        commitHash,
        filePath
      })
      setUnifiedDiff(diff)

      // Get file content for side-by-side view
      const [leftContent, rightContent] = await Promise.all([
        // Parent commit content (if exists)
        invoke<string>('get_file_at_commit', {
          projectPath,
          commitHash: 'HEAD~1', // Simplified - should use actual parent
          filePath
        }).catch(() => ''),
        // Current commit content
        invoke<string>('get_file_at_commit', {
          projectPath,
          commitHash,
          filePath
        }).catch(() => '')
      ])

      setLeftCode(leftContent)
      setRightCode(rightContent)
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

  if (!commitHash) {
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
    <div className="space-y-4">
      {/* Files List */}
      <Card className="p-4">
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
          <div className="grid grid-cols-2 gap-2">
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
        )}
      </Card>

      {/* Diff Viewer */}
      {selectedFile && (
        <Card className="p-4">
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
                <ScrollArea className="h-96">
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
              <div className="grid grid-cols-2 gap-4 h-96">
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
        </Card>
      )}
    </div>
  )
}