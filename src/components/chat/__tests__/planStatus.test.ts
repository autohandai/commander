import { describe, it, expect } from 'vitest'
import { setStepStatus, updateMessagesPlanStep } from '@/components/chat/planStatus'

const plan = {
  id: 'p',
  title: 't',
  description: 'd',
  steps: [
    { id: 'a', title: 'A', description: 'A', status: 'pending' as const },
    { id: 'b', title: 'B', description: 'B', status: 'pending' as const },
  ],
  progress: 0,
}

describe('planStatus utils', () => {
  it('setStepStatus updates a single step', () => {
    const updated = setStepStatus(plan as any, 'a', 'in_progress')
    expect(updated.steps[0].status).toBe('in_progress')
    expect(updated.steps[1].status).toBe('pending')
  })

  it('updateMessagesPlanStep maps plans within messages', () => {
    const messages = [
      { id: '1', content: '', role: 'assistant', timestamp: 0, agent: 'claude', plan: plan as any },
      { id: '2', content: 'hi', role: 'user', timestamp: 0, agent: 'claude' },
    ]
    const res = updateMessagesPlanStep(messages as any, 'b', 'completed')
    const assistant = res[0]
    expect(assistant.plan.steps[0].status).toBe('pending')
    expect(assistant.plan.steps[1].status).toBe('completed')
  })
})

