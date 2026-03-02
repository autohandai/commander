import { cn } from '@/lib/utils'

type AgentId = 'claude' | 'codex' | 'autohand' | 'gemini' | 'ollama' | 'user'

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
  ollama: {
    accent: 'text-slate-500',
    bg: 'bg-slate-500/10',
    text: 'text-slate-400',
    border: 'border-slate-500/30',
    gradient: 'from-slate-500 to-gray-600',
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
