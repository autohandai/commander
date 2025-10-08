import { Bot, Code, Brain } from 'lucide-react'

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

export const allowedAgentIds = ['claude', 'codex', 'gemini', 'ollama', 'test'] as const

export type AllowedAgentId = typeof allowedAgentIds[number]
export const DEFAULT_CLI_AGENT_IDS = ['claude', 'codex', 'gemini', 'ollama'] as const
export type DefaultCliAgentId = typeof DEFAULT_CLI_AGENT_IDS[number]

export const DISPLAY_TO_ID: Record<string, string> = {
  'Claude Code CLI': 'claude',
  'Codex': 'codex',
  'Gemini': 'gemini',
  'Ollama': 'ollama',
  'Test CLI': 'test',
}

export const AGENTS: Agent[] = [
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
