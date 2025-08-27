# File Mention System Usage

The file mention system has been successfully implemented in your Tauri V2 application. Here's how to use it:

## Backend Commands Available

### 1. `get_current_working_directory()`
- **Returns**: `String` - Current working directory path
- **Purpose**: Get the current directory that the app is working in

### 2. `set_current_working_directory(path: String)`
- **Parameters**: `path` - Directory path to set as current
- **Returns**: `Result<(), String>`
- **Purpose**: Change the current working directory

### 3. `list_files_in_directory(directory_path?, extensions?, max_depth?)`
- **Parameters**:
  - `directory_path` (optional): Directory to scan (defaults to current directory)
  - `extensions` (optional): Array of file extensions to filter (defaults to common code extensions)
  - `max_depth` (optional): Maximum directory depth to scan (defaults to 5)
- **Returns**: `DirectoryListing` with current directory and array of files
- **Purpose**: Get all files in a directory recursively

### 4. `search_files_by_name(directory_path?, search_term, extensions?, max_depth?)`
- **Parameters**:
  - `search_term`: String to search for in file names and paths
  - `directory_path` (optional): Directory to search in
  - `extensions` (optional): File extensions to filter
  - `max_depth` (optional): Maximum search depth
- **Returns**: `DirectoryListing` with filtered results
- **Purpose**: Search for files by name or path

### 5. `get_file_info(file_path: String)`
- **Parameters**: `file_path` - Path to the file to get info for
- **Returns**: `Option<FileInfo>` - File information or null if not found
- **Purpose**: Get detailed information about a specific file

## Frontend Integration

### TypeScript Types
```typescript
import { FileInfo, DirectoryListing, FileMentionOptions } from '@/types/file-mention';
```

### React Hook
```typescript
import { useFileMention } from '@/hooks/use-file-mention';

const {
  files,
  currentDirectory,
  loading,
  error,
  listFiles,
  searchFiles,
  getFileInfo,
  getCurrentDirectory,
  setCurrentDirectory
} = useFileMention();
```

### Demo Component
A complete demo component is available at `src/components/FileMentionDemo.tsx` that shows:
- File listing and searching
- Extension filtering
- Error handling
- File selection with mention format

## Usage Example for Chat Interface

```typescript
// In your chat component
import { useFileMention } from '@/hooks/use-file-mention';
import { formatFileForMention } from '@/types/file-mention';

const ChatComponent = () => {
  const [message, setMessage] = useState('');
  const [showFilePicker, setShowFilePicker] = useState(false);
  const { files, searchFiles } = useFileMention();
  
  // Detect @ symbol to trigger file picker
  const handleInputChange = (value: string) => {
    setMessage(value);
    
    // Check if user typed @ at the end
    if (value.endsWith('@')) {
      setShowFilePicker(true);
      // Load files for current directory
      searchFiles(''); // Empty search shows all files
    }
  };
  
  // Handle file selection
  const handleFileSelect = (file: FileInfo) => {
    const mention = formatFileForMention(file);
    // Replace the @ with the full mention
    setMessage(prev => prev.slice(0, -1) + mention);
    setShowFilePicker(false);
  };
  
  return (
    <div>
      <input 
        value={message}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder="Type @ to mention files..."
      />
      
      {showFilePicker && (
        <div className="file-picker">
          {files.map(file => (
            <div 
              key={file.path}
              onClick={() => handleFileSelect(file)}
              className="file-option"
            >
              {file.relative_path}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```

## Security Features

The implementation includes several security features:

1. **Directory Traversal Protection**: Path validation prevents accessing directories outside the intended scope
2. **Hidden File Filtering**: Hidden files (starting with `.`) are automatically excluded
3. **Dangerous Directory Exclusion**: Common directories that shouldn't be indexed are skipped:
   - `.git`, `node_modules`, `target`, `.vscode`, `__pycache__`, etc.
4. **Depth Limiting**: Maximum traversal depth prevents infinite recursion
5. **Extension Filtering**: Only specified file types are included by default

## Default File Extensions

When no extensions are specified, the system defaults to common code file extensions:
- **Rust**: `rs`
- **JavaScript/TypeScript**: `js`, `ts`, `tsx`, `jsx`
- **Python**: `py`
- **Web**: `html`, `css`, `scss`, `vue`, `svelte`
- **Config**: `json`, `yaml`, `yml`, `toml`, `xml`
- **Documentation**: `md`, `txt`
- **And many more...**

## Performance Considerations

- **Depth Limiting**: Default max depth of 5 levels prevents excessive scanning
- **Extension Filtering**: Pre-filtering by extension reduces memory usage
- **Lazy Loading**: Files are only loaded when requested
- **Caching**: Current directory is cached to avoid repeated calls

## Error Handling

All commands return proper error messages for:
- Directory not found
- Permission denied
- Invalid paths
- Empty search terms
- File system errors

The React hook provides comprehensive error state management with user-friendly error messages.

## Integration with AI Agents

The file mention system is designed to work seamlessly with your existing AI agent commands. When a user mentions a file (e.g., `@src/App.tsx`), your chat interface can:

1. Validate the file exists using `get_file_info()`
2. Include the file context in the AI prompt
3. Allow agents to reference specific files in their responses
4. Support multi-file conversations and code reviews

This creates a powerful workflow where users can easily reference any file in their project when chatting with AI agents.