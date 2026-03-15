import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Trash2, Plus, X } from 'lucide-react'
import { useAutohandMcpServers, type McpServerConfig } from '@/hooks/useAutohandMcpServers'

interface McpServersPanelProps {
  workingDir: string | null
}

export function McpServersPanel({ workingDir }: McpServersPanelProps) {
  const { servers, loading, error, saveServer, deleteServer } = useAutohandMcpServers(workingDir)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTransport, setNewTransport] = useState('stdio')
  const [newCommand, setNewCommand] = useState('')
  const [newArgs, setNewArgs] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [newEnvPairs, setNewEnvPairs] = useState<{ key: string; value: string }[]>([])

  const resetForm = () => {
    setNewName('')
    setNewTransport('stdio')
    setNewCommand('')
    setNewArgs('')
    setNewUrl('')
    setNewEnvPairs([])
    setShowAdd(false)
  }

  const handleAdd = async () => {
    if (!newName.trim()) return

    const env: Record<string, string> = {}
    for (const pair of newEnvPairs) {
      if (pair.key.trim()) {
        env[pair.key.trim()] = pair.value
      }
    }

    const server: McpServerConfig = {
      name: newName.trim(),
      transport: newTransport,
      command: newTransport === 'stdio' ? newCommand.trim() || undefined : undefined,
      args: newTransport === 'stdio' && newArgs.trim()
        ? newArgs.split(/\s+/).filter(Boolean)
        : [],
      url: newTransport === 'http' ? newUrl.trim() || undefined : undefined,
      env,
      auto_connect: true,
    }
    await saveServer(server)
    resetForm()
  }

  const handleToggleAutoConnect = async (server: McpServerConfig, checked: boolean) => {
    await saveServer({ ...server, auto_connect: checked })
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading MCP servers...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">MCP Servers</h4>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Server
        </Button>
      </div>

      {showAdd && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Name</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-server"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Transport</Label>
              <select
                className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                value={newTransport}
                onChange={(e) => setNewTransport(e.target.value)}
              >
                <option value="stdio">stdio</option>
                <option value="http">http</option>
              </select>
            </div>
          </div>

          {newTransport === 'stdio' ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Command</Label>
                <Input
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  placeholder="npx"
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Args (space-separated)</Label>
                <Input
                  value={newArgs}
                  onChange={(e) => setNewArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-fs"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ) : (
            <div>
              <Label className="text-xs">URL</Label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="h-8 text-sm"
              />
            </div>
          )}

          {/* Env key-value pairs */}
          <div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Environment Variables</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setNewEnvPairs([...newEnvPairs, { key: '', value: '' }])}
              >
                <Plus className="mr-1 h-3 w-3" />
                Add
              </Button>
            </div>
            {newEnvPairs.map((pair, i) => (
              <div key={i} className="mt-1 flex items-center gap-1">
                <Input
                  value={pair.key}
                  onChange={(e) => {
                    const updated = [...newEnvPairs]
                    updated[i] = { ...updated[i], key: e.target.value }
                    setNewEnvPairs(updated)
                  }}
                  placeholder="KEY"
                  className="h-7 text-xs flex-1"
                />
                <Input
                  type="password"
                  value={pair.value}
                  onChange={(e) => {
                    const updated = [...newEnvPairs]
                    updated[i] = { ...updated[i], value: e.target.value }
                    setNewEnvPairs(updated)
                  }}
                  placeholder="value"
                  className="h-7 text-xs flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setNewEnvPairs(newEnvPairs.filter((_, idx) => idx !== i))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      {servers.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">
          No MCP servers configured. MCP servers provide additional tools and context to the agent.
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="space-y-2">
        {servers.map((server) => (
          <div
            key={server.name}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={server.auto_connect}
                onCheckedChange={(checked) => handleToggleAutoConnect(server, checked)}
              />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-mono font-medium">{server.name}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {server.transport}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {server.transport === 'stdio'
                    ? [server.command, ...(server.args || [])].filter(Boolean).join(' ')
                    : server.url || ''}
                </p>
                {Object.keys(server.env || {}).length > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    env: {Object.keys(server.env).join(', ')}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteServer(server.name)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
