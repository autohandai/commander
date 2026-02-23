import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { HooksPanel } from './HooksPanel'

interface AutohandConfig {
  protocol: 'rpc' | 'acp'
  provider: string
  model?: string
  permissions_mode: string
  hooks: unknown[]
}

interface AutohandSettingsTabProps {
  workingDir: string | null
}

export function AutohandSettingsTab({ workingDir }: AutohandSettingsTabProps) {
  const [config, setConfig] = useState<AutohandConfig | null>(null)

  useEffect(() => {
    if (!workingDir) return
    invoke<AutohandConfig>('get_autohand_config', { workingDir })
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [workingDir])

  const updateConfig = async (updates: Partial<AutohandConfig>) => {
    if (!config || !workingDir) return
    const updated = { ...config, ...updates }
    setConfig(updated)
    await invoke('save_autohand_config', { workingDir, config: updated })
  }

  if (!config) {
    return <p className="text-sm text-muted-foreground">No autohand configuration found for this project.</p>
  }

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Protocol</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Communication Mode</Label>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={config.protocol}
              onChange={(e) => updateConfig({ protocol: e.target.value as 'rpc' | 'acp' })}
            >
              <option value="rpc">JSON-RPC 2.0</option>
              <option value="acp">ACP (Agent Communication Protocol)</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Permissions Mode</Label>
            <select
              className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              value={config.permissions_mode}
              onChange={(e) => updateConfig({ permissions_mode: e.target.value })}
            >
              <option value="interactive">Interactive</option>
              <option value="auto">Auto-approve</option>
              <option value="restricted">Restricted</option>
            </select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Model (optional)</Label>
          <Input
            value={config.model || ''}
            onChange={(e) => updateConfig({ model: e.target.value || undefined })}
            placeholder="e.g. anthropic/claude-sonnet-4-20250514"
            className="h-8 text-sm"
          />
        </div>
      </div>

      <div className="border-t pt-4">
        <HooksPanel workingDir={workingDir} />
      </div>
    </div>
  )
}
