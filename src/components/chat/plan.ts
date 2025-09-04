import { invoke as tauriInvoke } from '@tauri-apps/api/core'

export interface PlanStep {
  id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed'
  estimatedTime?: string
  dependencies?: string[]
  details?: string
}

export interface Plan {
  id: string
  title: string
  description: string
  steps: PlanStep[]
  progress: number
  isGenerating?: boolean
}

export async function generatePlan(
  userInput: string,
  opts?: { invoke?: (cmd: string, args?: any) => Promise<any> }
): Promise<Plan> {
  const invoke = opts?.invoke ?? tauriInvoke

  let systemPrompt = `You are an expert project planner. Break down the user's request into clear, actionable steps. 

For each step, provide:
1. A clear title (what needs to be done)
2. A brief description (how to do it)
3. Estimated time (be realistic)
4. Dependencies (if any)
5. Detailed implementation notes

Format your response as JSON:
{
  "title": "Plan title",
  "description": "Brief description of what this plan accomplishes", 
  "steps": [
    {
      "id": "step-1",
      "title": "Step title",
      "description": "Brief description",
      "estimatedTime": "5 minutes",
      "dependencies": ["step-0"],
      "details": "Detailed implementation notes and considerations"
    }
  ]
}

Make the plan comprehensive but practical. Focus on implementation steps that can be executed by AI coding assistants.`

  try {
    const promptsConfig = await invoke<any>('load_prompts')
    const planSystemPrompt = promptsConfig?.prompts?.plan_mode?.system?.content
    if (planSystemPrompt) {
      systemPrompt = planSystemPrompt
    }
  } catch {
    // ignore prompt load failures
  }

  try {
    const response = await invoke<string>('generate_plan', {
      prompt: userInput,
      systemPrompt,
    })
    const planData = JSON.parse(response)
    return {
      id: `plan-${Date.now()}`,
      title: planData.title,
      description: planData.description,
      steps: (planData.steps || []).map((step: any) => ({
        ...step,
        status: 'pending' as const,
      })),
      progress: 0,
      isGenerating: false,
    }
  } catch (error) {
    const steps: PlanStep[] =
      userInput.split(' ').length > 10
        ? [
            {
              id: 'step-1',
              title: 'Analyze Requirements',
              description: 'Break down the user request and identify key components',
              status: 'pending',
              estimatedTime: '2 minutes',
              details: 'Review the user input and identify what needs to be implemented',
            },
            {
              id: 'step-2',
              title: 'Design Solution',
              description: 'Plan the implementation approach',
              status: 'pending',
              estimatedTime: '5 minutes',
              dependencies: ['step-1'],
              details: 'Define the architecture and approach for implementation',
            },
            {
              id: 'step-3',
              title: 'Implement Changes',
              description: 'Execute the planned solution',
              status: 'pending',
              estimatedTime: '10 minutes',
              dependencies: ['step-2'],
              details: 'Write code and make necessary changes',
            },
          ]
        : [
            {
              id: 'step-1',
              title: 'Execute Request',
              description: userInput,
              status: 'pending',
              estimatedTime: '3 minutes',
              details: 'Simple request that can be executed directly',
            },
          ]

    return {
      id: `plan-${Date.now()}`,
      title: 'Generated Plan',
      description: `Plan for: ${userInput}`,
      steps,
      progress: 0,
      isGenerating: false,
    }
  }
}

