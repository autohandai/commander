import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface HookDefinition {
  id: string
  event: string
  command: string
  pattern?: string
  enabled: boolean
  description?: string
}

export function useAutohandHooks(workingDir: string | null) {
  const [hooks, setHooks] = useState<HookDefinition[]>([])
  const [loading, setLoading] = useState(false)

  const loadHooks = useCallback(async () => {
    if (!workingDir) return
    setLoading(true)
    try {
      const result = await invoke<HookDefinition[]>('get_autohand_hooks', { workingDir })
      setHooks(result)
    } catch {
      setHooks([])
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  const saveHook = useCallback(
    async (hook: HookDefinition) => {
      if (!workingDir) return
      await invoke('save_autohand_hook', { workingDir, hook })
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  const deleteHook = useCallback(
    async (hookId: string) => {
      if (!workingDir) return
      await invoke('delete_autohand_hook', { workingDir, hookId })
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  const toggleHook = useCallback(
    async (hookId: string, enabled: boolean) => {
      if (!workingDir) return
      await invoke('toggle_autohand_hook', { workingDir, hookId, enabled })
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  useEffect(() => {
    loadHooks()
  }, [loadHooks])

  return { hooks, loading, loadHooks, saveHook, deleteHook, toggleHook }
}
