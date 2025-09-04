import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

export function useAgentEnablement() {
  const [enabledAgents, setEnabledAgents] = useState<Record<string, boolean> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const map = await invoke<Record<string, boolean>>('load_agent_settings')
      setEnabledAgents(map)
      return map
    } catch (e) {
      setEnabledAgents(null)
      return null
    }
  }, [])

  const ensureEnabled = useCallback(async (agentId: string): Promise<boolean> => {
    if (!enabledAgents) {
      const map = await refresh()
      return map ? map[agentId] !== false : false
    }
    return enabledAgents[agentId] !== false
  }, [enabledAgents, refresh])

  return { enabledAgents, ensureEnabled, refresh }
}

