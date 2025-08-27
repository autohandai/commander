import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFileMention } from '@/hooks/use-file-mention';
import { formatFileForMention } from '@/types/file-mention';
import { Folder, File, Search, Loader2, AlertCircle } from 'lucide-react';

interface FileMentionDemoProps {
  onFileSelect?: (filePath: string) => void;
}

export const FileMentionDemo: React.FC<FileMentionDemoProps> = ({ onFileSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  
  const {
    files,
    currentDirectory,
    loading,
    error,
    listFiles,
    searchFiles,
    clearFiles,
    clearError,
  } = useFileMention();

  // Group common extensions for easier filtering
  const extensionGroups = useMemo(() => ({
    'Web': ['js', 'ts', 'tsx', 'jsx', 'html', 'css', 'scss', 'vue', 'svelte'],
    'Systems': ['rs', 'c', 'cpp', 'go', 'java', 'cs', 'swift'],
    'Scripts': ['py', 'rb', 'php', 'sh', 'bash', 'ps1'],
    'Config': ['json', 'yaml', 'yml', 'toml', 'xml'],
    'Docs': ['md', 'txt'],
  }), []);

  const handleLoadFiles = async () => {
    await listFiles({
      extensions: selectedExtensions.length > 0 ? selectedExtensions : undefined,
      max_depth: 5,
    });
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      await handleLoadFiles();
      return;
    }
    
    await searchFiles(searchTerm, {
      extensions: selectedExtensions.length > 0 ? selectedExtensions : undefined,
      max_depth: 5,
    });
  };

  const toggleExtensionGroup = (groupExtensions: string[]) => {
    const allSelected = groupExtensions.every(ext => selectedExtensions.includes(ext));
    
    if (allSelected) {
      // Remove all from this group
      setSelectedExtensions(prev => prev.filter(ext => !groupExtensions.includes(ext)));
    } else {
      // Add all from this group
      setSelectedExtensions(prev => {
        const newExtensions = [...prev];
        groupExtensions.forEach(ext => {
          if (!newExtensions.includes(ext)) {
            newExtensions.push(ext);
          }
        });
        return newExtensions;
      });
    }
  };

  const toggleExtension = (extension: string) => {
    setSelectedExtensions(prev => 
      prev.includes(extension)
        ? prev.filter(ext => ext !== extension)
        : [...prev, extension]
    );
  };

  const handleFileSelect = (file: any) => {
    if (onFileSelect) {
      onFileSelect(formatFileForMention(file));
    } else {
      // Demo behavior: copy to clipboard
      navigator.clipboard.writeText(formatFileForMention(file));
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-4xl mx-auto">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold">File Mention System Demo</h2>
        <p className="text-sm text-muted-foreground">
          Current Directory: {currentDirectory || 'Loading...'}
        </p>
      </div>

      {/* Search Controls */}
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            placeholder="Search files by name or path..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </Button>
        <Button variant="outline" onClick={handleLoadFiles} disabled={loading}>
          <Folder className="h-4 w-4" />
          List All
        </Button>
        <Button variant="outline" onClick={clearFiles}>
          Clear
        </Button>
      </div>

      {/* Extension Filters */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">Filter by Extension:</h3>
        <div className="space-y-2">
          {Object.entries(extensionGroups).map(([groupName, extensions]) => (
            <div key={groupName} className="flex items-center gap-2">
              <Badge
                variant={extensions.every(ext => selectedExtensions.includes(ext)) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => toggleExtensionGroup(extensions)}
              >
                {groupName}
              </Badge>
              <div className="flex gap-1 flex-wrap">
                {extensions.map(ext => (
                  <Badge
                    key={ext}
                    variant={selectedExtensions.includes(ext) ? "secondary" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => toggleExtension(ext)}
                  >
                    .{ext}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
        {selectedExtensions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            {selectedExtensions.map(ext => (
              <Badge key={ext} variant="default" className="text-xs">
                .{ext}
              </Badge>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedExtensions([])}
              className="h-6 px-2"
            >
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
          <Button variant="ghost" size="sm" onClick={clearError} className="ml-auto">
            Dismiss
          </Button>
        </div>
      )}

      {/* File List */}
      <div className="border rounded-md">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-medium">
            Files ({files.length})
            {loading && <Loader2 className="inline h-4 w-4 animate-spin ml-2" />}
          </h3>
          <div className="text-sm text-muted-foreground">
            Click a file to copy its mention format
          </div>
        </div>
        
        <ScrollArea className="h-96">
          {files.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              {loading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading files...
                </div>
              ) : (
                <div className="text-center">
                  <File className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No files found. Try loading files or adjusting your search.
                </div>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {files.map((file, index) => (
                <div
                  key={`${file.path}-${index}`}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => handleFileSelect(file)}
                >
                  <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {file.relative_path}
                    </div>
                  </div>
                  {file.extension && (
                    <Badge variant="outline" className="text-xs">
                      .{file.extension}
                    </Badge>
                  )}
                  <div className="text-xs text-muted-foreground">
                    @{file.relative_path}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Usage Instructions */}
      <div className="text-sm text-muted-foreground space-y-2">
        <h4 className="font-medium text-foreground">Usage Instructions:</h4>
        <ul className="list-disc list-inside space-y-1 pl-4">
          <li>Click "List All" to load all files in the current directory</li>
          <li>Use the search box to filter files by name or path</li>
          <li>Toggle extension filters to show only specific file types</li>
          <li>Click on any file to copy its mention format (e.g., @src/components/App.tsx)</li>
          <li>In a chat interface, typing "@" could trigger this file picker</li>
        </ul>
      </div>
    </div>
  );
};