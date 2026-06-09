import { Bot, Code, Brain, Terminal } from 'lucide-react'

export interface Agent {
  id: string
  name: string
  displayName: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

export interface AgentCapability {
  id: string
  name: string
  description: string
  category: string
}

export const allowedAgentIds = ['autohand', 'claude', 'codex', 'gemini', 'cursor', 'copilot', 'pi', 'opencode', 'vibe', 'amp', 'test'] as const

export type AllowedAgentId = typeof allowedAgentIds[number]
export const DEFAULT_CLI_AGENT_IDS = ['autohand', 'claude', 'codex', 'gemini', 'cursor', 'copilot', 'pi', 'opencode', 'vibe', 'amp'] as const
export type DefaultCliAgentId = typeof DEFAULT_CLI_AGENT_IDS[number]

export const DISPLAY_TO_ID: Record<string, string> = {
  'Autohand Code': 'autohand',
  'Claude Code CLI': 'claude',
  'Codex': 'codex',
  'Gemini': 'gemini',
  'Cursor': 'cursor',
  'GitHub Copilot': 'copilot',
  'Pi': 'pi',
  'OpenCode': 'opencode',
  'Vibestral': 'vibe',
  'Amp': 'amp',
  'Test CLI': 'test',
}

export const AGENT_COMMAND_TO_DISPLAY: Record<string, string> = {
  autohand: 'Autohand Code',
  claude: 'Claude Code CLI',
  codex: 'Codex',
  gemini: 'Gemini',
  cursor: 'Cursor',
  copilot: 'GitHub Copilot',
  pi: 'Pi',
  opencode: 'OpenCode',
  vibe: 'Vibestral',
  amp: 'Amp',
  test: 'Test CLI',
}

export const AGENTS: Agent[] = [
  {
    id: 'autohand',
    name: 'autohand',
    displayName: 'Autohand Code',
    icon: Bot,
    description: 'Autonomous coding agent with hooks, tools, and multi-provider support (ACP/RPC)',
  },
  {
    id: 'claude',
    name: 'claude',
    displayName: 'Claude Code CLI',
    icon: Bot,
    description: 'Advanced reasoning, coding, and analysis',
  },
  {
    id: 'codex',
    name: 'codex',
    displayName: 'Codex',
    icon: Code,
    description: 'Code generation and completion specialist',
  },
  {
    id: 'gemini',
    name: 'gemini',
    displayName: 'Gemini',
    icon: Brain,
    description: "Google's multimodal AI assistant",
  },
  {
    id: 'cursor',
    name: 'cursor',
    displayName: 'Cursor',
    icon: Terminal,
    description: 'AI-powered code editor agent with ACP protocol support',
  },
  {
    id: 'copilot',
    name: 'copilot',
    displayName: 'GitHub Copilot',
    icon: Code,
    description: 'GitHub Copilot CLI agent with ACP protocol support',
  },
  {
    id: 'pi',
    name: 'pi',
    displayName: 'Pi',
    icon: Terminal,
    description: 'Minimal terminal coding agent with RPC protocol support',
  },
  {
    id: 'opencode',
    name: 'opencode',
    displayName: 'OpenCode',
    icon: Code,
    description: 'Open-source coding agent with ACP protocol support',
  },
  {
    id: 'vibe',
    name: 'vibe',
    displayName: 'Vibestral',
    icon: Brain,
    description: 'Mistral AI coding agent with ACP protocol support',
  },
  {
    id: 'amp',
    name: 'amp',
    displayName: 'Amp',
    icon: Code,
    description: 'Sourcegraph coding agent with ACP protocol support',
  },
  {
    id: 'test',
    name: 'test',
    displayName: 'Test CLI',
    icon: Bot,
    description: 'Test CLI streaming functionality',
  },
]

export const AGENT_CAPABILITIES: Record<string, AgentCapability[]> = {
  autohand: [
    { id: 'autonomous', name: 'Autonomous Coding', description: 'Full autonomous coding with tool use and file operations', category: 'Development' },
    { id: 'hooks', name: 'Lifecycle Hooks', description: 'Pre/post tool hooks for automation workflows', category: 'Automation' },
    { id: 'multiprovider', name: 'Multi-Provider', description: 'Supports Claude, GPT-4, Gemini, Ollama, and more via OpenRouter', category: 'Configuration' },
    { id: 'skills', name: 'Skills System', description: 'Modular instruction packages for specialized tasks', category: 'Extensibility' },
    { id: 'protocol', name: 'Protocol Support', description: 'Communicates via ACP/RPC protocols', category: 'Protocol' },
    { id: 'orchestration', name: 'Agent Orchestration', description: 'Coordinates multiple AI agents', category: 'Orchestration' },
  ],
  claude: [
    { id: 'analysis', name: 'Code Analysis', description: 'Deep code analysis and review', category: 'Analysis' },
    { id: 'refactor', name: 'Refactoring', description: 'Intelligent code refactoring', category: 'Development' },
    { id: 'debug', name: 'Debugging', description: 'Advanced debugging assistance', category: 'Development' },
    { id: 'explain', name: 'Code Explanation', description: 'Detailed code explanations', category: 'Learning' },
    { id: 'optimize', name: 'Optimization', description: 'Performance optimization suggestions', category: 'Performance' },
  ],
  codex: [
    { id: 'generate', name: 'Code Generation', description: 'Generate code from natural language', category: 'Generation' },
    { id: 'complete', name: 'Auto-completion', description: 'Intelligent code completion', category: 'Generation' },
    { id: 'translate', name: 'Language Translation', description: 'Convert between programming languages', category: 'Translation' },
    { id: 'patterns', name: 'Design Patterns', description: 'Implement common design patterns', category: 'Architecture' },
  ],
  gemini: [
    { id: 'multimodal', name: 'Multimodal Understanding', description: 'Process text, images, and code together', category: 'AI' },
    { id: 'reasoning', name: 'Advanced Reasoning', description: 'Complex logical reasoning tasks', category: 'AI' },
    { id: 'search', name: 'Web Integration', description: 'Real-time web search and integration', category: 'Integration' },
    { id: 'creative', name: 'Creative Solutions', description: 'Innovative problem-solving approaches', category: 'Creativity' },
  ],
  cursor: [
    { id: 'acp', name: 'ACP Protocol', description: 'Communicates via Agent Client Protocol', category: 'Protocol' },
    { id: 'coding', name: 'Code Generation', description: 'AI-powered code editing and generation', category: 'Development' },
  ],
  copilot: [
    { id: 'acp', name: 'ACP Protocol', description: 'Communicates via Agent Client Protocol', category: 'Protocol' },
    { id: 'coding', name: 'Code Completion', description: 'Context-aware code suggestions and generation', category: 'Development' },
  ],
  pi: [
    { id: 'rpc', name: 'RPC Protocol', description: 'Communicates via JSON-RPC over stdio', category: 'Protocol' },
    { id: 'minimal', name: 'Minimal Agent', description: 'Lightweight terminal coding agent', category: 'Development' },
  ],
  opencode: [
    { id: 'acp', name: 'ACP Protocol', description: 'Communicates via Agent Client Protocol', category: 'Protocol' },
    { id: 'opensource', name: 'Open Source', description: 'Community-driven open-source coding agent', category: 'Development' },
  ],
  vibe: [
    { id: 'acp', name: 'ACP Protocol', description: 'Communicates via Agent Client Protocol', category: 'Protocol' },
    { id: 'mistral', name: 'Mistral Models', description: 'Powered by Mistral AI models', category: 'AI' },
  ],
  amp: [
    { id: 'acp', name: 'ACP Protocol', description: 'Communicates via Agent Client Protocol', category: 'Protocol' },
    { id: 'sourcegraph', name: 'Code Intelligence', description: 'Sourcegraph-powered code intelligence', category: 'Development' },
  ],
}

export function getAgentId(nameOrDisplay?: string | null): string {
  if (!nameOrDisplay) return 'claude'
  const lower = String(nameOrDisplay).toLowerCase()
  const fromDisplay = DISPLAY_TO_ID[nameOrDisplay]
  if (fromDisplay) return fromDisplay
  if (allowedAgentIds.includes(lower as any)) return lower
  return lower
}

export function getAgentDisplayById(id: string): string {
  const normalized = id.toLowerCase()
  const agent = AGENTS.find((a) => a.id === normalized || a.name === normalized)
  if (agent) return agent.displayName
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function getCommandTargetAgentDisplay(inputValue?: string | null): string | null {
  if (!inputValue || !inputValue.startsWith('/')) return null

  const [rawCommand] = inputValue.trim().split(/\s+/, 1)
  const command = rawCommand?.slice(1).toLowerCase()

  if (!command) return null
  return AGENT_COMMAND_TO_DISPLAY[command] ?? null
}

export function normalizeDefaultAgentId(value?: string | null): DefaultCliAgentId {
  if (!value) return 'claude'
  const normalized = value.toLowerCase() as DefaultCliAgentId
  return DEFAULT_CLI_AGENT_IDS.includes(normalized) ? normalized : 'claude'
}

export const DEFAULT_CLI_AGENT_OPTIONS = DEFAULT_CLI_AGENT_IDS.map((id) => {
  const agent = AGENTS.find((a) => a.id === id)
  return {
    id,
    label: agent ? agent.displayName : getAgentDisplayById(id),
    description: agent?.description ?? '',
  }
})

// ---------------------------------------------------------------------------
// Per-agent execution / permission mode registry
// ---------------------------------------------------------------------------

export interface AgentExecutionMode {
  value: string
  label: string
  description?: string
}

export interface AgentExecutionModeConfig {
  modes: AgentExecutionMode[]
  defaultMode: string
  /** Key name sent to the backend (e.g. 'executionMode', 'permissionMode', 'approvalMode') */
  backendParamName: string
  /** Show the "Advanced" unsafe-bypass checkbox (Codex only) */
  showDangerousToggle?: boolean
}

export const AGENT_EXECUTION_MODES: Record<string, AgentExecutionModeConfig> = {
  codex: {
    modes: [
      { value: 'chat', label: 'Chat (read-only)' },
      { value: 'collab', label: 'Agent (ask to execute)' },
      { value: 'full', label: 'Agent (full access)' },
    ],
    defaultMode: 'collab',
    backendParamName: 'executionMode',
    showDangerousToggle: true,
  },
  claude: {
    modes: [
      { value: 'plan', label: 'Plan (read-only)' },
      { value: 'acceptEdits', label: 'Accept Edits' },
      { value: 'bypassPermissions', label: 'Bypass Permissions' },
    ],
    defaultMode: 'acceptEdits',
    backendParamName: 'permissionMode',
  },
  gemini: {
    modes: [
      { value: 'default', label: 'Default' },
      { value: 'auto_edit', label: 'Auto Edit' },
      { value: 'yolo', label: 'YOLO (full access)' },
    ],
    defaultMode: 'default',
    backendParamName: 'approvalMode',
  },
  autohand: {
    modes: [
      { value: 'unrestricted', label: 'Unrestricted' },
      { value: 'interactive', label: 'Interactive' },
      { value: 'full-access', label: 'Full Access' },
      { value: 'auto-mode', label: 'Auto Mode' },
      { value: 'restricted', label: 'Restricted' },
      { value: 'dry-run', label: 'Dry Run' },
    ],
    defaultMode: 'unrestricted',
    backendParamName: 'permissionMode',
  },
  cursor: { modes: [], defaultMode: '', backendParamName: '' },
  copilot: { modes: [], defaultMode: '', backendParamName: '' },
  pi: { modes: [], defaultMode: '', backendParamName: '' },
  opencode: { modes: [], defaultMode: '', backendParamName: '' },
  vibe: { modes: [], defaultMode: '', backendParamName: '' },
  amp: { modes: [], defaultMode: '', backendParamName: '' },
  test: { modes: [], defaultMode: '', backendParamName: '' },
}

export function getAgentExecutionModes(agentId: string): AgentExecutionModeConfig | null {
  const config = AGENT_EXECUTION_MODES[agentId]
  if (!config || config.modes.length === 0) return null
  return config
}
