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

export const allowedAgentIds = ['autohand', 'claude', 'codex', 'gemini', 'ollama', 'test'] as const

export type AllowedAgentId = typeof allowedAgentIds[number]
export const DEFAULT_CLI_AGENT_IDS = ['autohand', 'claude', 'codex', 'gemini'] as const
export type DefaultCliAgentId = typeof DEFAULT_CLI_AGENT_IDS[number]

export const DISPLAY_TO_ID: Record<string, string> = {
  'Autohand Code': 'autohand',
  'Claude Code CLI': 'claude',
  'Codex': 'codex',
  'Gemini': 'gemini',
  'Ollama': 'ollama',
  'Test CLI': 'test',
}

export const AGENT_COMMAND_TO_DISPLAY: Record<string, string> = {
  autohand: 'Autohand Code',
  claude: 'Claude Code CLI',
  codex: 'Codex',
  gemini: 'Gemini',
  ollama: 'Ollama',
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
    id: 'ollama',
    name: 'ollama',
    displayName: 'Ollama',
    icon: Bot,
    description: 'Local-first models served through the Ollama runtime',
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
  ollama: [
    { id: 'local', name: 'Local Execution', description: 'Runs models locally via the Ollama runtime', category: 'Offline' },
    { id: 'custom', name: 'Custom Models', description: 'Switch between downloaded Ollama models', category: 'Configuration' },
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
  ollama: { modes: [], defaultMode: '', backendParamName: '' },
  test: { modes: [], defaultMode: '', backendParamName: '' },
}

export function getAgentExecutionModes(agentId: string): AgentExecutionModeConfig | null {
  const config = AGENT_EXECUTION_MODES[agentId]
  if (!config || config.modes.length === 0) return null
  return config
}
