import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  parseAutohandHooks,
  validateAutohandHook,
  type HookDefinition as SchemaHookDefinition,
} from '@/lib/autohand-config-schema'

export type HookDefinition = SchemaHookDefinition

export function useAutohandHooks(workingDir: string | null) {
  const [hooks, setHooks] = useState<HookDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHooks = useCallback(async () => {
    if (!workingDir) return
    setLoading(true)
    try {
      const result = await invoke<unknown[]>('get_autohand_hooks', { workingDir })
      setHooks(parseAutohandHooks(result))
      setError(null)
    } catch {
      setHooks([])
      setError('Failed to load hooks.')
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  const saveHook = useCallback(
    async (hook: HookDefinition) => {
      if (!workingDir) return
      const validation = validateAutohandHook(hook)
      if (!validation.success) {
        setError(`Invalid hook configuration: ${validation.error}`)
        return
      }
      await invoke('save_autohand_hook', { workingDir, hook: validation.data })
      setError(null)
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  const deleteHook = useCallback(
    async (hookId: string) => {
      if (!workingDir) return
      await invoke('delete_autohand_hook', { workingDir, hookId })
      setError(null)
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  const toggleHook = useCallback(
    async (hookId: string, enabled: boolean) => {
      if (!workingDir) return
      await invoke('toggle_autohand_hook', { workingDir, hookId, enabled })
      setError(null)
      await loadHooks()
    },
    [workingDir, loadHooks]
  )

  useEffect(() => {
    loadHooks()
  }, [loadHooks])

  return { hooks, loading, error, loadHooks, saveHook, deleteHook, toggleHook }
}
