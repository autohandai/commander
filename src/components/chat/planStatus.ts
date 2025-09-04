import type { Plan } from './plan'
import type { ChatMessage } from './types'

export function setStepStatus(plan: Plan, stepId: string, status: 'pending' | 'in_progress' | 'completed'): Plan {
  return {
    ...plan,
    steps: plan.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
  }
}

export function updateMessagesPlanStep(
  messages: ChatMessage[],
  stepId: string,
  status: 'pending' | 'in_progress' | 'completed'
): ChatMessage[] {
  return messages.map((msg) =>
    msg.plan
      ? {
          ...msg,
          plan: {
            ...msg.plan,
            steps: msg.plan.steps.map((s) => (s.id === stepId ? { ...s, status } : s)),
          },
        }
      : msg
  )
}

