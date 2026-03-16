import { AGENTS } from '@/components/chat/agents'

export type AgentTransportKind = 'cli-flags' | 'slash-commands' | 'json-rpc' | 'acp'
export type AgentPromptMode = 'flag' | 'slash' | 'protocol'

export interface CapabilityDescriptor {
  source: string
  hint: string
  fetchModels?: boolean
  autoFetch?: boolean
}

export interface AgentCapabilityMap {
  model?: CapabilityDescriptor | null
  output_format?: CapabilityDescriptor | null
  session_timeout_minutes?: CapabilityDescriptor | null
  max_tokens?: CapabilityDescriptor | null
  temperature?: CapabilityDescriptor | null
  sandbox_mode?: CapabilityDescriptor | null
  auto_approval?: CapabilityDescriptor | null
  debug_mode?: CapabilityDescriptor | null
}

export interface BuiltInAgentProfile {
  id: string
  label: string
  shortLabel: string
  description: string
  command: string
  transport: AgentTransportKind
  promptMode: AgentPromptMode
  protocol?: 'rpc' | 'acp' | 'hybrid'
  capabilities: AgentCapabilityMap
  specialView?: 'autohand'
}

export interface CustomAgentDefinition {
  id: string
  name: string
  command: string
  transport: AgentTransportKind
  protocol?: 'rpc' | 'acp'
  prompt_mode: AgentPromptMode
  supports_model: boolean
  supports_output_format: boolean
  supports_session_timeout: boolean
  supports_max_tokens: boolean
  supports_temperature: boolean
  supports_sandbox_mode: boolean
  supports_auto_approval: boolean
  supports_debug_mode: boolean
  settings: {
    enabled?: boolean
    model?: string | null
    output_format?: string
    session_timeout_minutes?: number
    max_tokens?: number | null
    temperature?: number | null
    sandbox_mode?: boolean
    auto_approval?: boolean
    debug_mode?: boolean
  }
}

export const BUILTIN_AGENT_PROFILES: BuiltInAgentProfile[] = [
  {
    id: 'autohand',
    label: 'Autohand Code',
    shortLabel: 'Autohand',
    description: 'Protocol-first agent with dedicated JSON-RPC and ACP configuration.',
    command: 'autohand',
    transport: 'json-rpc',
    promptMode: 'protocol',
    protocol: 'hybrid',
    capabilities: {},
    specialView: 'autohand',
  },
  {
    id: 'claude',
    label: 'Claude Code CLI',
    shortLabel: 'Claude',
    description: 'Configured through standard Claude CLI flags.',
    command: 'claude',
    transport: 'cli-flags',
    promptMode: 'flag',
    capabilities: {
      model: {
        source: '--model',
        hint: 'Commander passes the selected model through Claude CLI flags.',
        fetchModels: true,
        autoFetch: true,
      },
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    shortLabel: 'Codex',
    description: 'Supports ACP via codex-acp and CLI flags via standard codex.',
    command: 'codex',
    transport: 'acp',
    promptMode: 'protocol',
    protocol: 'acp',
    capabilities: {
      model: {
        source: '--model',
        hint: 'Commander forwards model selection to the Codex agent.',
        fetchModels: true,
      },
    },
  },
  {
    id: 'gemini',
    label: 'Gemini',
    shortLabel: 'Gemini',
    description: 'Configured through Gemini CLI flags with approval mode chosen at runtime.',
    command: 'gemini',
    transport: 'cli-flags',
    promptMode: 'flag',
    capabilities: {
      model: {
        source: '--model',
        hint: 'Commander forwards model selection to the Gemini CLI.',
        fetchModels: true,
      },
    },
  },
]

export const BUILTIN_AGENT_IDS = BUILTIN_AGENT_PROFILES.map((profile) => profile.id)

export function getBuiltInAgentProfile(agentId: string): BuiltInAgentProfile | undefined {
  return BUILTIN_AGENT_PROFILES.find((profile) => profile.id === agentId)
}

export function defaultCustomAgentDefinition(): CustomAgentDefinition {
  return {
    id: '',
    name: '',
    command: '',
    transport: 'json-rpc',
    protocol: 'rpc',
    prompt_mode: 'protocol',
    supports_model: true,
    supports_output_format: false,
    supports_session_timeout: false,
    supports_max_tokens: false,
    supports_temperature: false,
    supports_sandbox_mode: false,
    supports_auto_approval: false,
    supports_debug_mode: true,
    settings: {
      enabled: true,
      model: '',
      output_format: 'markdown',
      session_timeout_minutes: 30,
      max_tokens: null,
      temperature: null,
      sandbox_mode: false,
      auto_approval: false,
      debug_mode: false,
    },
  }
}

export function customAgentCapabilities(agent: CustomAgentDefinition): AgentCapabilityMap {
  const source =
    agent.transport === 'json-rpc'
      ? 'JSON-RPC'
      : agent.transport === 'acp'
        ? 'ACP'
        : agent.transport === 'slash-commands'
          ? 'Slash commands'
          : 'CLI flags'

  const capability = (enabled: boolean, label: string): CapabilityDescriptor | null =>
    enabled
      ? {
          source,
          hint: `${label} is configured through the selected ${source.toLowerCase()} transport.`,
        }
      : null

  return {
    model: capability(agent.supports_model, 'Model'),
    output_format: capability(agent.supports_output_format, 'Output format'),
    session_timeout_minutes: capability(agent.supports_session_timeout, 'Session timeout'),
    max_tokens: capability(agent.supports_max_tokens, 'Max tokens'),
    temperature: capability(agent.supports_temperature, 'Temperature'),
    sandbox_mode: capability(agent.supports_sandbox_mode, 'Sandbox mode'),
    auto_approval: capability(agent.supports_auto_approval, 'Auto approval'),
    debug_mode: capability(agent.supports_debug_mode, 'Debug mode'),
  }
}

export function defaultEnabledAgentsMap(): Record<string, boolean> {
  return Object.fromEntries(BUILTIN_AGENT_IDS.map((id) => [id, true]))
}

export function getAgentShortLabel(id: string): string {
  const builtIn = getBuiltInAgentProfile(id)
  if (builtIn) return builtIn.shortLabel
  const fromAgent = AGENTS.find((agent) => agent.id === id)
  if (fromAgent) return fromAgent.displayName
  return id
}
