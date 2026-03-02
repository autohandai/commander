import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

export interface McpServerConfig {
  name: string
  transport: string
  command?: string
  args: string[]
  url?: string
  env: Record<string, string>
  source?: string
  auto_connect: boolean
}

export function useAutohandMcpServers(workingDir: string | null) {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [loading, setLoading] = useState(false)

  const loadServers = useCallback(async () => {
    if (!workingDir) return
    setLoading(true)
    try {
      const result = await invoke<McpServerConfig[]>('get_autohand_mcp_servers', { workingDir })
      setServers(result)
    } catch {
      setServers([])
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  const saveServer = useCallback(
    async (server: McpServerConfig) => {
      if (!workingDir) return
      await invoke('save_autohand_mcp_server', { workingDir, server })
      await loadServers()
    },
    [workingDir, loadServers]
  )

  const deleteServer = useCallback(
    async (serverName: string) => {
      if (!workingDir) return
      await invoke('delete_autohand_mcp_server', { workingDir, serverName })
      await loadServers()
    },
    [workingDir, loadServers]
  )

  useEffect(() => {
    loadServers()
  }, [loadServers])

  return { servers, loading, loadServers, saveServer, deleteServer }
}
