import type { Plan } from './plan'

export interface ChatMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: number
  agent: string
  isStreaming?: boolean
  plan?: Plan
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
