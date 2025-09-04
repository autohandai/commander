import { useCallback } from 'react'
import { buildAutocompleteOptions, AutocompleteOption } from '@/components/chat/autocomplete'
import type { SubAgentGroup } from '@/types/sub-agent'

export interface FileEntryLike {
  name: string
  relative_path: string
  is_directory?: boolean
}

interface UseChatAutocompleteParams {
  enabledAgents: Record<string, boolean> | null
  agents: { id: string; name: string; displayName: string; icon?: any; description?: string }[]
  agentCapabilities: Record<string, { id: string; name: string; description: string; category: string }[]>
  fileMentionsEnabled: boolean
  projectPath?: string
  files: FileEntryLike[]
  subAgents: SubAgentGroup
  listFiles: (opts: { directory_path: string; extensions: string[]; max_depth: number }) => Promise<void>
  searchFiles: (
    query: string,
    opts: { directory_path: string; extensions: string[]; max_depth: number }
  ) => Promise<void>
  codeExtensions: string[]
  setOptions: (options: AutocompleteOption[]) => void
  setSelectedIndex: (i: number) => void
  setShow: (show: boolean) => void
}

export function useChatAutocomplete(params: UseChatAutocompleteParams) {
  const updateAutocomplete = useCallback(
    async (value: string, cursorPos: number) => {
      const beforeCursor = value.slice(0, cursorPos)
      const match = beforeCursor.match(/([/@])([^\s]*)$/)
      if (!match) {
        params.setShow(false)
        return
      }
      const [, command, query] = match

      // If @ and project available, sync files list based on query
      if (command === '@' && params.fileMentionsEnabled && params.projectPath) {
        try {
          if (query) {
            await params.searchFiles(query, {
              directory_path: params.projectPath,
              extensions: [...params.codeExtensions],
              max_depth: 3,
            })
          } else {
            await params.listFiles({
              directory_path: params.projectPath,
              extensions: [...params.codeExtensions],
              max_depth: 2,
            })
          }
        } catch {
          // ignore file scanning errors
        }
      }

      const options = buildAutocompleteOptions(command as '/' | '@', query || '', {
        fileMentionsEnabled: params.fileMentionsEnabled,
        projectName: undefined,
        files: params.files,
        subAgents: params.subAgents,
        enabledAgents: params.enabledAgents,
        agentCapabilities: params.agentCapabilities,
        agents: params.agents,
      })

      params.setOptions(options)
      params.setSelectedIndex(0)
      params.setShow(options.length > 0)
    },
    [
      params.enabledAgents,
      params.fileMentionsEnabled,
      params.projectPath,
      params.files,
      params.subAgents,
      params.agentCapabilities,
      params.agents,
      params.codeExtensions,
      params.listFiles,
      params.searchFiles,
      params.setOptions,
      params.setSelectedIndex,
      params.setShow,
    ]
  )

  return { updateAutocomplete }
}
