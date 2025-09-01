import { Loader2, XCircle, AlertCircle, RefreshCw, Clock } from "lucide-react"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { AgentSettingsProps, AgentInfo } from "@/types/settings"

const SafeAgentSettings = ({
  agentSettings: _agentSettings,
  tempAgentSettings,
  allAgentSettings: _allAgentSettings,
  tempAllAgentSettings,
  agentModels,
  fetchingAgentModels,
  agentSettingsLoading,
  agentSettingsError,
  onToggleAgent,
  onUpdateAgentSetting,
  onFetchAgentModels
}: AgentSettingsProps) => {
  console.log('🔍 DEBUG: SafeAgentSettings called')
  console.log('📊 State values:', {
    agentSettingsLoading,
    agentSettingsError,
    hasTempAllAgentSettings: !!tempAllAgentSettings,
    tempAgentSettings,
    agentModelsCount: Object.keys(agentModels).length
  })

  // Show loading state while agent settings are being loaded
  if (agentSettingsLoading) {
    console.log('🔄 Showing loading state')
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading CLI agent settings...
      </div>
    )
  }

  // Show error state if there was an error loading settings
  if (agentSettingsError && !tempAllAgentSettings) {
    console.log('❌ Showing error state:', agentSettingsError)
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <XCircle className="h-8 w-8 text-destructive" />
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load CLI agent settings</p>
          <p className="text-sm text-muted-foreground mt-1">{agentSettingsError}</p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="mt-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reload Settings
          </Button>
        </div>
      </div>
    )
  }

  // Ensure we have valid settings before rendering
  if (!tempAllAgentSettings || typeof tempAllAgentSettings !== 'object') {
    console.log('⚠️ No agent settings available or invalid settings:', tempAllAgentSettings)
    return (
      <div className="flex items-center justify-center py-8">
        <AlertCircle className="h-6 w-6 text-muted-foreground mr-2" />
        <span className="text-muted-foreground">No CLI agent settings available</span>
      </div>
    )
  }

  // Ensure tempAgentSettings is valid
  if (!tempAgentSettings || typeof tempAgentSettings !== 'object') {
    console.log('⚠️ Invalid tempAgentSettings:', tempAgentSettings)
    return (
      <div className="flex items-center justify-center py-8">
        <AlertCircle className="h-6 w-6 text-muted-foreground mr-2" />
        <span className="text-muted-foreground">Invalid CLI agent configuration</span>
      </div>
    )
  }

  console.log('✅ Proceeding with full agent settings render')

  // Define constants and functions outside JSX
  const agents: AgentInfo[] = [
    { id: 'claude', name: 'Claude Code CLI', description: 'Official Claude CLI tool for coding assistance' },
    { id: 'codex', name: 'Codex', description: 'GitHub Copilot and OpenAI Codex integration' },
    { id: 'gemini', name: 'Gemini', description: 'Google Gemini AI coding assistant' }
  ]

  const updateAgentSetting = (agentId: string, key: string, value: any) => {
    onUpdateAgentSetting(agentId, key, value)
  }


  try {
    return (
    <div className="space-y-8">
      {/* Global Session Settings */}
      <div>
        <h3 className="text-lg font-medium mb-4">Global Session Settings</h3>
        <div className="space-y-4 p-4 border rounded-lg">
          <div className="space-y-2">
            <Label htmlFor="max-sessions">Maximum Concurrent Sessions</Label>
            <Input
              id="max-sessions"
              type="number"
              min="1"
              max="20"
              value={tempAllAgentSettings?.max_concurrent_sessions || 10}
              onChange={(e) => {
                const newValue = parseInt(e.target.value) || 10
                onUpdateAgentSetting('global', 'max_concurrent_sessions', newValue)
              }}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of CLI sessions that can run simultaneously.
            </p>
          </div>
        </div>
      </div>

      {/* Agent-Specific Settings */}
      {agents.map((agent) => {
        try {
          console.log(`🔍 Processing agent: ${agent.id}`)
          
          // Safely access agent settings with fallbacks
          const agentSettings = tempAllAgentSettings?.[agent.id] || {
            model: '',
            output_format: 'markdown',
            session_timeout_minutes: 30,
            max_tokens: null,
            temperature: null,
            sandbox_mode: false,
            auto_approval: false,
            debug_mode: false
          }
          
          // Ensure all required properties exist
          const safeAgentSettings = {
            model: agentSettings.model || '',
            output_format: agentSettings.output_format || 'markdown',
            session_timeout_minutes: agentSettings.session_timeout_minutes || 30,
            max_tokens: agentSettings.max_tokens || null,
            temperature: agentSettings.temperature || null,
            sandbox_mode: agentSettings.sandbox_mode || false,
            auto_approval: agentSettings.auto_approval || false,
            debug_mode: agentSettings.debug_mode || false
          }
          
          const isEnabled = tempAgentSettings?.[agent.id] || false
          const agentModelsArray = agentModels[agent.id] || []
          const isFetchingModels = fetchingAgentModels[agent.id] || false
          
          console.log(`📊 Agent ${agent.id} state:`, {
            isEnabled,
            agentSettings: safeAgentSettings,
            modelsCount: agentModelsArray.length,
            isFetching: isFetchingModels
          })

          return (
            <div key={agent.id} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-medium">{agent.name}</h3>
                  <div className={`w-2 h-2 rounded-full ${
                    isEnabled ? 'bg-green-500' : 'bg-neutral-500'
                  }`} />
                </div>
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => {
                    try {
                      console.log(`🔄 Toggling agent ${agent.id}: ${checked}`)
                      onToggleAgent(agent.id, checked)
                    } catch (error) {
                      console.error(`❌ Failed to toggle agent ${agent.id}:`, error)
                    }
                  }}
                />
              </div>
              
              <p className="text-sm text-muted-foreground mb-4">{agent.description}</p>
              
              {isEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border rounded-lg bg-muted/30">
                {/* Model Selection */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor={`${agent.id}-model`}>Model</Label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onFetchAgentModels(agent.id)}
                      disabled={isFetchingModels}
                      className="h-6 px-2 text-xs"
                    >
                      {isFetchingModels ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 mr-1" />
                      )}
                      Fetch Models
                    </Button>
                  </div>
                  
                  {agentModelsArray && agentModelsArray.length > 0 ? (
                    <Select 
                      value={safeAgentSettings.model || ''} 
                      onValueChange={(value) => updateAgentSetting(agent.id, 'model', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">Default (use CLI default)</SelectItem>
                        {agentModelsArray.map((model) => (
                          <SelectItem key={model} value={model}>
                            {model}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`${agent.id}-model`}
                      value={safeAgentSettings.model || ''}
                      onChange={(e) => updateAgentSetting(agent.id, 'model', e.target.value)}
                      placeholder="e.g., claude-3-opus, gpt-4, gemini-pro"
                    />
                  )}
                  
                  <p className="text-xs text-muted-foreground">
                    {agentModelsArray && agentModelsArray.length > 0 
                      ? `Found ${agentModelsArray.length} available models. Select one or leave default.`
                      : 'Specific model to use for this agent (optional). Click "Fetch Models" to get available models from CLI.'}
                  </p>
                  
                  {agentModelsArray && agentModelsArray.length === 0 && (
                    <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                      No models found. This might indicate the CLI agent is not installed or not responding correctly.
                    </div>
                  )}
                </div>

                {/* Output Format */}
                <div className="space-y-2">
                  <Label htmlFor={`${agent.id}-format`}>Output Format</Label>
                  <Select 
                    value={safeAgentSettings.output_format || 'markdown'} 
                    onValueChange={(value) => updateAgentSetting(agent.id, 'output_format', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="markdown">Markdown</SelectItem>
                      <SelectItem value="json">JSON</SelectItem>
                      <SelectItem value="plain">Plain Text</SelectItem>
                      <SelectItem value="code">Code Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Session Timeout */}
                <div className="space-y-2">
                  <Label htmlFor={`${agent.id}-timeout`}>
                    <Clock className="h-4 w-4 inline mr-1" />
                    Session Timeout (minutes)
                  </Label>
                  <Input
                    id={`${agent.id}-timeout`}
                    type="number"
                    min="1"
                    max="120"
                    value={safeAgentSettings.session_timeout_minutes}
                    onChange={(e) => updateAgentSetting(agent.id, 'session_timeout_minutes', parseInt(e.target.value) || 30)}
                    className="w-32"
                  />
                </div>

                {/* Max Tokens */}
                <div className="space-y-2">
                  <Label htmlFor={`${agent.id}-tokens`}>Max Tokens</Label>
                  <Input
                    id={`${agent.id}-tokens`}
                    type="number"
                    min="100"
                    max="100000"
                    value={safeAgentSettings.max_tokens || ''}
                    onChange={(e) => updateAgentSetting(agent.id, 'max_tokens', e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Default"
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum tokens per response (leave empty for default)
                  </p>
                </div>

                {/* Temperature */}
                <div className="space-y-2">
                  <Label htmlFor={`${agent.id}-temperature`}>Temperature</Label>
                  <Input
                    id={`${agent.id}-temperature`}
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={safeAgentSettings.temperature || ''}
                    onChange={(e) => updateAgentSetting(agent.id, 'temperature', e.target.value ? parseFloat(e.target.value) : null)}
                    placeholder="Default"
                  />
                  <p className="text-xs text-muted-foreground">
                    Creativity level (0.0 - 2.0, leave empty for default)
                  </p>
                </div>

                {/* Boolean Settings */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor={`${agent.id}-sandbox`}>Sandbox Mode</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Run commands in isolated environment
                      </p>
                    </div>
                    <Switch
                      id={`${agent.id}-sandbox`}
                      checked={safeAgentSettings.sandbox_mode || false}
                      onCheckedChange={(checked) => updateAgentSetting(agent.id, 'sandbox_mode', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor={`${agent.id}-approval`}>Auto-Approval</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Automatically approve suggested changes
                      </p>
                    </div>
                    <Switch
                      id={`${agent.id}-approval`}
                      checked={safeAgentSettings.auto_approval || false}
                      onCheckedChange={(checked) => updateAgentSetting(agent.id, 'auto_approval', checked)}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor={`${agent.id}-debug`}>Debug Mode</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Show detailed execution information
                      </p>
                    </div>
                    <Switch
                      id={`${agent.id}-debug`}
                      checked={safeAgentSettings.debug_mode || false}
                      onCheckedChange={(checked) => updateAgentSetting(agent.id, 'debug_mode', checked)}
                    />
                  </div>
                </div>
              </div>
            )}
            </div>
          )
        } catch (agentError) {
          console.error(`❌ Error rendering agent ${agent.id}:`, agentError)
          return (
            <div key={agent.id} className="p-4 border border-destructive/20 rounded-lg bg-destructive/5">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">
                  Error loading {agent.name} settings
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {agentError instanceof Error ? agentError.message : String(agentError)}
              </p>
            </div>
          )
        }
      })}
    </div>
  )
  } catch (error) {
    console.error('💥 CRITICAL ERROR in SafeAgentSettings:', error)
    console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace')
    console.error('💥 Current state when error occurred:', {
      tempAllAgentSettings,
      tempAgentSettings,
      agentModels,
      agentSettingsLoading,
      agentSettingsError
    })
    
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-4">
        <XCircle className="h-8 w-8 text-destructive" />
        <div className="text-center">
          <p className="text-destructive font-medium">Error rendering CLI agent settings</p>
          <p className="text-sm text-muted-foreground mt-1">
            An unexpected error occurred while displaying the CLI agent settings.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Check browser console for details: {error instanceof Error ? error.message : String(error)}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              // Try to reset to defaults
              window.location.reload()
            }}
            className="mt-4"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </div>
    )
  }
}

export function AgentSettings(props: AgentSettingsProps) {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('🚨 ErrorBoundary caught error in CLI agent settings:', error, errorInfo)
      }}
      fallback={
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <XCircle className="h-8 w-8 text-destructive" />
          <div className="text-center">
            <p className="text-destructive font-medium">CLI Agent Settings Error</p>
            <p className="text-sm text-muted-foreground mt-1">
              The CLI agent settings component crashed unexpectedly.
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
              className="mt-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reload Application
            </Button>
          </div>
        </div>
      }
    >
      <SafeAgentSettings {...props} />
    </ErrorBoundary>
  )
}
