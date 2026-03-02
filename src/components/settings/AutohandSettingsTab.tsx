import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronRight } from 'lucide-react'
import { HooksPanel } from './HooksPanel'
import { McpServersPanel } from './McpServersPanel'

interface ProviderDetails {
  api_key?: string
  model?: string
  base_url?: string
}

interface PermissionsConfig {
  mode: string
  whitelist: string[]
  blacklist: string[]
  rules: string[]
  remember_session: boolean
}

interface AgentBehaviorConfig {
  max_iterations: number
  enable_request_queue: boolean
}

interface NetworkConfig {
  timeout: number
  max_retries: number
  retry_delay: number
}

interface AutohandConfig {
  protocol: 'rpc' | 'acp'
  provider: string
  model?: string
  permissions_mode: string
  hooks: unknown[]
  provider_details?: ProviderDetails
  permissions?: PermissionsConfig
  agent?: AgentBehaviorConfig
  network?: NetworkConfig
}

interface AutohandSettingsTabProps {
  workingDir: string | null
}

function SectionHeader({ title, open }: { title: string; open: boolean }) {
  return (
    <CollapsibleTrigger className="flex w-full items-center gap-2 py-2 text-sm font-medium hover:text-primary transition-colors">
      <ChevronRight
        className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
      />
      {title}
    </CollapsibleTrigger>
  )
}

function TagEditor({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder: string
}) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const value = input.trim()
    if (value && !tags.includes(value)) {
      onChange([...tags, value])
      setInput('')
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {tags.map((tag) => (
          <Badge key={tag} variant="secondary" className="text-xs gap-1">
            {tag}
            <button
              className="ml-0.5 hover:text-destructive"
              onClick={() => onChange(tags.filter((t) => t !== tag))}
            >
              x
            </button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          placeholder={placeholder}
          className="h-7 text-xs"
        />
      </div>
    </div>
  )
}

export function AutohandSettingsTab({ workingDir }: AutohandSettingsTabProps) {
  const [config, setConfig] = useState<AutohandConfig | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!workingDir) return
    invoke<AutohandConfig>('get_autohand_config', { workingDir })
      .then(setConfig)
      .catch(() => setConfig(null))
  }, [workingDir])

  const updateConfig = async (updates: Partial<AutohandConfig>) => {
    if (!config || !workingDir) return
    const previous = config
    const updated = { ...config, ...updates }
    setConfig(updated)
    try {
      await invoke('save_autohand_config', { workingDir, config: updated })
    } catch {
      setConfig(previous)
    }
  }

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  if (!config) {
    return (
      <p className="text-sm text-muted-foreground">
        No autohand configuration found for this project.
      </p>
    )
  }

  const providerDetails = config.provider_details
  const permissions = config.permissions
  const agent = config.agent
  const network = config.network

  return (
    <div className="space-y-4">
      {/* Protocol & Model (always visible) */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Protocol & Model</h3>
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

      <div className="border-t" />

      {/* Provider Settings */}
      <Collapsible
        open={openSections.provider}
        onOpenChange={() => toggleSection('provider')}
      >
        <SectionHeader title="Provider Settings" open={!!openSections.provider} />
        <CollapsibleContent className="space-y-3 pb-2">
          <div>
            <Label className="text-xs">Provider</Label>
            <Input
              value={config.provider}
              readOnly
              className="h-8 text-sm bg-muted"
            />
          </div>
          <div>
            <Label className="text-xs">API Key</Label>
            <Input
              type="password"
              value={providerDetails?.api_key || ''}
              onChange={(e) =>
                updateConfig({
                  provider_details: {
                    ...providerDetails,
                    api_key: e.target.value || undefined,
                  },
                })
              }
              placeholder="sk-..."
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Base URL</Label>
            <Input
              value={providerDetails?.base_url || ''}
              onChange={(e) =>
                updateConfig({
                  provider_details: {
                    ...providerDetails,
                    base_url: e.target.value || undefined,
                  },
                })
              }
              placeholder="https://api.provider.com/v1"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Provider Model Override</Label>
            <Input
              value={providerDetails?.model || ''}
              onChange={(e) =>
                updateConfig({
                  provider_details: {
                    ...providerDetails,
                    model: e.target.value || undefined,
                  },
                })
              }
              placeholder="model name"
              className="h-8 text-sm"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      {/* MCP Servers */}
      <Collapsible
        open={openSections.mcp}
        onOpenChange={() => toggleSection('mcp')}
      >
        <SectionHeader title="MCP Servers" open={!!openSections.mcp} />
        <CollapsibleContent className="pb-2">
          <McpServersPanel workingDir={workingDir} />
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      {/* Permissions */}
      <Collapsible
        open={openSections.permissions}
        onOpenChange={() => toggleSection('permissions')}
      >
        <SectionHeader title="Permissions" open={!!openSections.permissions} />
        <CollapsibleContent className="space-y-3 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Mode</Label>
              <select
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                value={permissions?.mode || 'interactive'}
                onChange={(e) =>
                  updateConfig({
                    permissions: {
                      ...(permissions || {
                        mode: 'interactive',
                        whitelist: [],
                        blacklist: [],
                        rules: [],
                        remember_session: false,
                      }),
                      mode: e.target.value,
                    },
                  })
                }
              >
                <option value="interactive">Interactive</option>
                <option value="auto">Auto-approve</option>
                <option value="restricted">Restricted</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch
                checked={permissions?.remember_session ?? false}
                onCheckedChange={(checked) =>
                  updateConfig({
                    permissions: {
                      ...(permissions || {
                        mode: 'interactive',
                        whitelist: [],
                        blacklist: [],
                        rules: [],
                        remember_session: false,
                      }),
                      remember_session: checked,
                    },
                  })
                }
              />
              <Label className="text-xs">Remember session permissions</Label>
            </div>
          </div>
          <div>
            <Label className="text-xs">Whitelist</Label>
            <TagEditor
              tags={permissions?.whitelist || []}
              onChange={(whitelist) =>
                updateConfig({
                  permissions: {
                    ...(permissions || {
                      mode: 'interactive',
                      whitelist: [],
                      blacklist: [],
                      rules: [],
                      remember_session: false,
                    }),
                    whitelist,
                  },
                })
              }
              placeholder="Add allowed tool..."
            />
          </div>
          <div>
            <Label className="text-xs">Blacklist</Label>
            <TagEditor
              tags={permissions?.blacklist || []}
              onChange={(blacklist) =>
                updateConfig({
                  permissions: {
                    ...(permissions || {
                      mode: 'interactive',
                      whitelist: [],
                      blacklist: [],
                      rules: [],
                      remember_session: false,
                    }),
                    blacklist,
                  },
                })
              }
              placeholder="Add blocked tool..."
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      {/* Agent Behavior */}
      <Collapsible
        open={openSections.agent}
        onOpenChange={() => toggleSection('agent')}
      >
        <SectionHeader title="Agent Behavior" open={!!openSections.agent} />
        <CollapsibleContent className="space-y-3 pb-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Max Iterations</Label>
              <Input
                type="number"
                value={agent?.max_iterations ?? 10}
                onChange={(e) =>
                  updateConfig({
                    agent: {
                      ...(agent || { max_iterations: 10, enable_request_queue: false }),
                      max_iterations: parseInt(e.target.value) || 10,
                    },
                  })
                }
                className="h-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch
                checked={agent?.enable_request_queue ?? false}
                onCheckedChange={(checked) =>
                  updateConfig({
                    agent: {
                      ...(agent || { max_iterations: 10, enable_request_queue: false }),
                      enable_request_queue: checked,
                    },
                  })
                }
              />
              <Label className="text-xs">Enable request queue</Label>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      {/* Network */}
      <Collapsible
        open={openSections.network}
        onOpenChange={() => toggleSection('network')}
      >
        <SectionHeader title="Network" open={!!openSections.network} />
        <CollapsibleContent className="space-y-3 pb-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Timeout (ms)</Label>
              <Input
                type="number"
                value={network?.timeout ?? 30000}
                onChange={(e) =>
                  updateConfig({
                    network: {
                      ...(network || { timeout: 30000, max_retries: 3, retry_delay: 1000 }),
                      timeout: parseInt(e.target.value) || 30000,
                    },
                  })
                }
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Max Retries</Label>
              <Input
                type="number"
                value={network?.max_retries ?? 3}
                onChange={(e) =>
                  updateConfig({
                    network: {
                      ...(network || { timeout: 30000, max_retries: 3, retry_delay: 1000 }),
                      max_retries: parseInt(e.target.value) || 3,
                    },
                  })
                }
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Retry Delay (ms)</Label>
              <Input
                type="number"
                value={network?.retry_delay ?? 1000}
                onChange={(e) =>
                  updateConfig({
                    network: {
                      ...(network || { timeout: 30000, max_retries: 3, retry_delay: 1000 }),
                      retry_delay: parseInt(e.target.value) || 1000,
                    },
                  })
                }
                className="h-8 text-sm"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="border-t" />

      {/* Lifecycle Hooks (unchanged) */}
      <HooksPanel workingDir={workingDir} />
    </div>
  )
}
