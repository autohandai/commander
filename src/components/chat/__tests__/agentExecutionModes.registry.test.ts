import { describe, it, expect } from 'vitest'
import {
  AGENT_EXECUTION_MODES,
  getAgentExecutionModes,
  DEFAULT_CLI_AGENT_IDS,
} from '@/components/chat/agents'

describe('AGENT_EXECUTION_MODES registry', () => {
  it('has an entry for every agent in DEFAULT_CLI_AGENT_IDS', () => {
    for (const id of DEFAULT_CLI_AGENT_IDS) {
      expect(AGENT_EXECUTION_MODES).toHaveProperty(id)
    }
  })

  it('each defaultMode exists in its modes array', () => {
    for (const [id, config] of Object.entries(AGENT_EXECUTION_MODES)) {
      if (config.modes.length === 0) continue
      const values = config.modes.map((m) => m.value)
      expect(values, `${id} defaultMode "${config.defaultMode}" not in modes`).toContain(
        config.defaultMode
      )
    }
  })

  it('autohand defaults to unrestricted', () => {
    expect(AGENT_EXECUTION_MODES.autohand.defaultMode).toBe('unrestricted')
  })

  it('codex has showDangerousToggle', () => {
    expect(AGENT_EXECUTION_MODES.codex.showDangerousToggle).toBe(true)
  })

  it('claude does not have showDangerousToggle', () => {
    expect(AGENT_EXECUTION_MODES.claude.showDangerousToggle).toBeUndefined()
  })

  it('getAgentExecutionModes returns null for agents with no modes', () => {
    expect(getAgentExecutionModes('ollama')).toBeNull()
    expect(getAgentExecutionModes('test')).toBeNull()
  })

  it('getAgentExecutionModes returns config for agents with modes', () => {
    const config = getAgentExecutionModes('autohand')
    expect(config).not.toBeNull()
    expect(config!.modes.length).toBeGreaterThan(0)
    expect(config!.defaultMode).toBe('unrestricted')
  })

  it('getAgentExecutionModes returns null for unknown agent', () => {
    expect(getAgentExecutionModes('nonexistent')).toBeNull()
  })
})
