import type { SubAgentGroup } from '@/types/sub-agent'

export interface AutocompleteOption {
  id: string
  label: string
  description: string
  icon?: any
  category?: string
  filePath?: string
}

interface FileEntryLike {
  name: string
  relative_path: string
  is_directory?: boolean
}

export function buildAutocompleteOptions(
  command: '/' | '@',
  query: string,
  opts: {
    fileMentionsEnabled: boolean
    projectName?: string
    files: FileEntryLike[]
    subAgents: SubAgentGroup
    enabledAgents?: Record<string, boolean> | null
    agentCapabilities: Record<string, { id: string; name: string; description: string; category: string }[]>
    agents: { id: string; displayName: string; name: string; icon?: any; description?: string }[]
  }
): AutocompleteOption[] {
  if (command === '/') {
    return opts.agents
      .filter((a) => !opts.enabledAgents || opts.enabledAgents[a.id] !== false)
      .filter(
        (a) =>
          query === '' ||
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          a.displayName.toLowerCase().includes(query.toLowerCase())
      )
      .map((a) => ({ id: a.id, label: a.name, description: a.description || '', icon: a.icon, category: 'Agents' }))
  }

  const all: AutocompleteOption[] = []

  if (opts.fileMentionsEnabled) {
    const fileOptions = opts.files
      .filter((f) => !f.is_directory)
      .slice(0, 10)
      .map((f) => ({
        id: `file-${f.relative_path}`,
        label: f.name,
        description: f.relative_path,
        category: 'Files',
        filePath: f.relative_path,
      }))
    all.push(...fileOptions)
  }

  Object.entries(opts.subAgents).forEach(([cliName, agents]) => {
    agents
      .filter(
        (a) =>
          query === '' ||
          a.name.toLowerCase().includes(query.toLowerCase()) ||
          a.description.toLowerCase().includes(query.toLowerCase())
      )
      .forEach((a) => {
        all.push({
          id: `subagent-${cliName}-${a.name}`,
          label: `@${a.name}`,
          description: a.description.split('\n')[0].substring(0, 100),
          category: `${cliName.charAt(0).toUpperCase() + cliName.slice(1)} Sub-Agents`,
        })
      })
  })

  opts.agents
    .filter((a) => !opts.enabledAgents || opts.enabledAgents[a.id] !== false)
    .forEach((agent) => {
      const caps = opts.agentCapabilities[agent.id] || []
      caps
        .filter(
          (cap) =>
            query === '' ||
            cap.name.toLowerCase().includes(query.toLowerCase()) ||
            cap.description.toLowerCase().includes(query.toLowerCase()) ||
            agent.displayName.toLowerCase().includes(query.toLowerCase())
        )
        .forEach((cap) => {
          all.push({
            id: `capability-${agent.id}-${cap.id}`,
            label: `${cap.name} (${agent.displayName})`,
            description: cap.description,
            category: cap.category,
          })
        })
    })

  return all.sort((a, b) => {
    if (a.category === 'Files' && b.category !== 'Files') return -1
    if (a.category !== 'Files' && b.category === 'Files') return 1
    if ((a.category || '').includes('Sub-Agents') && !(b.category || '').includes('Sub-Agents')) return -1
    if (!(a.category || '').includes('Sub-Agents') && (b.category || '').includes('Sub-Agents')) return 1
    return a.label.localeCompare(b.label)
  })
}
