import { useState, useCallback, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  parseAutohandMcpServers,
  validateAutohandMcpServer,
  type McpServerConfig as SchemaMcpServerConfig,
} from '@/lib/autohand-config-schema'

export type McpServerConfig = SchemaMcpServerConfig

export function useAutohandMcpServers(workingDir: string | null) {
  const [servers, setServers] = useState<McpServerConfig[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadServers = useCallback(async () => {
    if (!workingDir) return
    setLoading(true)
    try {
      const result = await invoke<unknown[]>('get_autohand_mcp_servers', { workingDir })
      setServers(parseAutohandMcpServers(result))
      setError(null)
    } catch {
      setServers([])
      setError('Failed to load MCP servers.')
    } finally {
      setLoading(false)
    }
  }, [workingDir])

  const saveServer = useCallback(
    async (server: McpServerConfig) => {
      if (!workingDir) return
      const validation = validateAutohandMcpServer(server)
      if (!validation.success) {
        setError(`Invalid MCP server configuration: ${validation.error}`)
        return
      }
      await invoke('save_autohand_mcp_server', { workingDir, server: validation.data })
      setError(null)
      await loadServers()
    },
    [workingDir, loadServers]
  )

  const deleteServer = useCallback(
    async (serverName: string) => {
      if (!workingDir) return
      await invoke('delete_autohand_mcp_server', { workingDir, serverName })
      setError(null)
      await loadServers()
    },
    [workingDir, loadServers]
  )

  useEffect(() => {
    loadServers()
  }, [loadServers])

  return { servers, loading, error, loadServers, saveServer, deleteServer }
}
