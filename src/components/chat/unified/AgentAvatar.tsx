import { cn } from '@/lib/utils'

type AgentId = 'claude' | 'codex' | 'autohand' | 'gemini' | 'cursor' | 'copilot' | 'pi' | 'opencode' | 'vibe' | 'amp' | 'ollama' | 'user'

interface AgentColorConfig {
  accent: string
  bg: string
  text: string
  border: string
  gradient: string
}

const AGENT_COLORS: Record<AgentId, AgentColorConfig> = {
  claude: {
    accent: 'text-violet-500',
    bg: 'bg-violet-500/10',
    text: 'text-violet-400',
    border: 'border-violet-500/30',
    gradient: 'from-violet-500 to-purple-600',
  },
  codex: {
    accent: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    gradient: 'from-emerald-500 to-green-600',
  },
  autohand: {
    accent: 'text-blue-500',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    gradient: 'from-blue-500 to-cyan-600',
  },
  gemini: {
    accent: 'text-amber-500',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    gradient: 'from-amber-500 to-orange-600',
  },
  cursor: {
    accent: 'text-cyan-500',
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    gradient: 'from-cyan-500 to-teal-600',
  },
  copilot: {
    accent: 'text-sky-500',
    bg: 'bg-sky-500/10',
    text: 'text-sky-400',
    border: 'border-sky-500/30',
    gradient: 'from-sky-500 to-blue-600',
  },
  pi: {
    accent: 'text-rose-500',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/30',
    gradient: 'from-rose-500 to-pink-600',
  },
  opencode: {
    accent: 'text-lime-500',
    bg: 'bg-lime-500/10',
    text: 'text-lime-400',
    border: 'border-lime-500/30',
    gradient: 'from-lime-500 to-green-600',
  },
  vibe: {
    accent: 'text-orange-500',
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/30',
    gradient: 'from-orange-500 to-red-600',
  },
  amp: {
    accent: 'text-indigo-500',
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'border-indigo-500/30',
    gradient: 'from-indigo-500 to-violet-600',
  },
  ollama: {
    accent: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    gradient: 'from-emerald-500 to-teal-600',
  },
  user: {
    accent: 'text-zinc-400',
    bg: 'bg-zinc-400/10',
    text: 'text-zinc-300',
    border: 'border-zinc-400/30',
    gradient: 'from-zinc-400 to-zinc-500',
  },
}

const DEFAULT_COLORS: AgentColorConfig = {
  accent: 'text-gray-500',
  bg: 'bg-gray-500/10',
  text: 'text-gray-400',
  border: 'border-gray-500/30',
  gradient: 'from-gray-500 to-gray-600',
}

const AGENT_LABELS: Record<AgentId, string> = {
  claude: 'Claude',
  codex: 'Codex',
  autohand: 'Autohand',
  gemini: 'Gemini',
  cursor: 'Cursor',
  copilot: 'Copilot',
  pi: 'Pi',
  opencode: 'OpenCode',
  vibe: 'Vibestral',
  amp: 'Amp',
  ollama: 'Ollama',
  user: 'You',
}

function isKnownAgent(id: string): id is AgentId {
  return id in AGENT_COLORS
}

export function getAgentColor(agentId: string): { accent: string; bg: string; text: string; border: string } {
  if (isKnownAgent(agentId)) {
    const { accent, bg, text, border } = AGENT_COLORS[agentId]
    return { accent, bg, text, border }
  }
  const { accent, bg, text, border } = DEFAULT_COLORS
  return { accent, bg, text, border }
}

export function getAgentLabel(agentId: string): string {
  if (isKnownAgent(agentId)) {
    return AGENT_LABELS[agentId]
  }
  return agentId.charAt(0).toUpperCase() + agentId.slice(1)
}

interface AgentAvatarProps {
  agentId: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZE_CLASSES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
} as const

export function AgentAvatar({ agentId, size = 'md', className }: AgentAvatarProps) {
  const colors = isKnownAgent(agentId) ? AGENT_COLORS[agentId] : DEFAULT_COLORS
  const label = getAgentLabel(agentId)
  const letter = label.charAt(0).toUpperCase()

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white',
        colors.gradient,
        SIZE_CLASSES[size],
        className,
      )}
      title={label}
      aria-label={label}
    >
      {letter}
    </div>
  )
}
