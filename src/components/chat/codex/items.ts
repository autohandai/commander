export type CommandExecutionStatus = 'in_progress' | 'completed' | 'failed'

export type CommandExecutionItem = {
  id: string
  type: 'command_execution'
  command: string
  aggregated_output: string
  exit_code?: number
  status: CommandExecutionStatus
}

export type PatchChangeKind = 'add' | 'delete' | 'update'

export type FileUpdateChange = {
  path: string
  kind: PatchChangeKind
}

export type PatchApplyStatus = 'completed' | 'failed'

export type FileChangeItem = {
  id: string
  type: 'file_change'
  changes: FileUpdateChange[]
  status: PatchApplyStatus
}

export type McpToolCallStatus = 'in_progress' | 'completed' | 'failed'

export type McpToolCallItem = {
  id: string
  type: 'mcp_tool_call'
  server: string
  tool: string
  status: McpToolCallStatus
}

export type AgentMessageItem = {
  id: string
  type: 'agent_message'
  text: string
}

export type ReasoningItem = {
  id: string
  type: 'reasoning'
  text: string
}

export type WebSearchItem = {
  id: string
  type: 'web_search'
  query: string
}

export type ErrorItem = {
  id: string
  type: 'error'
  message: string
}

export type TodoItem = {
  text: string
  completed: boolean
}

export type TodoListItem = {
  id: string
  type: 'todo_list'
  items: TodoItem[]
}

export type ThreadItem =
  | AgentMessageItem
  | ReasoningItem
  | CommandExecutionItem
  | FileChangeItem
  | McpToolCallItem
  | WebSearchItem
  | TodoListItem
  | ErrorItem
