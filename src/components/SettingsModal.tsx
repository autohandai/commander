import { useState, useEffect, useCallback } from "react"
import { Settings as SettingsIcon, Monitor, Bot, MessageSquare, ExternalLink, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { useLLMSettings } from "@/hooks/use-llm-settings"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'general' | 'llms'

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const {
    settings,
    providerStatuses,
    loading,
    saving,
    error,
    updateProvider,
    setActiveProvider,
    fetchProviderModels,
    refreshProviderStatuses,
    openOllamaWebsite,
    updateSelectedModel,
    updateSystemPrompt,
  } = useLLMSettings()
  
  const [fetchingModels, setFetchingModels] = useState<Record<string, boolean>>({})
  const [tempApiKeys, setTempApiKeys] = useState<Record<string, string>>({})
  
  useEffect(() => {
    if (settings) {
      // Initialize temp API keys with current values
      const keys: Record<string, string> = {}
      Object.entries(settings.providers).forEach(([id, provider]) => {
        if (provider.api_key) {
          keys[id] = provider.api_key
        }
      })
      setTempApiKeys(keys)
    }
  }, [settings])

  // Auto-fetch models when modal opens and LLM tab is selected
  useEffect(() => {
    if (isOpen && activeTab === 'llms' && settings) {
      // Fetch models in parallel for all configured providers
      const fetchPromises: Promise<void>[] = []
      
      Object.entries(settings.providers).forEach(([id, provider]) => {
        // Check if we should auto-fetch models
        const shouldFetch = provider.provider_type === 'ollama' 
          ? providerStatuses[id]?.installed
          : provider.provider_type === 'openrouter' 
            ? true // Always fetch OpenRouter models (no API key needed)
            : provider.api_key !== null && provider.api_key !== undefined && provider.api_key !== ''
        
        // Auto-fetch if we should and no models loaded yet (or very few)
        if (shouldFetch && (!provider.models || provider.models.length === 0)) {
          // Don't re-fetch if already fetching
          if (!fetchingModels[id]) {
            fetchPromises.push(handleFetchModels(id).catch(console.error))
          }
        }
      })
      
      // Run all fetches in parallel
      if (fetchPromises.length > 0) {
        Promise.all(fetchPromises)
      }
    }
  }, [isOpen, activeTab, settings, providerStatuses]) // Added providerStatuses dependency
  
  const handleSaveApiKey = async (providerId: string) => {
    const apiKey = tempApiKeys[providerId]
    if (!apiKey) return
    
    try {
      await updateProvider(providerId, { api_key: apiKey })
      
      // If this is OpenRouter, fetch models
      if (settings?.providers[providerId]?.provider_type === 'openrouter') {
        await handleFetchModels(providerId)
      }
    } catch (err) {
      console.error('Failed to save API key:', err)
    }
  }
  
  const handleFetchModels = async (providerId: string) => {
    setFetchingModels(prev => ({ ...prev, [providerId]: true }))
    try {
      const models = await fetchProviderModels(providerId)
      await updateProvider(providerId, { models })
    } catch (err) {
      console.error('Failed to fetch models:', err)
    } finally {
      setFetchingModels(prev => ({ ...prev, [providerId]: false }))
    }
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

  const menuItems = [
    {
      id: 'general' as const,
      label: 'General',
      icon: Monitor,
    },
    {
      id: 'llms' as const,
      label: 'AI',
      icon: Bot,
    },
  ]

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">General Settings</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">Application Name</Label>
            <Input
              id="app-name"
              placeholder="Commander"
              defaultValue="Commander"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-path">Default Workspace Path</Label>
            <Input
              id="workspace-path"
              placeholder="/Users/username/Projects"
              defaultValue="/Users/username/Projects"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select defaultValue="auto">
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (System)</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="system-prompt">Global System Prompt</Label>
            <Textarea
              id="system-prompt"
              placeholder="Enter a global system prompt that will be used across all LLM providers..."
              value={settings?.system_prompt || ''}
              onChange={(e) => updateSystemPrompt(e.target.value)}
              disabled={saving}
              rows={4}
              className="resize-vertical"
            />
            <p className="text-xs text-muted-foreground">
              This prompt will be sent to all LLM providers as the system message for conversations.
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const renderLLMSettings = () => {
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
        {/* Active Provider Selection */}
        <div>
          <h3 className="text-lg font-medium mb-4">Active Provider</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="active-provider">Current Provider</Label>
              <Select value={settings.active_provider} onValueChange={setActiveProvider}>
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
              onClick={refreshProviderStatuses}
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
                      onClick={openOllamaWebsite}
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
                      onChange={(e) => updateProvider(id, { base_url: e.target.value })}
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
                        onChange={(e) => setTempApiKeys(prev => ({ ...prev, [id]: e.target.value }))}
                        placeholder={provider.provider_type === 'openai' ? 'sk-...' : 'sk-or-...'}
                      />
                      <Button
                        onClick={() => handleSaveApiKey(id)}
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
                      onValueChange={(modelId) => updateSelectedModel(id, modelId)}
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
                        onClick={() => handleFetchModels(id)}
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


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[85vw] max-w-[1400px] h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" />
            Settings
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Menu Panel */}
          <div className="w-64 border-r bg-muted/20 p-4 flex-shrink-0 overflow-y-auto">
            <nav className="space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <Button
                    key={item.id}
                    variant={activeTab === item.id ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setActiveTab(item.id)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </Button>
                )
              })}
            </nav>
          </div>

          {/* Right Content Panel */}
          <div className="flex-1 p-6 overflow-y-auto min-w-0">
            <div className="max-w-4xl">
              {activeTab === 'general' && renderGeneralSettings()}
              {activeTab === 'llms' && renderLLMSettings()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t flex-shrink-0 bg-background">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onClose} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? 'Saving...' : 'Close'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}