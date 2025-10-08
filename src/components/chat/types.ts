import type { Plan } from './plan'

export interface ChatMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: number
  agent: string
  isStreaming?: boolean
  plan?: Plan
  conversationId?: string
  steps?: TimelineStep[]
  status?: 'thinking' | 'running' | 'completed' | 'failed'
}

export interface TimelineStep {
  id: string
  label: string
  detail?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  startedAt?: number
  finishedAt?: number
}

export interface CLISession {
  id: string
  agent: string
  command?: string
  working_dir?: string
  is_active?: boolean
  created_at?: number
  last_activity?: number
}

export interface SessionStatus {
  active_sessions: CLISession[]
  total_sessions: number
}
