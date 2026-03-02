export interface NormalizedReasoning {
  id: string
  text: string
  durationSeconds?: number
}

export interface NormalizedWorkingStep {
  id: string
  label: string
  detail?: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  startedAt?: number
  finishedAt?: number
}

export interface NormalizedMeta {
  model?: string
  tokensUsed?: number
  command?: string
  success?: boolean
  provider?: string
  extra?: Record<string, string>
}

export interface NormalizedToolEvent {
  toolId: string
  toolName: string
  phase: 'start' | 'update' | 'end'
  args?: Record<string, unknown>
  output?: string
  success?: boolean
  durationMs?: number
}

export interface NormalizedContent {
  reasoning: NormalizedReasoning[]
  workingSteps: NormalizedWorkingStep[]
  answer: string
  meta: NormalizedMeta | null
  toolEvents: NormalizedToolEvent[]
  isStreaming: boolean
}
