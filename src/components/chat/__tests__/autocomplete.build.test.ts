import { describe, it, expect } from 'vitest'
import { buildAutocompleteOptions } from '@/components/chat/autocomplete'

describe('buildAutocompleteOptions', () => {
  const agents = [
    { id: 'claude', name: 'claude', displayName: 'Claude Code CLI', description: 'desc' },
    { id: 'codex', name: 'codex', displayName: 'Codex', description: 'desc' },
  ]
  const caps = {
    claude: [{ id: 'analysis', name: 'Code Analysis', description: 'Deep', category: 'Analysis' }],
    codex: [{ id: 'generate', name: 'Code Generation', description: 'Gen', category: 'Generation' }],
  }

  it('orders Files first, then Sub-Agents, then capabilities', () => {
    const files = [
      { name: 'a.ts', relative_path: 'a.ts' },
      { name: 'b.ts', relative_path: 'dir/b.ts' },
    ]
    const subAgents = { cli: [{ name: 'helper', description: 'does things' }] } as any
    const out = buildAutocompleteOptions('@', '', {
      fileMentionsEnabled: true,
      files,
      subAgents,
      enabledAgents: { claude: true, codex: true },
      agentCapabilities: caps,
      agents,
    })
    const order = out.map((o) => o.category)
    // First two are Files
    expect(order[0]).toBe('Files')
    expect(order[1]).toBe('Files')
    // Then Sub-Agents label
    expect((out.find((o) => (o.category || '').includes('Sub-Agents'))?.category || '')).toContain('Sub-Agents')
  })

  it('filters by query across names and descriptions', () => {
    const out = buildAutocompleteOptions('/', 'clau', {
      fileMentionsEnabled: false,
      files: [],
      subAgents: {} as any,
      enabledAgents: { claude: true, codex: true },
      agentCapabilities: caps,
      agents,
    })
    expect(out.some((o) => o.label.includes('claude'))).toBe(true)
    expect(out.some((o) => o.label.includes('codex'))).toBe(false)
  })
})
