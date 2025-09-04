import { describe, it, expect } from 'vitest'
import { generatePlan } from '@/components/chat/plan'

describe('generatePlan', () => {
  it('parses JSON response and marks steps pending', async () => {
    const planJson = JSON.stringify({
      title: 'Test Plan',
      description: 'Do things',
      steps: [
        { id: 's1', title: 'One', description: 'First' },
        { id: 's2', title: 'Two', description: 'Second' },
      ],
    })
    const plan = await generatePlan('anything', {
      invoke: async (cmd: string) => {
        if (cmd === 'load_prompts') return { prompts: {} }
        if (cmd === 'generate_plan') return planJson
        return null as any
      },
    })
    expect(plan.title).toBe('Test Plan')
    expect(plan.steps.length).toBe(2)
    expect(plan.steps[0].status).toBe('pending')
  })

  it('falls back to heuristic plan when invoke fails', async () => {
    const plan = await generatePlan('short', {
      invoke: async () => {
        throw new Error('nope')
      },
    })
    expect(plan.title).toBe('Generated Plan')
    expect(plan.steps.length).toBe(1)
    expect(plan.steps[0].status).toBe('pending')
  })
})

