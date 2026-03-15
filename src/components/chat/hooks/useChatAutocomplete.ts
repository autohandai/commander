import { useCallback, useEffect, useRef } from 'react'
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
  const pendingLookupRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduledLookupKeyRef = useRef<string | null>(null)

  const clearPendingLookup = useCallback(() => {
    if (pendingLookupRef.current) {
      clearTimeout(pendingLookupRef.current)
      pendingLookupRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearPendingLookup()
    }
  }, [clearPendingLookup])

  const updateAutocomplete = useCallback(
    async (value: string, cursorPos: number) => {
      const beforeCursor = value.slice(0, cursorPos)
      const match = beforeCursor.match(/([/@])([^\s]*)$/)
      if (!match) {
        clearPendingLookup()
        scheduledLookupKeyRef.current = null
        params.setShow(false)
        return
      }
      const [, command, query] = match

      // Build the visible options immediately from current in-memory results,
      // then refresh file-backed results in the background if needed.
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

      // If @ and project available, debounce file scans so typing does not flood Tauri.
      if (command === '@' && params.fileMentionsEnabled && params.projectPath) {
        const lookupKey = query
          ? `search:${params.projectPath}:${query}`
          : `list:${params.projectPath}`

        if (scheduledLookupKeyRef.current !== lookupKey) {
          clearPendingLookup()
          scheduledLookupKeyRef.current = lookupKey
          pendingLookupRef.current = setTimeout(() => {
            const runLookup = query
              ? params.searchFiles(query, {
                  directory_path: params.projectPath!,
                  extensions: [...params.codeExtensions],
                  max_depth: 3,
                })
              : params.listFiles({
                  directory_path: params.projectPath!,
                  extensions: [...params.codeExtensions],
                  max_depth: 2,
                })

            void runLookup.catch(() => {
              // ignore file scanning errors
            })
            pendingLookupRef.current = null
          }, 150)
        }
      } else {
        clearPendingLookup()
        scheduledLookupKeyRef.current = null
      }
    },
    [
      clearPendingLookup,
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
