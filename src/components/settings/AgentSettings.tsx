import { useEffect, useMemo, useState } from "react"
import { invoke } from "@tauri-apps/api/core"
import { AlertCircle, Bot, Loader2, Plus, RefreshCw, Search, Settings2, Trash2, Wand2, XCircle } from "lucide-react"

import { ErrorBoundary } from "@/components/ErrorBoundary"
import { AutohandSettingsTab } from "@/components/settings/AutohandSettingsTab"
import {
  BUILTIN_AGENT_PROFILES,
  customAgentCapabilities,
  defaultCustomAgentDefinition,
  type AgentCapabilityMap,
  type AgentPromptMode,
  type AgentTransportKind,
  type CustomAgentDefinition,
} from "@/components/settings/agent-registry"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AgentSettingsProps } from "@/types/settings"

type GenericAgentSettings = {
  model?: string
  output_format?: string
  session_timeout_minutes?: number
  max_tokens?: number | null
  temperature?: number | null
  sandbox_mode?: boolean
  auto_approval?: boolean
  debug_mode?: boolean
}

const OUTPUT_FORMAT_OPTIONS = [
  { value: "markdown", label: "Markdown" },
  { value: "json", label: "JSON" },
  { value: "plain", label: "Plain Text" },
  { value: "code", label: "Code Only" },
]

const TRANSPORT_OPTIONS: Array<{ value: AgentTransportKind; label: string }> = [
  { value: "cli-flags", label: "CLI Flags" },
  { value: "slash-commands", label: "Slash Commands" },
  { value: "json-rpc", label: "JSON-RPC" },
  { value: "acp", label: "ACP" },
]

function normalizeAgentId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function transportToPromptMode(transport: AgentTransportKind): AgentPromptMode {
  if (transport === "slash-commands") return "slash"
  if (transport === "json-rpc" || transport === "acp") return "protocol"
  return "flag"
}

function defaultAgentSettings() {
  return {
    model: "",
    output_format: "markdown",
    session_timeout_minutes: 30,
    max_tokens: null,
    temperature: null,
    sandbox_mode: false,
    auto_approval: false,
    debug_mode: false,
  }
}

function CapabilityBadge({ source }: { source: string }) {
  return (
    <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
      {source}
    </Badge>
  )
}

function Section({
  title,
  description,
  children,
  actions,
}: {
  title: string
  description?: string
  children: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <section className="space-y-4 border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  )
}

function FieldRow({
  label,
  hint,
  badge,
  children,
}: {
  label: string
  hint: string
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)] md:items-start">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{label}</Label>
          {badge}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function GenericAgentFields({
  capabilities,
  settings,
  modelOptions,
  isFetchingModels,
  onFetchModels,
  onUpdate,
}: {
  capabilities: AgentCapabilityMap
  settings: GenericAgentSettings
  modelOptions: string[]
  isFetchingModels: boolean
  onFetchModels: () => void
  onUpdate: (key: string, value: unknown) => void
}) {
  return (
    <div className="space-y-5">
      {capabilities.model ? (
        <FieldRow
          label="Model"
          hint={capabilities.model.hint}
          badge={<CapabilityBadge source={capabilities.model.source} />}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                value={settings.model || ""}
                onChange={(e) => onUpdate("model", e.target.value)}
                placeholder="Default model"
              />
              {capabilities.model.fetchModels && !capabilities.model.autoFetch ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onFetchModels}
                  disabled={isFetchingModels}
                  className="shrink-0"
                >
                  {isFetchingModels ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
                  Fetch Models
                </Button>
              ) : null}
            </div>
            {modelOptions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {modelOptions.slice(0, 6).map((model) => (
                  <button
                    key={model}
                    type="button"
                    onClick={() => onUpdate("model", model)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                  >
                    {model}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </FieldRow>
      ) : null}

      {capabilities.output_format ? (
        <FieldRow
          label="Output Format"
          hint={capabilities.output_format.hint}
          badge={<CapabilityBadge source={capabilities.output_format.source} />}
        >
          <Select value={settings.output_format || "markdown"} onValueChange={(value) => onUpdate("output_format", value)}>
            <SelectTrigger aria-label="Output Format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_FORMAT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldRow>
      ) : null}

      {capabilities.session_timeout_minutes ? (
        <FieldRow
          label="Session Timeout"
          hint={capabilities.session_timeout_minutes.hint}
          badge={<CapabilityBadge source={capabilities.session_timeout_minutes.source} />}
        >
          <Input
            type="number"
            min={1}
            max={120}
            value={settings.session_timeout_minutes ?? 30}
            onChange={(e) => onUpdate("session_timeout_minutes", parseInt(e.target.value, 10) || 30)}
            className="max-w-xs"
          />
        </FieldRow>
      ) : null}

      {capabilities.max_tokens ? (
        <FieldRow
          label="Max Tokens"
          hint={capabilities.max_tokens.hint}
          badge={<CapabilityBadge source={capabilities.max_tokens.source} />}
        >
          <Input
            type="number"
            min={1}
            value={settings.max_tokens ?? ""}
            onChange={(e) => onUpdate("max_tokens", e.target.value ? parseInt(e.target.value, 10) : null)}
            placeholder="Default"
            className="max-w-xs"
          />
        </FieldRow>
      ) : null}

      {capabilities.temperature ? (
        <FieldRow
          label="Temperature"
          hint={capabilities.temperature.hint}
          badge={<CapabilityBadge source={capabilities.temperature.source} />}
        >
          <Input
            type="number"
            min={0}
            max={2}
            step="0.1"
            value={settings.temperature ?? ""}
            onChange={(e) => onUpdate("temperature", e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Default"
            className="max-w-xs"
          />
        </FieldRow>
      ) : null}

      {capabilities.sandbox_mode ? (
        <FieldRow
          label="Sandbox Mode"
          hint={capabilities.sandbox_mode.hint}
          badge={<CapabilityBadge source={capabilities.sandbox_mode.source} />}
        >
          <Switch checked={!!settings.sandbox_mode} onCheckedChange={(checked) => onUpdate("sandbox_mode", checked)} aria-label="Sandbox Mode" />
        </FieldRow>
      ) : null}

      {capabilities.auto_approval ? (
        <FieldRow
          label="Auto Approval"
          hint={capabilities.auto_approval.hint}
          badge={<CapabilityBadge source={capabilities.auto_approval.source} />}
        >
          <Switch checked={!!settings.auto_approval} onCheckedChange={(checked) => onUpdate("auto_approval", checked)} aria-label="Auto Approval" />
        </FieldRow>
      ) : null}

      {capabilities.debug_mode ? (
        <FieldRow
          label="Debug Mode"
          hint={capabilities.debug_mode.hint}
          badge={<CapabilityBadge source={capabilities.debug_mode.source} />}
        >
          <Switch checked={!!settings.debug_mode} onCheckedChange={(checked) => onUpdate("debug_mode", checked)} aria-label="Debug Mode" />
        </FieldRow>
      ) : null}
    </div>
  )
}

const SafeAgentSettings = ({
  tempAgentSettings,
  tempAllAgentSettings,
  agentModels,
  fetchingAgentModels,
  agentSettingsLoading,
  agentSettingsError,
  onToggleAgent,
  onUpdateAgentSetting,
  onFetchAgentModels,
  onCreateCustomAgent,
  onUpdateCustomAgent,
  onDeleteCustomAgent,
  workingDir,
}: AgentSettingsProps) => {
  const [activeAgentId, setActiveAgentId] = useState<string>(BUILTIN_AGENT_PROFILES[0].id)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [draftAgent, setDraftAgent] = useState<CustomAgentDefinition>(defaultCustomAgentDefinition())
  const [isScanning, setIsScanning] = useState(false)
  const [detectedAgents, setDetectedAgents] = useState<Array<{
    binary: string
    display_name: string
    version: string | null
    supports_rpc: boolean
    supports_acp: boolean
  }>>([])

  const scanForAgents = async () => {
    setIsScanning(true)
    try {
      const agents = await invoke<typeof detectedAgents>('detect_cli_agents')
      setDetectedAgents(agents)
    } catch (error) {
      console.error('Failed to scan for agents:', error)
      setDetectedAgents([])
    } finally {
      setIsScanning(false)
    }
  }

  const addDetectedAgent = (agent: typeof detectedAgents[number]) => {
    const id = normalizeAgentId(agent.binary)
    const transport: AgentTransportKind = agent.supports_rpc ? 'json-rpc' : agent.supports_acp ? 'acp' : 'cli-flags'
    const newAgent: CustomAgentDefinition = {
      ...defaultCustomAgentDefinition(),
      id,
      name: agent.display_name,
      command: agent.binary,
      transport,
      protocol: agent.supports_rpc ? 'rpc' : agent.supports_acp ? 'acp' : undefined,
      prompt_mode: transportToPromptMode(transport),
    }
    onCreateCustomAgent(newAgent)
    setActiveAgentId(id)
    // Remove from detected list
    setDetectedAgents((prev) => prev.filter((a) => a.binary !== agent.binary))
  }

  // Auto-scan for agents when the tab loads (non-blocking)
  useEffect(() => {
    scanForAgents()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const customAgents = useMemo(
    () => (Array.isArray(tempAllAgentSettings?.custom_agents) ? tempAllAgentSettings.custom_agents : []),
    [tempAllAgentSettings]
  )
  const tabs = useMemo(
    () => [
      ...BUILTIN_AGENT_PROFILES.map((profile) => ({
        id: profile.id,
        label: profile.shortLabel,
        description: profile.description,
        kind: "builtin" as const,
      })),
      ...customAgents.map((agent) => ({
        id: agent.id,
        label: agent.name,
        description: `${agent.transport} transport`,
        kind: "custom" as const,
      })),
    ],
    [customAgents]
  )

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeAgentId)) {
      setActiveAgentId(tabs[0]?.id ?? BUILTIN_AGENT_PROFILES[0].id)
    }
  }, [activeAgentId, tabs])

  if (agentSettingsLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading coding agent settings...
      </div>
    )
  }

  if (agentSettingsError && !tempAllAgentSettings) {
    return (
      <div className="space-y-3 py-8">
        <div className="flex items-center gap-2 text-destructive">
          <XCircle className="h-5 w-5" />
          <span className="font-medium">Failed to load coding agent settings</span>
        </div>
        <p className="text-sm text-muted-foreground">{agentSettingsError}</p>
      </div>
    )
  }

  if (!tempAllAgentSettings) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
        No coding agent settings available.
      </div>
    )
  }

  const getBuiltInSettings = (agentId: string) =>
    (tempAllAgentSettings?.[agentId as keyof typeof tempAllAgentSettings] as GenericAgentSettings | undefined) || defaultAgentSettings()

  const selectedBuiltIn = BUILTIN_AGENT_PROFILES.find((profile) => profile.id === activeAgentId)
  const selectedCustom = customAgents.find((agent) => agent.id === activeAgentId)

  const createAgent = () => {
    const id = normalizeAgentId(draftAgent.id || draftAgent.name)
    if (!draftAgent.name.trim() || !id || !draftAgent.command.trim()) {
      return
    }

    const nextAgent: CustomAgentDefinition = {
      ...draftAgent,
      id,
      name: draftAgent.name.trim(),
      command: draftAgent.command.trim(),
      prompt_mode: transportToPromptMode(draftAgent.transport),
    }

    onCreateCustomAgent(nextAgent)
    setActiveAgentId(id)
    setDraftAgent(defaultCustomAgentDefinition())
    setIsCreateDialogOpen(false)
  }

  return (
    <div className="space-y-6">
      <Section
        title="Coding Agents"
        description="Built-in and custom agents share one registry. Each tab only exposes settings backed by that agent’s transport."
        actions={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={scanForAgents} disabled={isScanning}>
              {isScanning ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-2 h-3.5 w-3.5" />}
              {isScanning ? 'Scanning...' : 'Detect Agents'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-3.5 w-3.5" />
              Add Agent
            </Button>
          </div>
        }
      >
        {detectedAgents.length > 0 && (
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {detectedAgents.length} agent{detectedAgents.length !== 1 ? 's' : ''} detected on your system
            </p>
            <div className="flex flex-wrap gap-2">
              {detectedAgents.map((agent) => (
                <button
                  key={agent.binary}
                  type="button"
                  onClick={() => addDetectedAgent(agent)}
                  className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-xs transition-colors hover:border-foreground/20 hover:bg-accent"
                >
                  <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{agent.display_name}</span>
                  {agent.version && <span className="text-muted-foreground">{agent.version}</span>}
                  {(agent.supports_rpc || agent.supports_acp) && (
                    <Badge variant="outline" className="rounded-full px-1.5 py-0 text-[9px] uppercase">
                      {agent.supports_rpc ? 'RPC' : 'ACP'}
                    </Badge>
                  )}
                  <Plus className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}

        <Tabs value={activeAgentId} onValueChange={setActiveAgentId} className="space-y-5">
          <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-transparent p-0">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="rounded-t-md rounded-b-none border border-transparent border-b-0 px-3 py-2 text-sm text-muted-foreground data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {BUILTIN_AGENT_PROFILES.map((profile) => {
            const settings = getBuiltInSettings(profile.id)
            const isEnabled = tempAgentSettings?.[profile.id] !== false
            const modelOptions = agentModels[profile.id] || []
            const isFetchingModels = fetchingAgentModels[profile.id] || false
            const effectiveTransport = (settings as GenericAgentSettings & { transport?: AgentTransportKind }).transport || profile.transport

            return (
              <TabsContent key={profile.id} value={profile.id} className="mt-0 space-y-5">
                <Section
                  title={profile.label}
                  description={profile.description}
                  actions={
                    <div className="flex items-center gap-3">
                      <Select
                        value={effectiveTransport}
                        onValueChange={(value: AgentTransportKind) => onUpdateAgentSetting(profile.id, 'transport', value)}
                      >
                        <SelectTrigger className="h-6 w-[110px] rounded-full border px-2 text-[10px] uppercase tracking-[0.18em] text-muted-foreground" aria-label="Transport">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRANSPORT_OPTIONS.filter(o => o.value !== 'slash-commands').map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Switch checked={isEnabled} onCheckedChange={(checked) => onToggleAgent(profile.id, checked)} aria-label={`${profile.label} enabled`} />
                    </div>
                  }
                >
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                      <Bot className="h-3.5 w-3.5" />
                      {profile.command}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                      <Wand2 className="h-3.5 w-3.5" />
                      {transportToPromptMode(effectiveTransport)}
                    </span>
                    {(effectiveTransport === 'json-rpc' || effectiveTransport === 'acp') ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
                        <Settings2 className="h-3.5 w-3.5" />
                        {effectiveTransport === 'acp' ? 'acp' : 'rpc'}
                      </span>
                    ) : null}
                  </div>
                </Section>

                {profile.specialView === "autohand" ? (
                  <AutohandSettingsTab workingDir={workingDir ?? null} />
                ) : (
                  <Section
                    title="Supported Settings"
                    description="Only controls with real transport support are shown here."
                  >
                    <GenericAgentFields
                      capabilities={profile.capabilities}
                      settings={settings}
                      modelOptions={modelOptions}
                      isFetchingModels={isFetchingModels}
                      onFetchModels={() => onFetchAgentModels(profile.id)}
                      onUpdate={(key, value) => onUpdateAgentSetting(profile.id, key, value)}
                    />
                  </Section>
                )}
              </TabsContent>
            )
          })}

          {customAgents.map((agent) => {
            const capabilities = customAgentCapabilities(agent)
            const modelOptions = agentModels[agent.id] || []
            const isFetchingModels = fetchingAgentModels[agent.id] || false
            const isEnabled = tempAgentSettings?.[agent.id] !== false

            return (
              <TabsContent key={agent.id} value={agent.id} className="mt-0 space-y-5">
                <Section
                  title={agent.name}
                  description="Custom agents persist here first so Commander can adopt new transports without another UI rewrite."
                  actions={
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="rounded-full px-2 py-0 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        {agent.transport}
                      </Badge>
                      <Switch checked={isEnabled} onCheckedChange={(checked) => onToggleAgent(agent.id, checked)} aria-label={`${agent.name} enabled`} />
                    </div>
                  }
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`${agent.id}-name`}>Agent Name</Label>
                      <Input
                        id={`${agent.id}-name`}
                        value={agent.name}
                        onChange={(e) => onUpdateCustomAgent(agent.id, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${agent.id}-command`}>Command</Label>
                      <Input
                        id={`${agent.id}-command`}
                        value={agent.command}
                        onChange={(e) => onUpdateCustomAgent(agent.id, { command: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${agent.id}-transport`}>Transport</Label>
                      <Select
                        value={agent.transport}
                        onValueChange={(value: AgentTransportKind) =>
                          onUpdateCustomAgent(agent.id, (current) => ({
                            ...current,
                            transport: value,
                            prompt_mode: transportToPromptMode(value),
                            protocol: value === "json-rpc" ? "rpc" : value === "acp" ? "acp" : current.protocol,
                          }))
                        }
                      >
                        <SelectTrigger id={`${agent.id}-transport`} aria-label="Transport">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TRANSPORT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {(agent.transport === "json-rpc" || agent.transport === "acp") ? (
                      <div className="space-y-2">
                        <Label htmlFor={`${agent.id}-protocol`}>Protocol</Label>
                        <Select
                          value={agent.protocol || (agent.transport === "acp" ? "acp" : "rpc")}
                          onValueChange={(value: "rpc" | "acp") => onUpdateCustomAgent(agent.id, { protocol: value })}
                        >
                          <SelectTrigger id={`${agent.id}-protocol`} aria-label="Protocol">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="rpc">JSON-RPC</SelectItem>
                            <SelectItem value="acp">ACP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>
                </Section>

                <Section
                  title="Supported Settings"
                  description="Toggle which defaults Commander should expose for this custom agent."
                  actions={
                    <Button type="button" variant="ghost" size="sm" onClick={() => onDeleteCustomAgent(agent.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  }
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ["supports_model", "Model"],
                      ["supports_output_format", "Output Format"],
                      ["supports_session_timeout", "Session Timeout"],
                      ["supports_max_tokens", "Max Tokens"],
                      ["supports_temperature", "Temperature"],
                      ["supports_sandbox_mode", "Sandbox Mode"],
                      ["supports_auto_approval", "Auto Approval"],
                      ["supports_debug_mode", "Debug Mode"],
                    ].map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between border-b border-border/60 py-2">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={Boolean(agent[key as keyof CustomAgentDefinition])}
                          onCheckedChange={(checked) => onUpdateCustomAgent(agent.id, { [key]: checked } as Partial<CustomAgentDefinition>)}
                          aria-label={label}
                        />
                      </div>
                    ))}
                  </div>
                </Section>

                <Section
                  title="Default Values"
                  description="These defaults are stored with the agent definition and only appear when the transport supports them."
                >
                  <GenericAgentFields
                    capabilities={capabilities}
                    settings={agent.settings}
                    modelOptions={modelOptions}
                    isFetchingModels={isFetchingModels}
                    onFetchModels={() => onFetchAgentModels(agent.id)}
                    onUpdate={(key, value) =>
                      onUpdateCustomAgent(agent.id, (current) => ({
                        ...current,
                        settings: {
                          ...current.settings,
                          [key]: value,
                        },
                      }))
                    }
                  />
                </Section>
              </TabsContent>
            )
          })}
        </Tabs>
      </Section>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Custom Agent</DialogTitle>
            <DialogDescription>
              Define how Commander should describe and persist a custom CLI, JSON-RPC, or ACP agent.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="custom-agent-name">Agent Name</Label>
              <Input
                id="custom-agent-name"
                aria-label="Agent Name"
                value={draftAgent.name}
                onChange={(e) => setDraftAgent((current) => ({ ...current, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-agent-id">Agent ID</Label>
              <Input
                id="custom-agent-id"
                aria-label="Agent ID"
                value={draftAgent.id}
                onChange={(e) => setDraftAgent((current) => ({ ...current, id: e.target.value }))}
                placeholder="auto-generated if empty"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="custom-agent-command">Command</Label>
              <Input
                id="custom-agent-command"
                aria-label="Command"
                value={draftAgent.command}
                onChange={(e) => setDraftAgent((current) => ({ ...current, command: e.target.value }))}
                placeholder="agent executable or wrapper command"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-agent-transport">Transport</Label>
              <Select
                value={draftAgent.transport}
                onValueChange={(value: AgentTransportKind) =>
                  setDraftAgent((current) => ({
                    ...current,
                    transport: value,
                    prompt_mode: transportToPromptMode(value),
                    protocol: value === "json-rpc" ? "rpc" : value === "acp" ? "acp" : current.protocol,
                  }))
                }
              >
                <SelectTrigger id="custom-agent-transport" aria-label="Transport">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(draftAgent.transport === "json-rpc" || draftAgent.transport === "acp") ? (
              <div className="space-y-2">
                <Label htmlFor="custom-agent-protocol">Protocol</Label>
                <Select
                  value={draftAgent.protocol || (draftAgent.transport === "acp" ? "acp" : "rpc")}
                  onValueChange={(value: "rpc" | "acp") => setDraftAgent((current) => ({ ...current, protocol: value }))}
                >
                  <SelectTrigger id="custom-agent-protocol" aria-label="Protocol">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rpc">JSON-RPC</SelectItem>
                    <SelectItem value="acp">ACP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={createAgent}
              disabled={!draftAgent.name.trim() || !draftAgent.command.trim()}
            >
              Create Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AgentSettings(props: AgentSettingsProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center gap-2 py-8 text-destructive">
          <XCircle className="h-5 w-5" />
          Coding Agent Settings Error
        </div>
      }
    >
      <SafeAgentSettings {...props} />
    </ErrorBoundary>
  )
}
