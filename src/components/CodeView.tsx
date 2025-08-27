import { useState, useEffect } from 'react';
import { FileText, Folder, FolderOpen, File, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useFileMention } from '@/hooks/use-file-mention';
import { FileInfo } from '@/types/file-mention';
import { RecentProject } from '@/hooks/use-recent-projects';

interface CodeViewProps {
  project: RecentProject;
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
            <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
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

function FileExplorer({ project, onFileSelect, selectedFile }: {
  project: RecentProject;
  onFileSelect: (file: FileInfo) => void;
  selectedFile: string | null;
}) {
  const { files, listFiles, loading } = useFileMention();
  const [fileTree, setFileTree] = useState<FileTreeItem[]>([]);

  useEffect(() => {
    // Load all files from the project directory
    listFiles({
      directory_path: project.path,
      max_depth: 10, // Deep traversal for complete file tree
    });
  }, [project.path, listFiles]);

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
    <ScrollArea className="flex-1">
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

  useEffect(() => {
    if (!file || file.is_directory) {
      setContent('');
      return;
    }

    // Load file content
    setLoading(true);
    // For now, just show a placeholder
    // In a real implementation, you'd use Tauri to read the file content
    setTimeout(() => {
      setContent(`// File: ${file.relative_path}\n// Size: Loading...\n// Last modified: Loading...\n\n// File content would be loaded here\n// This is a placeholder for the VSCode-like editor\n\nconsole.log('File content for ${file.name}');`);
      setLoading(false);
    }, 500);
  }, [file]);

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
    <div className="flex-1 flex flex-col">
      {/* File tab */}
      <div className="border-b bg-muted/30 px-4 py-2 flex items-center gap-2">
        <FileText className="h-4 w-4" />
        <span className="font-medium">{file.name}</span>
        <span className="text-xs text-muted-foreground ml-auto">{file.relative_path}</span>
      </div>
      
      {/* Editor content */}
      <div className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <p className="text-sm text-muted-foreground">Loading file content...</p>
          </div>
        ) : (
          <pre className="text-sm font-mono whitespace-pre-wrap break-words bg-muted/20 p-4 rounded-lg">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

export function CodeView({ project }: CodeViewProps) {
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);

  const handleFileSelect = (file: FileInfo) => {
    setSelectedFile(file);
  };

  return (
    <div className="flex-1 flex">
      {/* File Explorer Sidebar */}
      <div className="w-80 border-r bg-muted/30 flex flex-col">
        <FileExplorer
          project={project}
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile?.relative_path || null}
        />
      </div>

      {/* Code Editor */}
      <CodeEditor file={selectedFile} />
    </div>
  );
}