import { parseAgentTranscript } from '../agent_transcript'
import { parseCodexContent } from '../codex/CodexRenderer'
import type { NormalizedContent, NormalizedWorkingStep } from './types'

interface MessageShape {
  isStreaming?: boolean
  steps?: {
    id: string
    label: string
    detail?: string
    status: 'pending' | 'in_progress' | 'completed' | 'failed'
    startedAt?: number
    finishedAt?: number
  }[]
  toolEvents?: {
    tool_id: string
    tool_name: string
    phase: 'start' | 'update' | 'end'
    args?: Record<string, unknown>
    output?: string
    success?: boolean
    duration_ms?: number
  }[]
}

function stepsToWorkingSteps(
  steps?: MessageShape['steps']
): NormalizedWorkingStep[] {
  if (!steps) return []
  return steps.map((s) => ({
    id: s.id,
    label: s.label,
    detail: s.detail,
    status: s.status,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
  }))
}

function empty(isStreaming: boolean): NormalizedContent {
  return {
    reasoning: [],
    workingSteps: [],
    answer: '',
    meta: null,
    toolEvents: [],
    isStreaming,
  }
}

export function normalizeClaude(
  content: string,
  message: MessageShape
): NormalizedContent {
  const streaming = message.isStreaming ?? false
  const parsed = parseAgentTranscript(content)

  if (!parsed) {
    // Fallback: treat raw content as markdown answer
    return {
      ...empty(streaming),
      answer: content,
      workingSteps: stepsToWorkingSteps(message.steps),
    }
  }

  const reasoning = parsed.thinking
    ? [{ id: 'thinking-0', text: parsed.thinking }]
    : []

  const answer = parsed.answer || ''

  // Filter out working steps whose text duplicates the answer (common with
  // Claude stream-json where the same text appears as a Working bullet AND
  // in the Answer section from the result event).
  const filteredWorking = answer
    ? (parsed.working ?? []).filter((label) => label !== answer)
    : (parsed.working ?? [])

  const workingSteps: NormalizedWorkingStep[] =
    filteredWorking.map((label, i) => ({
      id: `working-${i}`,
      label,
      status: 'completed' as const,
    }))

  const meta = (parsed.meta || parsed.header || typeof parsed.tokensUsed === 'number' || parsed.success)
    ? {
        model: parsed.meta?.model,
        command: parsed.header?.command,
        tokensUsed: parsed.tokensUsed,
        success: parsed.success,
        provider: parsed.meta?.provider,
        extra: parsed.meta,
      }
    : null

  return {
    reasoning,
    workingSteps,
    answer,
    meta,
    toolEvents: [],
    isStreaming: streaming,
  }
}

export function normalizeCodex(
  content: string,
  message: MessageShape
): NormalizedContent {
  const streaming = message.isStreaming ?? false
  const parsed = parseCodexContent(content)

  const reasoning = parsed.reasoning.map((text, i) => ({
    id: `reasoning-${i}`,
    text,
  }))

  return {
    reasoning,
    workingSteps: stepsToWorkingSteps(message.steps),
    answer: parsed.response,
    meta: null,
    toolEvents: [],
    isStreaming: streaming,
  }
}

export function normalizeAutohand(
  content: string,
  message: MessageShape
): NormalizedContent {
  const streaming = message.isStreaming ?? false

  const toolEvents = (message.toolEvents ?? []).map((e) => ({
    toolId: e.tool_id,
    toolName: e.tool_name,
    phase: e.phase,
    args: e.args,
    output: e.output,
    success: e.success,
    durationMs: e.duration_ms,
  }))

  return {
    reasoning: [],
    workingSteps: stepsToWorkingSteps(message.steps),
    answer: content,
    meta: null,
    toolEvents,
    isStreaming: streaming,
  }
}

export function normalizeGeneric(
  content: string,
  message: MessageShape
): NormalizedContent {
  const streaming = message.isStreaming ?? false
  return {
    ...empty(streaming),
    answer: content,
    workingSteps: stepsToWorkingSteps(message.steps),
  }
}

type Normalizer = (content: string, message: MessageShape) => NormalizedContent

const NORMALIZER_MAP: Record<string, Normalizer> = {
  claude: normalizeClaude,
  codex: normalizeCodex,
  autohand: normalizeAutohand,
}

export function getNormalizer(agentId: string): Normalizer {
  return NORMALIZER_MAP[agentId] ?? normalizeGeneric
}
