import { useState, useEffect, useMemo } from 'react';
import { Folder, FolderOpen, File, ChevronRight, ChevronDown, Plus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { invoke } from '@tauri-apps/api/core';
import { FileTypeIcon } from '@/components/FileTypeIcon';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Highlight, themes, type Language } from 'prism-react-renderer';
import { useFileMention } from '@/hooks/use-file-mention';
import { useSettings } from '@/contexts/settings-context';
import { resolvePrismTheme } from '@/lib/code-theme';
import { FileInfo } from '@/types/file-mention';
import { RecentProject } from '@/hooks/use-recent-projects';
import { parseWorkspaceWorktrees, WorkspaceEntry } from '@/lib/workspaces';

interface CodeViewProps {
  project: RecentProject;
  tauriInvoke?: <T = any>(cmd: string, args?: Record<string, any>) => Promise<T>;
}

interface FileTreeItem extends FileInfo {
  children?: FileTreeItem[];
  level: number;
}

interface FileTreeNodeProps {
  item: FileTreeItem;
  onFileSelect: (file: FileInfo) => void;
  selectedFile: string | null;
}

function FileTreeNode({ item, onFileSelect, selectedFile }: FileTreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(item.level < 2); // Auto-expand first 2 levels
  
  const handleToggle = () => {
    if (item.is_directory) {
      setIsExpanded(!isExpanded);
    } else {
      onFileSelect(item);
    }
  };

  const isSelected = selectedFile === item.relative_path;
  
  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleToggle}
        className={`w-full justify-start h-7 px-2 font-normal ${
          isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
        }`}
        style={{ paddingLeft: `${item.level * 12 + 8}px` }}
      >
        {item.is_directory ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 mr-1 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 mr-1 text-muted-foreground" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 mr-2 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 mr-2 text-blue-500" />
            )}
          </>
        ) : (
          <>
            <div className="w-4 mr-1" /> {/* Spacer for alignment */}
            <FileTypeIcon filename={item.name} className="mr-2" />
          </>
        )}
        <span className="truncate text-left flex-1">
          {item.name}
        </span>
      </Button>
      
      {item.is_directory && isExpanded && item.children && (
        <div>
          {item.children.map((child) => (
            <FileTreeNode
              key={child.relative_path}
              item={child}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileExplorer({ project, onFileSelect, selectedFile, rootPath }: {
  project: RecentProject;
  onFileSelect: (file: FileInfo) => void;
  selectedFile: string | null;
  rootPath: string;
}) {
  const { files, listFiles, loading } = useFileMention();
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);

  useEffect(() => {
    // Load all files from the project directory
    listFiles({
      directory_path: rootPath || project.path,
      max_depth: 10, // Deep traversal for complete file tree
      extensions: [], // show all files in CodeView (no filter)
    });
  }, [project.path, rootPath, listFiles]);

  // Auto-refresh when CLI sessions stream finishes, and periodic polling as fallback
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let interval: any = null;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ session_id: string; content: string; finished: boolean }>('cli-stream', (e) => {
          if (e.payload?.finished) {
            listFiles({ directory_path: rootPath || project.path, max_depth: 10, extensions: [] });
          }
        });
      } catch {
        // ignore if tauri events are unavailable in tests
      }
      // Periodic refresh as a safety net
      interval = setInterval(() => {
        listFiles({ directory_path: rootPath || project.path, max_depth: 10, extensions: [] });
      }, 5000);
    })();
    return () => {
      try { unlisten?.() } catch {}
      if (interval) clearInterval(interval);
    };
  }, [project.path, rootPath, listFiles]);

  useEffect(() => {
    // Build tree structure from flat file list
    const buildFileTree = (files: FileInfo[]): FileTreeItem[] => {
      const tree: FileTreeItem[] = [];
      const pathMap = new Map<string, FileTreeItem>();

      // Sort files by path for proper tree building
      const sortedFiles = [...files].sort((a, b) => a.relative_path.localeCompare(b.relative_path));

      for (const file of sortedFiles) {
        const pathParts = file.relative_path.split('/');
        let currentPath = '';
        let currentLevel = tree;
        let level = 0;

        for (let i = 0; i < pathParts.length; i++) {
          const part = pathParts[i];
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          
          let existingItem = pathMap.get(currentPath);
          
          if (!existingItem) {
            const isDirectory = i < pathParts.length - 1 || file.is_directory;
            existingItem = {
              ...file,
              name: part,
              relative_path: currentPath,
              is_directory: isDirectory,
              children: isDirectory ? [] : undefined,
              level
            };
            
            pathMap.set(currentPath, existingItem);
            currentLevel.push(existingItem);
          }
          
          if (existingItem.children) {
            currentLevel = existingItem.children;
          }
          level++;
        }
      }

      return tree;
    };

    if (files.length > 0) {
      setFileTree(buildFileTree(files));
    }
  }, [files]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">Loading files...</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        <div className="mb-2 px-2">
          <h3 className="font-semibold text-sm">{project.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{project.path}</p>
        </div>
        <Separator className="mb-2" />
        <div className="space-y-1">
          {fileTree.map((item) => (
            <FileTreeNode
              key={item.relative_path}
              item={item}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      </div>
    </ScrollArea>
  );
}

function CodeEditor({ file }: { file: FileInfo | null }) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { settings } = useSettings();
  const [reloadToken, setReloadToken] = useState(0);

  const language = useMemo<Language | undefined>(() => {
    if (!file || file.is_directory) return undefined;
    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': return 'ts';
      case 'tsx': return 'tsx';
      case 'js': return 'javascript';
      case 'jsx': return 'jsx';
      case 'json': return 'json';
      case 'md':
      case 'mdx': return 'markdown';
      case 'html': return 'markup';
      case 'css': return 'css';
      case 'scss':
      case 'sass': return 'scss';
      case 'py': return 'python';
      case 'rs': return 'rust';
      case 'go': return 'go';
      case 'rb': return 'ruby';
      case 'sh':
      case 'bash': return 'bash';
      case 'yml':
      case 'yaml': return 'yaml';
      case 'toml': return 'toml';
      case 'java': return 'java';
      case 'kt': return 'kotlin';
      case 'swift': return 'swift';
      case 'c': return 'c';
      case 'h': return 'c';
      case 'cpp':
      case 'cc':
      case 'cxx': return 'cpp';
      case 'hpp': return 'cpp';
      default:
        return undefined;
    }
  }, [file]);

  useEffect(() => {
    if (!file || file.is_directory) {
      setContent('');
      return;
    }

    // Load file content via Tauri and apply settings
    setLoading(true);
    (async () => {
      try {
        const txt = await invoke<string>('read_file_content', { filePath: file.path });
        setContent(txt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setContent(`/* Failed to load file: ${msg} */`);
      } finally {
        setLoading(false);
      }
    })();
  }, [file, reloadToken]);

  // Refresh the open file after CLI command finishes; debounce via reloadToken
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let timer: any = null;
    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen<{ finished: boolean }>('cli-stream', (e) => {
          if (e.payload?.finished) {
            // Debounce rapid sequences
            clearTimeout(timer);
            timer = setTimeout(() => setReloadToken((n) => n + 1), 200);
          }
        });
      } catch {
        // ignore in tests
      }
    })();
    return () => {
      try { unlisten?.() } catch {}
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Get theme and font size from settings context
  const themeName = resolvePrismTheme(settings.code_settings.theme, settings.ui_theme);
  const fontSize = settings.code_settings.font_size;

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center">
          <File className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No file selected</h3>
          <p className="text-sm text-muted-foreground">
            Select a file from the explorer to view its contents
          </p>
        </div>
      </div>
    );
  }

  if (file.is_directory) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20">
        <div className="text-center">
          <Folder className="h-16 w-16 mx-auto mb-4 text-blue-500" />
          <h3 className="text-lg font-semibold mb-2">{file.name}</h3>
          <p className="text-sm text-muted-foreground">This is a directory</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* File tab */}
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-2">
        <FileTypeIcon filename={file.name} className="" />
        <span className="font-medium">{file.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">{file.relative_path}</span>
      </div>
      
      {/* Editor content */}
      <div className="flex-1 p-0 min-h-0 h-full min-w-0">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">Loading file content...</p>
          </div>
        ) : (
          <div className="h-full overflow-auto min-w-0 with-scrollbars">
            <div className="p-4">
              {language ? (
                <Highlight theme={themeName === 'dracula' ? themes.dracula : themes.github} code={content} language={language}>
                  {({ className, style, tokens, getLineProps, getTokenProps }: any) => (
                    <pre
                      className={`${className} font-mono bg-muted/20 rounded-lg p-4 overflow-x-auto`}
                      style={{ ...style, fontSize }}
                    >
                      {tokens.map((line: any, i: number) => {
                        const lineProps = getLineProps({ line });
                        return (
                          <div key={i} {...lineProps} className={`flex ${lineProps.className || ''}`}>
                            <span
                              className="select-none w-12 shrink-0 text-right mr-4 pr-2 text-muted-foreground/70 border-r border-border"
                              aria-hidden="true"
                            >
                              {i + 1}
                            </span>
                            <span className="flex-1">
                              {line.map((token: any, key: number) => (
                                <span key={key} {...getTokenProps({ token })} />
                              ))}
                            </span>
                          </div>
                        );
                      })}
                    </pre>
                  )}
                </Highlight>
              ) : (
                <pre className="font-mono whitespace-pre bg-muted/20 p-4 rounded-lg overflow-x-auto" style={{ fontSize }}>
                  {content.split('\n').map((line, i) => (
                    <div key={i} className="flex">
                      <span
                        className="select-none w-12 shrink-0 text-right mr-4 pr-2 text-muted-foreground/70 border-r border-border"
                        aria-hidden="true"
                      >
                        {i + 1}
                      </span>
                      <span className="flex-1">{line}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CodeView({ project, tauriInvoke }: CodeViewProps) {
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);
  const [viewScope, setViewScope] = useState<'main' | 'workspace'>('main');
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [creatingWs, setCreatingWs] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceEntry[]>([]);
  const [wsOpen, setWsOpen] = useState(false);
  // jsdom environment lacks scrollIntoView used by Radix Select; polyfill for tests
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const proto: any = (window as any).HTMLElement?.prototype
        if (proto && typeof proto.scrollIntoView !== 'function') {
          proto.scrollIntoView = () => {}
        }
      }
    } catch {}
  }, [])
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newWsName, setNewWsName] = useState('');

  // Discover a workspace worktree under .commander if available
  useEffect(() => {
    (async () => {
      try {
        const call = tauriInvoke || invoke;
        const list = await call<Array<Record<string, string>>>('get_git_worktrees');
        const ws = parseWorkspaceWorktrees(list as any, project.path);
        setWorkspaces(ws);
        if (ws.length > 0) {
          setWorkspacePath(ws[0].path);
          setViewScope('workspace');
        } else {
          setWorkspacePath(null);
          setViewScope('main');
        }
      } catch {
        setWorkspacePath(null);
        setViewScope('main');
      }
    })();
  }, [project.path]);

  useEffect(() => {
    setSelectedFile((prev) => (prev ? null : prev));
  }, [viewScope, workspacePath]);

  const handleFileSelect = (file: FileInfo) => {
    setSelectedFile(file);
  };

  return (
    <>
    <div className="flex-1 flex min-h-0 min-w-0 overflow-hidden h-full">
      {/* File Explorer Sidebar */}
      <div className="w-80 border-r bg-muted/30 flex flex-col min-h-0 h-full">
        <div className="p-2 border-b bg-muted/20 space-y-2">
          {viewScope !== 'workspace' && (
            <Button size="sm" className="w-full" disabled={creatingWs} onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Create Workspace
            </Button>
          )}
          {viewScope === 'workspace' && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Workspace</Label>
              <Select value={workspacePath || ''} open={wsOpen} onOpenChange={setWsOpen} onValueChange={(p) => { setWorkspacePath(p); setSelectedFile(null); }}>
                <SelectTrigger className="h-8" onMouseDown={() => setWsOpen(true)}>
                  {!wsOpen ? (
                    <SelectValue placeholder="Select workspace" />
                  ) : (
                    // Hide current value while open to avoid duplicate text queries in tests
                    <span className="sr-only">Workspace menu open</span>
                  )}
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((ws) => (
                    <SelectItem key={ws.path} value={ws.path}>{ws.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => setIsCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> New Workspace
                </Button>
                <Button size="sm" variant="outline" disabled={!workspacePath} onClick={async () => {
                  if (!workspacePath) return;
                  const ws = workspaces.find((w) => w.path === workspacePath);
                  const ok = confirm(`Delete workspace "${ws?.name || 'current'}"? This will remove its worktree directory.`);
                  if (!ok) return;
                  try {
                    const call = tauriInvoke || invoke;
                    await call('remove_workspace_worktree', { projectPath: project.path, worktreePath: workspacePath });
                    const list = await call<Array<Record<string, string>>>('get_git_worktrees');
                    const next = parseWorkspaceWorktrees(list as any, project.path);
                    setWorkspaces(next);
                    if (next.length > 0) {
                      setWorkspacePath(next[0].path);
                    } else {
                      setWorkspacePath(null);
                      setViewScope('main');
                    }
                  } catch (e) {
                    console.error('Failed to remove workspace', e);
                  }
                }}>Remove</Button>
              </div>
            </div>
          )}
        </div>
        <FileExplorer
          project={project}
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile?.relative_path || null}
          rootPath={viewScope === 'workspace' && workspacePath ? workspacePath : project.path}
        />
      </div>

      {/* Code Editor */}
      <CodeEditor file={selectedFile} />
    </div>
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Create Workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={newWsName} onChange={(e) => setNewWsName(e.target.value)} placeholder="feature-xyz" />
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              const name = (newWsName || '').trim();
              if (!name) return;
              try {
                setCreatingWs(true);
                const call = tauriInvoke || invoke;
                const path = await call<string>('create_workspace_worktree', { projectPath: project.path, name });
                const list = await call<Array<Record<string, string>>>('get_git_worktrees');
                const next = parseWorkspaceWorktrees(list as any, project.path);
                setWorkspaces(next);
                setWorkspacePath(path);
                setViewScope('workspace');
                setIsCreateOpen(false);
                setNewWsName('');
              } catch (e) {
                console.error('Failed to create workspace', e);
              } finally {
                setCreatingWs(false);
              }
            }}>Create</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
