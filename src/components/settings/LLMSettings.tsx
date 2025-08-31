import { ExternalLink, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2, MessageSquare } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import type { LLMSettingsProps } from "@/types/settings"

export function LLMSettings({
  settings,
  providerStatuses,
  loading,
  saving,
  error,
  tempApiKeys,
  fetchingModels,
  onUpdateProvider,
  onSetActiveProvider,
  onFetchModels,
  onRefreshStatuses,
  onOpenOllamaWebsite,
  onUpdateSelectedModel,
  onSaveApiKey,
  onTempApiKeyChange,
  onUpdateSystemPrompt
}: LLMSettingsProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading LLM settings...
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error: {error}</p>
      </div>
    )
  }
  
  if (!settings) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Failed to load LLM settings</p>
      </div>
    )
  }
  
  const getProviderStatusBadge = (providerId: string) => {
    const status = providerStatuses[providerId]
    if (!status) return null
    
    if (!status.installed) {
      return <Badge variant="destructive" className="flex items-center gap-1"><XCircle className="h-3 w-3" />Not Installed</Badge>
    }
    
    if (!status.configured) {
      return <Badge variant="warning" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" />Not Configured</Badge>
    }
    
    if (status.models_loaded) {
      return <Badge variant="success" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />Ready</Badge>
    }
    
    return <Badge variant="outline" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" />No Models</Badge>
  }
  
  // Sort providers: configured ones first
  const sortedProviders = Object.entries(settings.providers).sort(([idA, providerA], [idB, providerB]) => {
    const isConfiguredA = providerA.provider_type === 'ollama' 
      ? providerStatuses[idA]?.installed
      : providerA.api_key !== null && providerA.api_key !== undefined && providerA.api_key !== ''
    
    const isConfiguredB = providerB.provider_type === 'ollama'
      ? providerStatuses[idB]?.installed  
      : providerB.api_key !== null && providerB.api_key !== undefined && providerB.api_key !== ''
    
    if (isConfiguredA === isConfiguredB) return 0
    return isConfiguredA ? -1 : 1
  })

  return (
    <div className="space-y-6">
      {/* System Prompt Configuration */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">System Prompt</h3>
        </div>
        <div className="space-y-2">
          <Label htmlFor="system-prompt">Global System Prompt</Label>
          <Textarea
            id="system-prompt"
            placeholder="You are a helpful AI assistant. You provide clear, accurate, and helpful responses to user questions..."
            value={settings?.system_prompt || ''}
            onChange={(e) => onUpdateSystemPrompt(e.target.value)}
            disabled={saving}
            rows={4}
            className="resize-vertical"
          />
          <p className="text-xs text-muted-foreground">
            This prompt will be sent to all LLM providers as the system message for conversations. It defines the AI's personality and behavior.
          </p>
        </div>
      </div>
      
      <Separator />
      
      {/* Active Provider Selection */}
      <div>
        <h3 className="text-lg font-medium mb-4">Active Provider</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="active-provider">Current Provider</Label>
            <Select value={settings.active_provider} onValueChange={onSetActiveProvider}>
              <SelectTrigger>
                <SelectValue placeholder="Select a provider" />
              </SelectTrigger>
              <SelectContent>
                {sortedProviders.map(([id, provider]) => (
                  <SelectItem key={id} value={id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{provider.name}</span>
                      {getProviderStatusBadge(id)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      <Separator />
      
      {/* Provider Configurations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Provider Configuration</h3>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshStatuses}
            disabled={saving}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Status
          </Button>
        </div>
        
        <div className="space-y-6">
          {sortedProviders.map(([id, provider]) => (
            <div key={id} className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h4 className="font-medium">{provider.name}</h4>
                  {getProviderStatusBadge(id)}
                </div>
                {provider.provider_type === 'ollama' && !providerStatuses[id]?.installed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenOllamaWebsite}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Install Ollama
                  </Button>
                )}
              </div>
              
              {/* Base URL */}
              {provider.base_url && (
                <div className="space-y-2">
                  <Label htmlFor={`${id}-base-url`}>Base URL</Label>
                  <Input
                    id={`${id}-base-url`}
                    value={provider.base_url}
                    onChange={(e) => onUpdateProvider(id, { base_url: e.target.value })}
                    placeholder="https://api.example.com/v1"
                  />
                </div>
              )}
              
              {/* API Key for providers that need it */}
              {(provider.provider_type === 'openai' || provider.provider_type === 'openrouter') && (
                <div className="space-y-2">
                  <Label htmlFor={`${id}-api-key`}>API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`${id}-api-key`}
                      type="password"
                      value={tempApiKeys[id] || ''}
                      onChange={(e) => onTempApiKeyChange(id, e.target.value)}
                      placeholder={provider.provider_type === 'openai' ? 'sk-...' : 'sk-or-...'}
                    />
                    <Button
                      onClick={() => onSaveApiKey(id)}
                      disabled={!tempApiKeys[id] || saving}
                      size="sm"
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
              
              {/* Model Selection */}
              {provider.models.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor={`${id}-selected-model`}>Selected Model</Label>
                  <Select 
                    value={provider.selected_model || ''} 
                    onValueChange={(modelId) => onUpdateSelectedModel(id, modelId)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {provider.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex items-center justify-between w-full">
                            <span className="font-mono text-sm">{model.id}</span>
                            {model.input_cost !== undefined && (
                              <span className="text-xs text-muted-foreground ml-2">
                                ${model.input_cost?.toFixed(4)}/1K
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Models */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Available Models</Label>
                  {provider.provider_type !== 'openai' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onFetchModels(id)}
                      disabled={fetchingModels[id] || !providerStatuses[id]?.configured}
                    >
                      {fetchingModels[id] ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Fetch Models
                    </Button>
                  )}
                </div>
                
                {provider.models.length > 0 ? (
                  <div className="max-h-32 overflow-y-auto border rounded p-2">
                    <div className="text-sm space-y-1">
                      {provider.models.map((model) => (
                        <div key={model.id} className="flex items-center justify-between py-1">
                          <span className="font-mono text-xs">{model.id}</span>
                          {model.input_cost !== undefined && (
                            <span className="text-xs text-muted-foreground">
                              ${model.input_cost?.toFixed(4)}/1K tokens
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    {provider.provider_type === 'ollama' && !providerStatuses[id]?.installed
                      ? 'Ollama not installed'
                      : !providerStatuses[id]?.configured
                      ? 'Provider not configured'
                      : 'No models available'}
                  </p>
                )}
              </div>
              
              {/* Error display */}
              {providerStatuses[id]?.error && (
                <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
                  {providerStatuses[id]?.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
          {error}
        </div>
      )}
    </div>
  )
}