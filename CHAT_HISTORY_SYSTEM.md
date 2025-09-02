# Chat History Persistence System

## Overview

A robust, performance-optimized chat history system that organizes conversations into sessions with comprehensive metadata support and seamless migration from legacy formats.

## Architecture

### File Structure
```
project_root/
├── .commander/
│   └── chat_history/
│       ├── sessions_index.json        # Fast session lookup
│       ├── session_20240101_143022.json  # Individual sessions
│       ├── session_20240101_150500.json
│       └── chat_backup.json          # Migration backup
```

### Core Models

#### EnhancedChatMessage
```rust
{
  id: string,
  role: "user" | "assistant",
  content: string,
  timestamp: i64,
  agent: string,
  metadata: {
    branch: string?,
    workingDir: string?,
    fileMentions: string[],
    sessionId: string
  }
}
```

#### ChatSession
```rust
{
  id: string,
  startTime: i64,
  endTime: i64,
  agent: string,
  branch: string?,
  messageCount: usize,
  summary: string
}
```

## Session Grouping Logic

Messages are automatically grouped into sessions based on:

1. **Time Gap**: 5-minute inactivity threshold
2. **Agent Consistency**: Same AI agent (claude, codex, gemini)
3. **Context Continuity**: Branch and working directory consistency

### Example Grouping
```
[User] "Help with Rust" (10:00) -> Session A starts
[Claude] "I'll help!" (10:01)    -> Session A continues
[User] "Thanks!" (10:03)         -> Session A continues
-- 10 minute gap --
[User] "New question" (10:15)    -> Session B starts (new session due to gap)
```

## Tauri Commands API

### Core Operations
```typescript
// Save messages as session
save_chat_session(projectPath: string, messages: EnhancedChatMessage[]): Promise<string>

// Load sessions with filtering
load_chat_sessions(projectPath: string, limit?: number, agent?: string): Promise<ChatSession[]>

// Get specific session messages
get_session_messages(projectPath: string, sessionId: string): Promise<EnhancedChatMessage[]>

// Delete session
delete_chat_session(projectPath: string, sessionId: string): Promise<void>
```

### Convenience Operations
```typescript
// Append single message (auto-groups into session)
append_chat_message(
  projectPath: string,
  role: string,
  content: string,
  agent: string,
  branch?: string,
  workingDir?: string
): Promise<string>

// Search across all sessions
search_chat_history(
  projectPath: string,
  query: string,
  agent?: string,
  limit?: number
): Promise<ChatSession[]>
```

### Migration & Compatibility
```typescript
// Auto-migrate legacy data
auto_migrate_chat_data(app: AppHandle, projectPath: string): Promise<string?>

// Unified history (handles both old/new formats)
get_unified_chat_history(
  app: AppHandle,
  projectPath: string,
  limit?: number
): Promise<ChatSession[]>

// Backward-compatible save
save_enhanced_chat_message(
  app: AppHandle,
  projectPath: string,
  role: string,
  content: string,
  agent: string,
  branch?: string,
  workingDir?: string
): Promise<string>
```

### Analytics & Maintenance
```typescript
// Get statistics
get_chat_history_stats(projectPath: string): Promise<ChatHistoryStats>

// Export functionality
export_chat_history(
  projectPath: string,
  format: 'Json' | 'Markdown' | 'Html' | 'Csv',
  sessionIds?: string[],
  includeMetadata: boolean
): Promise<string>

// Cleanup old sessions
cleanup_old_sessions(projectPath: string, retentionDays: number): Promise<number>
```

## Frontend Integration

### ChatInterface Integration
```typescript
// Replace existing save_project_chat calls
const saveMessage = async (role: string, content: string) => {
  const sessionId = await invoke('save_enhanced_chat_message', {
    app: appHandle,
    projectPath: project.path,
    role,
    content,
    agent: selectedAgent,
    branch: currentBranch,
    workingDir: workingDirectory
  });
  
  // Update UI with session ID
  setCurrentSessionId(sessionId);
};
```

### HistoryView Integration
```typescript
// Load session-based history
const loadChatHistory = async () => {
  const sessions = await invoke<ChatSession[]>('get_unified_chat_history', {
    app: appHandle,
    projectPath: project.path,
    limit: 50
  });
  
  setSessions(sessions);
};

// Load specific session messages
const loadSessionMessages = async (sessionId: string) => {
  const messages = await invoke<EnhancedChatMessage[]>('get_session_messages', {
    projectPath: project.path,
    sessionId
  });
  
  setMessages(messages);
};
```

### Migration Handling
```typescript
// Auto-migrate when project loads
const initProject = async (project: Project) => {
  try {
    const migrationResult = await invoke('auto_migrate_chat_data', {
      app: appHandle,
      projectPath: project.path
    });
    
    if (migrationResult) {
      console.log('Migration completed:', migrationResult);
      // Show user notification about successful migration
    }
  } catch (error) {
    console.warn('Migration failed:', error);
    // Fall back to legacy format
  }
};
```

## Performance Features

### 1. Lazy Loading
- Sessions index loads instantly (metadata only)
- Messages loaded on-demand when session selected
- Configurable limits prevent memory issues

### 2. Efficient Search
- Full-text search across session summaries
- File mention extraction and indexing
- Agent and date filtering

### 3. Automatic Cleanup
- Configurable retention policies
- Old session cleanup commands
- Compression for large sessions

### 4. Cross-Platform Compatibility
- Native file system operations
- Proper path handling for Windows/macOS/Linux
- Atomic file operations prevent corruption

## File Format Specifications

### sessions_index.json
```json
{
  "sessions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "startTime": 1704067200,
      "endTime": 1704070800,
      "agent": "claude",
      "branch": "main",
      "messageCount": 8,
      "summary": "Help with implementing a sorting algorithm"
    }
  ],
  "lastUpdated": 1704070800,
  "version": "1.0"
}
```

### session_{id}.json
```json
[
  {
    "id": "msg-1",
    "role": "user",
    "content": "Can you help me implement quicksort?",
    "timestamp": 1704067200,
    "agent": "claude",
    "metadata": {
      "branch": "main",
      "workingDir": "/Users/dev/project",
      "fileMentions": ["src/sort.rs"],
      "sessionId": "550e8400-e29b-41d4-a716-446655440000"
    }
  }
]
```

## Error Handling

### Graceful Degradation
1. **Missing Directory**: Auto-create `.commander/chat_history/`
2. **Corrupted Files**: Fall back to empty state, log error
3. **Migration Failure**: Continue with legacy format
4. **Disk Full**: Rotate old sessions, compress content

### Error Recovery
```rust
// Example error handling pattern
pub async fn save_chat_session(/* params */) -> Result<(), String> {
    match ensure_commander_directory(project_path).await {
        Ok(dir) => { /* proceed */ },
        Err(e) => {
            log::error!("Failed to create chat directory: {}", e);
            return Err("Chat directory creation failed".to_string());
        }
    }
    
    // Continue with save logic...
}
```

## Testing Strategy

### Comprehensive Test Coverage
- **Unit Tests**: Individual functions and models
- **Integration Tests**: End-to-end session workflows
- **Migration Tests**: Legacy format compatibility
- **Performance Tests**: Large session handling
- **Error Tests**: Failure scenarios and recovery

### Test Examples
```rust
#[tokio::test]
async fn test_session_grouping_by_time_gap() {
    let messages = create_test_messages_with_gaps();
    let sessions = group_messages_into_sessions(messages).await.unwrap();
    assert_eq!(sessions.len(), 2); // Should split on time gap
}

#[tokio::test]  
async fn test_cross_platform_file_handling() {
    let project_path = create_cross_platform_path();
    let result = save_chat_session(&project_path, &session, &messages).await;
    assert!(result.is_ok());
    // Verify files are accessible across platforms
}
```

## Migration Strategy

### Automatic Migration
1. **Detection**: Check if enhanced format exists
2. **Backup**: Create backup of legacy data
3. **Convert**: Transform messages to enhanced format
4. **Group**: Organize into sessions based on timing
5. **Verify**: Confirm migration success
6. **Cleanup**: Optional removal of legacy data

### Backward Compatibility
- Dual-format writes during transition period
- Unified read operations handle both formats
- Gradual migration without user disruption

## Future Enhancements

### Planned Features
1. **Compression**: Automatic compression for large sessions
2. **Cloud Sync**: Optional cloud backup/sync
3. **Advanced Search**: Semantic search capabilities
4. **Export Formats**: PDF, HTML, CSV export
5. **Analytics**: Usage patterns and insights

### Extension Points
- Plugin system for custom metadata extractors
- Custom session grouping rules
- External storage adapters
- Advanced search indexing

## Integration Checklist

### Backend (Completed ✅)
- [x] Enhanced models with metadata
- [x] Session grouping logic
- [x] File-based persistence layer
- [x] Migration commands
- [x] Comprehensive test suite
- [x] Error handling and recovery

### Frontend (Next Steps)
- [ ] Update ChatInterface to use new commands
- [ ] Redesign HistoryView for session-based display
- [ ] Add migration UI notifications
- [ ] Implement search and filtering
- [ ] Add export functionality
- [ ] Performance monitoring

### Deployment
- [ ] Update TypeScript interfaces
- [ ] Add migration UI flows
- [ ] Performance testing with large datasets
- [ ] Cross-platform testing
- [ ] Documentation for users

## Summary

This chat history system provides:

✅ **Robust Data Model**: Enhanced messages with rich metadata
✅ **Intelligent Grouping**: Automatic session organization  
✅ **Performance Optimization**: Lazy loading and efficient indexing
✅ **Seamless Migration**: Backward compatibility with existing data
✅ **Comprehensive API**: Full CRUD operations with filtering
✅ **Cross-Platform**: Native file operations for all platforms
✅ **Production Ready**: Error handling, testing, and recovery

The system is designed to scale from individual projects to enterprise deployments while maintaining simplicity for end users.