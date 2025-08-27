import { useState, useEffect, useCallback } from "react"
import { Settings as SettingsIcon, Monitor, Bot, ExternalLink, RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2, FolderOpen, Users, Clock, GitBranch, User, Mail, Link2, Zap, MessageCircle } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useLLMSettings } from "@/hooks/use-llm-settings"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'general' | 'git' | 'chat' | 'agents' | 'llms'

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  console.log('🏗️ SettingsModal render - isOpen:', isOpen)
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  console.log('📋 Current activeTab:', activeTab)
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
  const [defaultProjectsFolder, setDefaultProjectsFolder] = useState('')
  const [tempDefaultProjectsFolder, setTempDefaultProjectsFolder] = useState('')
  const [showConsoleOutput, setShowConsoleOutput] = useState(true)
  const [tempShowConsoleOutput, setTempShowConsoleOutput] = useState(true)
  const [fileMentionsEnabled, setFileMentionsEnabled] = useState(true)
  const [tempFileMentionsEnabled, setTempFileMentionsEnabled] = useState(true)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false)
  const [agentSettings, setAgentSettings] = useState<Record<string, boolean>>({})
  const [tempAgentSettings, setTempAgentSettings] = useState<Record<string, boolean>>({})
  const [allAgentSettings, setAllAgentSettings] = useState<any>(null)
  const [tempAllAgentSettings, setTempAllAgentSettings] = useState<any>(null)
  const [agentModels, setAgentModels] = useState<Record<string, string[]>>({})
  const [fetchingAgentModels, setFetchingAgentModels] = useState<Record<string, boolean>>({})
  const [agentSettingsLoading, setAgentSettingsLoading] = useState(true)
  const [agentSettingsError, setAgentSettingsError] = useState<string | null>(null)
  
  // Git-related state
  const [gitConfig, setGitConfig] = useState<{
    global: Record<string, string>
    local: Record<string, string>
    aliases: Record<string, string>
  }>({
    global: {},
    local: {},
    aliases: {}
  })
  const [gitWorktreeEnabled, setGitWorktreeEnabled] = useState(false)
  const [gitConfigLoading, setGitConfigLoading] = useState(false)
  const [gitConfigError, setGitConfigError] = useState<string | null>(null)
  
  // Load app settings and projects folder on mount
  useEffect(() => {
    const loadAppSettings = async () => {
      try {
        console.log('🔄 Loading app settings...')
        
        // Load app settings with error handling
        try {
          const appSettings = await invoke('load_app_settings') as any
          console.log('📦 App settings loaded:', appSettings)
          setShowConsoleOutput(appSettings?.show_console_output ?? true)
          setTempShowConsoleOutput(appSettings?.show_console_output ?? true)
          setFileMentionsEnabled(appSettings?.file_mentions_enabled ?? true)
          setTempFileMentionsEnabled(appSettings?.file_mentions_enabled ?? true)
        } catch (error) {
          console.error('❌ Failed to load app settings, using defaults:', error)
          setShowConsoleOutput(true)
          setTempShowConsoleOutput(true)
          setFileMentionsEnabled(true)
          setTempFileMentionsEnabled(true)
        }

        // Load projects folder with error handling
        try {
          const savedFolder = await invoke('load_projects_folder') as string | null
          
          let folder: string
          if (savedFolder) {
            folder = savedFolder
          } else {
            // Fall back to default projects folder
            folder = await invoke('get_default_projects_folder') as string
          }
          
          console.log('📁 Projects folder determined:', folder)
          setDefaultProjectsFolder(folder)
          setTempDefaultProjectsFolder(folder)
          
          // Ensure the directory exists
          await invoke('ensure_directory_exists', { path: folder })
        } catch (error) {
          console.error('❌ Failed to load projects folder:', error)
          // Use a safe default
          const fallbackFolder = '/tmp'
          setDefaultProjectsFolder(fallbackFolder)
          setTempDefaultProjectsFolder(fallbackFolder)
        }

        // Load basic agent settings with error handling
        try {
          const savedAgentSettings = await invoke('load_agent_settings') as Record<string, boolean> | null
          const defaultAgentSettings = {
            'claude': true,
            'codex': true, 
            'gemini': true
          }
          const finalAgentSettings = savedAgentSettings || defaultAgentSettings
          console.log('👥 Basic agent settings loaded:', finalAgentSettings)
          setAgentSettings(finalAgentSettings)
          setTempAgentSettings(finalAgentSettings)
        } catch (error) {
          console.error('❌ Failed to load basic agent settings, using defaults:', error)
          const defaultAgentSettings = {
            'claude': true,
            'codex': true, 
            'gemini': true
          }
          setAgentSettings(defaultAgentSettings)
          setTempAgentSettings(defaultAgentSettings)
        }

        // Load comprehensive agent settings with extensive error handling
        try {
          console.log('🔄 Starting to load all agent settings...')
          setAgentSettingsLoading(true)
          setAgentSettingsError(null)
          
          const allSettings = await invoke('load_all_agent_settings') as any
          console.log('📦 Raw allSettings from Tauri:', allSettings)
          
          // Validate and sanitize the loaded settings
          const validatedSettings = {
            max_concurrent_sessions: allSettings?.max_concurrent_sessions || 10,
            claude: {
              model: allSettings?.claude?.model || '',
              output_format: allSettings?.claude?.output_format || 'markdown',
              session_timeout_minutes: allSettings?.claude?.session_timeout_minutes || 30,
              max_tokens: allSettings?.claude?.max_tokens || null,
              temperature: allSettings?.claude?.temperature || null,
              sandbox_mode: allSettings?.claude?.sandbox_mode || false,
              auto_approval: allSettings?.claude?.auto_approval || false,
              debug_mode: allSettings?.claude?.debug_mode || false
            },
            codex: {
              model: allSettings?.codex?.model || '',
              output_format: allSettings?.codex?.output_format || 'markdown',
              session_timeout_minutes: allSettings?.codex?.session_timeout_minutes || 30,
              max_tokens: allSettings?.codex?.max_tokens || null,
              temperature: allSettings?.codex?.temperature || null,
              sandbox_mode: allSettings?.codex?.sandbox_mode || false,
              auto_approval: allSettings?.codex?.auto_approval || false,
              debug_mode: allSettings?.codex?.debug_mode || false
            },
            gemini: {
              model: allSettings?.gemini?.model || '',
              output_format: allSettings?.gemini?.output_format || 'markdown',
              session_timeout_minutes: allSettings?.gemini?.session_timeout_minutes || 30,
              max_tokens: allSettings?.gemini?.max_tokens || null,
              temperature: allSettings?.gemini?.temperature || null,
              sandbox_mode: allSettings?.gemini?.sandbox_mode || false,
              auto_approval: allSettings?.gemini?.auto_approval || false,
              debug_mode: allSettings?.gemini?.debug_mode || false
            }
          }
          
          console.log('✅ Validated agent settings:', validatedSettings)
          setAllAgentSettings(validatedSettings)
          setTempAllAgentSettings(validatedSettings)
          console.log('✅ Agent settings state updated successfully')
        } catch (error) {
          console.error('❌ Failed to load all agent settings, using defaults:', error)
          setAgentSettingsError(`Failed to load agent settings: ${error}`)
          
          // Set default agent settings if loading fails
          const defaultAllSettings = {
            max_concurrent_sessions: 10,
            claude: {
              model: '',
              output_format: 'markdown',
              session_timeout_minutes: 30,
              max_tokens: null,
              temperature: null,
              sandbox_mode: false,
              auto_approval: false,
              debug_mode: false
            },
            codex: {
              model: '',
              output_format: 'markdown',
              session_timeout_minutes: 30,
              max_tokens: null,
              temperature: null,
              sandbox_mode: false,
              auto_approval: false,
              debug_mode: false
            },
            gemini: {
              model: '',
              output_format: 'markdown',
              session_timeout_minutes: 30,
              max_tokens: null,
              temperature: null,
              sandbox_mode: false,
              auto_approval: false,
              debug_mode: false
            }
          }
          console.log('🔄 Using default agent settings:', defaultAllSettings)
          setAllAgentSettings(defaultAllSettings)
          setTempAllAgentSettings(defaultAllSettings)
        } finally {
          console.log('🏁 Agent settings loading complete, setting loading to false')
          setAgentSettingsLoading(false)
        }
      } catch (error) {
        console.error('💥 CRITICAL ERROR loading app settings:', error)
        console.error('💥 Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        
        // Set safe defaults to prevent further crashes
        setShowConsoleOutput(true)
        setTempShowConsoleOutput(true)
        setDefaultProjectsFolder('/tmp')
        setTempDefaultProjectsFolder('/tmp')
        
        const defaultAgentSettings = {
          'claude': true,
          'codex': true, 
          'gemini': true
        }
        setAgentSettings(defaultAgentSettings)
        setTempAgentSettings(defaultAgentSettings)
        
        const defaultAllSettings = {
          max_concurrent_sessions: 10,
          claude: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
          codex: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
          gemini: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false }
        }
        setAllAgentSettings(defaultAllSettings)
        setTempAllAgentSettings(defaultAllSettings)
        setAgentSettingsLoading(false)
        setAgentSettingsError(`Critical error during initialization: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    
    // Wrap the loading in a try-catch to prevent crashes
    try {
      loadAppSettings()
    } catch (error) {
      console.error('💥 Failed to start loadAppSettings:', error)
      setAgentSettingsLoading(false)
      setAgentSettingsError('Failed to initialize settings')
    }
  }, [])
  
  useEffect(() => {
    try {
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
    } catch (error) {
      console.error('❌ Error initializing temp API keys:', error)
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

  // Debug effect to log when agents tab is opened
  useEffect(() => {
    try {
      console.log('🔍 AGENTS TAB EFFECT - State changed:', {
        isOpen,
        activeTab,
        tempAgentSettings,
        agentModels,
        fetchingAgentModels
      })
      
      if (activeTab === 'agents') {
        console.log('👥 AGENTS TAB IS ACTIVE!')
        console.log('📊 Current agent-related state:', {
          agentSettingsLoading,
          agentSettingsError, 
          allAgentSettings,
          tempAllAgentSettings,
          tempAgentSettings
        })
      }
    } catch (error) {
      console.error('❌ Error in debug effect:', error)
    }
  }, [isOpen, activeTab, tempAgentSettings, agentModels, fetchingAgentModels, agentSettingsLoading, agentSettingsError, allAgentSettings, tempAllAgentSettings])

  // Auto-fetch agent models when agents tab is opened
  useEffect(() => {
    try {
      if (isOpen && activeTab === 'agents' && tempAgentSettings) {
        const agents = ['claude', 'codex', 'gemini']
        
        // Use setTimeout to prevent update during render
        const timeoutId = setTimeout(() => {
          agents.forEach(agentId => {
            // Auto-fetch if agent is enabled and we haven't fetched models yet
            if (tempAgentSettings[agentId] && !agentModels[agentId] && !fetchingAgentModels[agentId]) {
              handleFetchAgentModels(agentId)
            }
          })
        }, 100)
        
        return () => clearTimeout(timeoutId)
      }
    } catch (error) {
      console.error('❌ Error in auto-fetch agent models effect:', error)
    }
    // Removed handleFetchAgentModels from dependencies to prevent infinite loop
  }, [isOpen, activeTab, tempAgentSettings, agentModels, fetchingAgentModels])

  // Load git configurations when general or git tab is opened
  useEffect(() => {
    if (isOpen && (activeTab === 'general' || activeTab === 'git') && Object.keys(gitConfig.global).length === 0 && !gitConfigLoading) {
      loadGitConfigurations()
    }
  }, [isOpen, activeTab, gitConfig.global, gitConfigLoading])
  
  // Track changes to detect unsaved changes
  useEffect(() => {
    const hasChanges = tempDefaultProjectsFolder !== defaultProjectsFolder ||
                      tempShowConsoleOutput !== showConsoleOutput ||
                      tempFileMentionsEnabled !== fileMentionsEnabled ||
                      Object.keys(tempApiKeys).some(key => tempApiKeys[key] !== settings?.providers[key]?.api_key) ||
                      Object.keys(tempAgentSettings).some(key => tempAgentSettings[key] !== agentSettings[key]) ||
                      JSON.stringify(tempAllAgentSettings) !== JSON.stringify(allAgentSettings)
    setHasUnsavedChanges(hasChanges)
  }, [tempDefaultProjectsFolder, defaultProjectsFolder, tempShowConsoleOutput, showConsoleOutput, tempFileMentionsEnabled, fileMentionsEnabled, tempApiKeys, settings, tempAgentSettings, agentSettings, tempAllAgentSettings, allAgentSettings])
  
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
  
  const handleSaveProjectsFolder = async () => {
    try {
      // Ensure the directory exists
      await invoke('ensure_directory_exists', { path: tempDefaultProjectsFolder })
      
      // Save to persistent storage
      await invoke('save_projects_folder', { path: tempDefaultProjectsFolder })
      
      setDefaultProjectsFolder(tempDefaultProjectsFolder)
      console.log('Projects folder saved:', tempDefaultProjectsFolder)
    } catch (error) {
      console.error('Failed to save projects folder:', error)
    }
  }

  const handleSelectProjectsFolder = async () => {
    try {
      console.log('📂 Opening folder selection dialog...')
      const selectedPath = await invoke('select_projects_folder') as string | null
      
      if (selectedPath) {
        console.log('📁 Folder selected:', selectedPath)
        setTempDefaultProjectsFolder(selectedPath)
        
        // Optionally save immediately
        try {
          await invoke('ensure_directory_exists', { path: selectedPath })
          await invoke('save_projects_folder', { path: selectedPath })
          setDefaultProjectsFolder(selectedPath)
          console.log('✅ Projects folder updated and saved:', selectedPath)
        } catch (saveError) {
          console.error('❌ Failed to save selected folder:', saveError)
          // Keep the temp value so user can still save manually
        }
      } else {
        console.log('📂 Folder selection cancelled by user')
      }
    } catch (error) {
      console.error('❌ Failed to open folder selection dialog:', error)
    }
  }

  const handleClearRecentProjects = async () => {
    try {
      console.log('🧹 Clearing recent projects...')
      await invoke('clear_recent_projects')
      console.log('✅ Recent projects cleared successfully!')
      
      // Show success message
      // You could add a toast here if you have a toast system
      alert('Recent projects cleared successfully!')
      
      // Optionally refresh the app or emit an event to refresh sidebar
      window.location.reload() // Simple way to refresh everything
    } catch (error) {
      console.error('❌ Failed to clear recent projects:', error)
      alert('Failed to clear recent projects: ' + error)
    }
  }

  const handleCloseModal = () => {
    if (hasUnsavedChanges) {
      setShowUnsavedChangesDialog(true)
    } else {
      onClose()
    }
  }

  const handleDiscardChanges = () => {
    // Reset all temp values to original values
    setTempDefaultProjectsFolder(defaultProjectsFolder)
    setTempShowConsoleOutput(showConsoleOutput)
    setTempFileMentionsEnabled(fileMentionsEnabled)
    setTempAgentSettings(agentSettings)
    setTempAllAgentSettings(allAgentSettings)
    if (settings) {
      const keys: Record<string, string> = {}
      Object.entries(settings.providers).forEach(([id, provider]) => {
        if (provider.api_key) {
          keys[id] = provider.api_key
        }
      })
      setTempApiKeys(keys)
    }
    setShowUnsavedChangesDialog(false)
    onClose()
  }

  const handleFetchAgentModels = useCallback(async (agentId: string) => {
    try {
      // Prevent concurrent fetches for the same agent
      if (fetchingAgentModels[agentId]) {
        console.log(`Already fetching models for ${agentId}, skipping`)
        return
      }
      
      setFetchingAgentModels(prev => ({ ...prev, [agentId]: true }))
      
      const models = await invoke<string[]>('fetch_agent_models', { agent: agentId })
      
      // Validate the response
      if (Array.isArray(models)) {
        setAgentModels(prev => ({ ...prev, [agentId]: models }))
        console.log(`✅ Fetched ${models.length} models for ${agentId}:`, models)
      } else {
        console.warn(`Invalid response for ${agentId} models, expected array`)
        setAgentModels(prev => ({ ...prev, [agentId]: [] }))
      }
    } catch (error) {
      console.error(`❌ Failed to fetch models for ${agentId}:`, error)
      // Set empty array on error to show that fetch was attempted
      setAgentModels(prev => ({ ...prev, [agentId]: [] }))
    } finally {
      // Ensure we always clear the fetching flag
      setFetchingAgentModels(prev => ({ ...prev, [agentId]: false }))
    }
  }, [fetchingAgentModels])

  // Git configuration functions with sequential loading
  const loadGitConfigurations = async () => {
    setGitConfigLoading(true)
    setGitConfigError(null)
    
    try {
      console.log('🔄 Starting sequential git configuration loading...')
      
      // Step 1: Load global configuration
      console.log('📍 Step 1: Loading global git configuration...')
      const globalConfig = await invoke<Record<string, string>>('get_git_global_config')
        .catch((error) => {
          console.warn('⚠️ Failed to load global config:', error)
          return {}
        })
      
      // Update state after each step to show progress
      setGitConfig(prev => ({ ...prev, global: globalConfig }))
      
      // Step 2: Load local configuration
      console.log('📍 Step 2: Loading local git configuration...')
      const localConfig = await invoke<Record<string, string>>('get_git_local_config')
        .catch((error) => {
          console.warn('⚠️ Failed to load local config:', error)
          return {}
        })
      
      setGitConfig(prev => ({ ...prev, local: localConfig }))
      
      // Step 3: Load git aliases
      console.log('📍 Step 3: Loading git aliases...')
      const aliases = await invoke<Record<string, string>>('get_git_aliases')
        .catch((error) => {
          console.warn('⚠️ Failed to load aliases:', error)
          return {}
        })
      
      setGitConfig(prev => ({ ...prev, aliases: aliases }))
      
      // Step 4: Check worktree availability
      console.log('📍 Step 4: Checking git worktree availability...')
      const worktreeEnabled = await invoke<boolean>('get_git_worktree_enabled')
        .catch((error) => {
          console.warn('⚠️ Failed to check worktree availability:', error)
          return false
        })
      
      setGitWorktreeEnabled(worktreeEnabled)
      
      console.log('✅ Git configurations loaded successfully:', {
        globalConfigCount: Object.keys(globalConfig).length,
        localConfigCount: Object.keys(localConfig).length,
        aliasesCount: Object.keys(aliases).length,
        worktreeEnabled
      })
    } catch (error) {
      console.error('❌ Critical error during git configuration loading:', error)
      setGitConfigError(`Failed to load git configurations: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setGitConfigLoading(false)
    }
  }

  const handleRefreshGitConfig = async () => {
    await loadGitConfigurations()
  }

  const handleToggleGitWorktree = async (enabled: boolean) => {
    try {
      console.log(`🔄 ${enabled ? 'Enabling' : 'Disabling'} workspaces (git worktree)...`)
      await invoke('set_git_worktree_enabled', { enabled })
      setGitWorktreeEnabled(enabled)
      console.log(`✅ Workspaces ${enabled ? 'enabled' : 'disabled'} successfully`)
    } catch (error) {
      console.error('❌ Failed to toggle workspaces:', error)
      setGitConfigError(`Failed to ${enabled ? 'enable' : 'disable'} workspaces: ${error}`)
      // Revert the toggle on error
      setGitWorktreeEnabled(!enabled)
    }
  }

  const handleSaveChanges = async () => {
    try {
      // Save app settings
      if (tempShowConsoleOutput !== showConsoleOutput || tempDefaultProjectsFolder !== defaultProjectsFolder || tempFileMentionsEnabled !== fileMentionsEnabled) {
        await invoke('save_app_settings', {
          settings: {
            show_console_output: tempShowConsoleOutput,
            projects_folder: tempDefaultProjectsFolder,
            file_mentions_enabled: tempFileMentionsEnabled
          }
        })
        setShowConsoleOutput(tempShowConsoleOutput)
        setFileMentionsEnabled(tempFileMentionsEnabled)
      }

      // Save projects folder
      if (tempDefaultProjectsFolder !== defaultProjectsFolder) {
        await handleSaveProjectsFolder()
      }

      // Save agent settings
      if (Object.keys(tempAgentSettings).some(key => tempAgentSettings[key] !== agentSettings[key])) {
        await invoke('save_agent_settings', { settings: tempAgentSettings })
        setAgentSettings(tempAgentSettings)
      }

      // Save comprehensive agent settings
      if (JSON.stringify(tempAllAgentSettings) !== JSON.stringify(allAgentSettings)) {
        await invoke('save_all_agent_settings', { settings: tempAllAgentSettings })
        setAllAgentSettings(tempAllAgentSettings)
      }
      
      // Save API keys
      for (const [providerId, apiKey] of Object.entries(tempApiKeys)) {
        if (apiKey && apiKey !== settings?.providers[providerId]?.api_key) {
          await handleSaveApiKey(providerId)
        }
      }
      
      setShowUnsavedChangesDialog(false)
      onClose()
    } catch (error) {
      console.error('Failed to save changes:', error)
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
      id: 'git' as const,
      label: 'Git',
      icon: GitBranch,
    },
    {
      id: 'chat' as const,
      label: 'Chat',
      icon: MessageCircle,
    },
    {
      id: 'agents' as const,
      label: 'Agents',
      icon: Users,
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
            <Label htmlFor="projects-folder">Default Projects Folder</Label>
            <div className="flex gap-2">
              <Input
                id="projects-folder"
                placeholder="/Users/username/Projects"
                value={tempDefaultProjectsFolder}
                onChange={(e) => setTempDefaultProjectsFolder(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectProjectsFolder}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This folder will be used as the default location for cloning repositories.
            </p>
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
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Console Output</h4>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="console-output">Show Console Output</Label>
                <p className="text-xs text-muted-foreground">
                  Display real-time console output during git operations like cloning repositories.
                </p>
              </div>
              <Switch
                id="console-output"
                checked={tempShowConsoleOutput}
                onCheckedChange={setTempShowConsoleOutput}
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Development Tools</h4>
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Clear Recent Projects</Label>
                  <p className="text-xs text-muted-foreground">
                    Clear all recent projects from local storage (development only)
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearRecentProjects}
                  disabled={saving}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <Separator />
      
      <TooltipProvider>
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Git Configuration
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshGitConfig}
              disabled={gitConfigLoading}
            >
              {gitConfigLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
          
          {gitConfigError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded mb-4">
              Failed to load git configuration: {gitConfigError}
            </div>
          )}
          
          <div className="space-y-6">
            {/* Git Worktree Toggle */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Git Worktree
              </h4>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="git-worktree">Enable Git Worktree Support</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-auto p-1">
                          <Link2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Git worktrees allow you to check out multiple branches in separate directories.
                          <br />
                          <a 
                            href="https://git-scm.com/docs/git-worktree" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 underline hover:text-blue-300"
                          >
                            Learn more about git worktree
                          </a>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Allows working with multiple branches simultaneously in separate directories.
                  </p>
                </div>
                <Switch
                  id="git-worktree"
                  checked={gitWorktreeEnabled}
                  onCheckedChange={handleToggleGitWorktree}
                  disabled={gitConfigLoading}
                />
              </div>
            </div>
            
            {/* Global Git Configuration */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Global Configuration
              </h4>
              {gitConfigLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading git configuration...
                </div>
              ) : Object.keys(gitConfig.global).length > 0 ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* User settings */}
                    {gitConfig.global['user.name'] && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <User className="h-3 w-3" />
                          Name
                        </div>
                        <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded">
                          {gitConfig.global['user.name']}
                        </p>
                      </div>
                    )}
                    {gitConfig.global['user.email'] && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Mail className="h-3 w-3" />
                          Email
                        </div>
                        <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded">
                          {gitConfig.global['user.email']}
                        </p>
                      </div>
                    )}
                    
                    {/* Other global settings */}
                    {Object.entries(gitConfig.global)
                      .filter(([key]) => !key.startsWith('user.') && !key.startsWith('alias.'))
                      .slice(0, 8) // Show max 8 other settings to avoid overwhelming
                      .map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <div className="text-sm font-medium">{key}</div>
                          <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded break-all">
                            {value}
                          </p>
                        </div>
                      ))}
                  </div>
                  
                  {Object.keys(gitConfig.global).filter(key => !key.startsWith('user.') && !key.startsWith('alias.')).length > 8 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      ... and {Object.keys(gitConfig.global).filter(key => !key.startsWith('user.') && !key.startsWith('alias.')).length - 8} more settings
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No global git configuration found. Make sure Git is installed and configured.
                </p>
              )}
            </div>
            
            {/* Local Git Configuration */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Local Configuration
              </h4>
              {gitConfigLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </div>
              ) : Object.keys(gitConfig.local).length > 0 ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(gitConfig.local).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="text-sm font-medium">{key}</div>
                        <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded break-all">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No local git configuration found. This directory may not be a git repository.
                </p>
              )}
            </div>
            
            {/* Git Aliases */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Git Aliases
              </h4>
              {gitConfigLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </div>
              ) : Object.keys(gitConfig.aliases).length > 0 ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="space-y-3">
                    {Object.entries(gitConfig.aliases).map(([alias, command]) => (
                      <div key={alias} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-background rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <code className="text-sm font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                            git {alias}
                          </code>
                        </div>
                        <div className="flex-1 min-w-0">
                          <code className="text-sm font-mono text-muted-foreground break-all">
                            {command}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No git aliases configured. You can add aliases with <code className="bg-muted px-1 py-0.5 rounded text-xs">git config --global alias.alias_name "command"</code>
                </p>
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  )

  const renderGitSettings = () => (
    <TooltipProvider>
      <div className="space-y-8">
        {/* Git Workspaces Configuration */}
        <div>
          <h3 className="text-lg font-medium mb-4">Workspaces</h3>
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="git-worktree">Enable Workspaces</Label>
                <p className="text-sm text-muted-foreground">
                  Workspaces use Git worktrees to create isolated environments for different features. Work on multiple branches simultaneously without switching contexts.
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  <a 
                    href="https://git-scm.com/docs/git-worktree" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    Learn more about Git Worktree
                  </a>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Switch
                    id="git-worktree"
                    checked={gitWorktreeEnabled}
                    onCheckedChange={handleToggleGitWorktree}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Workspaces create separate directories for each branch using Git worktrees, enabling seamless multi-branch development</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <Separator />

        {/* Git Configuration */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Git Configuration</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshGitConfig}
              disabled={gitConfigLoading}
            >
              {gitConfigLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>

          {gitConfigError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded mb-4">
              {gitConfigError}
            </div>
          )}

          <div className="space-y-6">
            {/* Global Git Configuration */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Global Configuration
              </h4>
              {gitConfigLoading ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(gitConfig.global).length > 0 ? (
                      Object.entries(gitConfig.global)
                        .filter(([key]) => ['user.name', 'user.email', 'core.editor', 'init.defaultBranch', 'push.default'].includes(key))
                        .map(([key, value]) => (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs font-mono text-muted-foreground">{key}</Label>
                            <div className="flex items-center gap-2">
                              {key === 'user.name' && <User className="h-3 w-3 text-muted-foreground" />}
                              {key === 'user.email' && <Mail className="h-3 w-3 text-muted-foreground" />}
                              <span className="text-sm bg-background px-2 py-1 rounded font-mono">{value}</span>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="col-span-full text-center py-8">
                        <p className="text-sm text-muted-foreground">No global git configuration found</p>
                        <p className="text-xs text-muted-foreground mt-1">Make sure Git is installed and configured</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Local Git Configuration */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Local Configuration (Current Repository)
              </h4>
              {gitConfigLoading ? (
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded" />
                  <div className="h-4 bg-muted animate-pulse rounded" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(gitConfig.local).length > 0 ? (
                    Object.entries(gitConfig.local)
                      .filter(([key]) => ['user.name', 'user.email', 'core.editor', 'branch.main.remote', 'branch.main.merge'].includes(key))
                      .map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-mono">{key}</Label>
                          <div className="flex items-center gap-2">
                            {key === 'user.name' && <User className="h-3 w-3 text-muted-foreground" />}
                            {key === 'user.email' && <Mail className="h-3 w-3 text-muted-foreground" />}
                            <span className="text-sm">{value}</span>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Not in a git repository or no local configuration</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Git Aliases */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Git Aliases
              </h4>
              {gitConfigLoading ? (
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded" />
                  <div className="h-4 bg-muted animate-pulse rounded" />
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(gitConfig.aliases).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(gitConfig.aliases).map(([alias, command]) => (
                        <div key={alias} className="p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs">git {alias}</Badge>
                          </div>
                          <p className="text-sm font-mono text-muted-foreground">{command}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/20 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground mb-2">No git aliases configured</p>
                      <p className="text-xs text-muted-foreground">
                        You can create aliases like: <code className="bg-muted px-1 rounded">git config --global alias.co checkout</code>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )

  const renderChatSettings = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Chat Settings</h3>
        <div className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">File Mentions</h4>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="file-mentions">Enable File Mentions</Label>
                <p className="text-xs text-muted-foreground">
                  Allow mentioning files with @ in chat messages (e.g., @src/components/App.tsx).
                  Files are listed from the currently selected project directory.
                </p>
              </div>
              <Switch
                id="file-mentions"
                checked={tempFileMentionsEnabled}
                onCheckedChange={setTempFileMentionsEnabled}
              />
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">
              <h5 className="text-sm font-medium mb-2">How it works:</h5>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>• Type <kbd className="px-1.5 py-0.5 bg-background rounded">@</kbd> in chat to see files from the currently selected project</p>
                <p>• Files are filtered to show only code files (.ts, .tsx, .js, .py, .rs, .md, etc.)</p>
                <p>• Select files to include their paths in your message to AI agents</p>
                <p>• Example: "Please review @src/App.tsx for performance issues"</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Chat Interface</h4>
            <div className="p-4 border rounded-lg bg-muted/10">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-scroll">Auto-scroll to Messages</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically scroll to new messages in chat.
                    </p>
                  </div>
                  <Switch
                    id="auto-scroll"
                    checked={true}
                    disabled={true}
                    aria-label="Coming soon"
                  />
                </div>
                
                <div className="flex items-center justify-between opacity-50">
                  <div className="space-y-0.5">
                    <Label htmlFor="message-history">Message History</Label>
                    <p className="text-xs text-muted-foreground">
                      Number of previous messages to keep in memory.
                    </p>
                  </div>
                  <div className="w-20">
                    <Input
                      id="message-history"
                      type="number"
                      value="50"
                      disabled={true}
                      className="text-center"
                    />
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground italic">
                  Additional chat settings coming soon...
                </div>
              </div>
            </div>
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

  const SafeAgentSettings = () => {
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
          Loading agent settings...
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
            <p className="text-destructive font-medium">Failed to load agent settings</p>
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
          <span className="text-muted-foreground">No agent settings available</span>
        </div>
      )
    }

    // Ensure tempAgentSettings is valid
    if (!tempAgentSettings || typeof tempAgentSettings !== 'object') {
      console.log('⚠️ Invalid tempAgentSettings:', tempAgentSettings)
      return (
        <div className="flex items-center justify-center py-8">
          <AlertCircle className="h-6 w-6 text-muted-foreground mr-2" />
          <span className="text-muted-foreground">Invalid agent configuration</span>
        </div>
      )
    }

    console.log('✅ Proceeding with full agent settings render')

    // Define constants and functions outside JSX
    const agents = [
      { id: 'claude', name: 'Claude Code CLI', description: 'Official Claude CLI tool for coding assistance' },
      { id: 'codex', name: 'Codex', description: 'GitHub Copilot and OpenAI Codex integration' },
      { id: 'gemini', name: 'Gemini', description: 'Google Gemini AI coding assistant' }
    ]

    const updateAgentSetting = (agentId: string, key: string, value: any) => {
      try {
        console.log(`🔄 Updating agent setting: ${agentId}.${key} = ${value}`)
        setTempAllAgentSettings((prev: any) => {
          if (!prev || typeof prev !== 'object') {
            console.warn('Invalid previous agent settings, resetting to defaults')
            const defaultSettings = {
              max_concurrent_sessions: 10,
              [agentId]: { 
                model: '',
                output_format: 'markdown',
                session_timeout_minutes: 30,
                max_tokens: null,
                temperature: null,
                sandbox_mode: false,
                auto_approval: false,
                debug_mode: false,
                [key]: value 
              }
            }
            console.log('📝 Reset to default settings:', defaultSettings)
            return defaultSettings
          }
          
          // Ensure the agent object exists before updating it
          const agentSettings = prev[agentId] || {
            model: '',
            output_format: 'markdown',
            session_timeout_minutes: 30,
            max_tokens: null,
            temperature: null,
            sandbox_mode: false,
            auto_approval: false,
            debug_mode: false
          }
          
          const updated = {
            ...prev,
            [agentId]: {
              ...agentSettings,
              [key]: value
            }
          }
          console.log(`✅ Updated agent settings:`, updated)
          return updated
        })
      } catch (error) {
        console.error(`❌ Failed to update agent setting for ${agentId}.${key}:`, error)
      }
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
                onChange={(e) => setTempAllAgentSettings((prev: any) => ({
                  ...prev,
                  max_concurrent_sessions: parseInt(e.target.value) || 10
                }))}
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
                        setTempAgentSettings(prev => ({ ...prev, [agent.id]: checked }))
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
                        onClick={() => handleFetchAgentModels(agent.id)}
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
            <p className="text-destructive font-medium">Error rendering agent settings</p>
            <p className="text-sm text-muted-foreground mt-1">
              An unexpected error occurred while displaying the agent settings.
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Check browser console for details: {error instanceof Error ? error.message : String(error)}
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setAgentSettingsError(null)
                setAgentSettingsLoading(false)
                // Try to reset to defaults
                const defaultAllSettings = {
                  max_concurrent_sessions: 10,
                  claude: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
                  codex: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
                  gemini: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false }
                }
                setTempAllAgentSettings(defaultAllSettings)
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

  const renderAgentSettings = () => {
    return (
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('🚨 ErrorBoundary caught error in agent settings:', error, errorInfo)
        }}
        fallback={
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <XCircle className="h-8 w-8 text-destructive" />
            <div className="text-center">
              <p className="text-destructive font-medium">Agent Settings Error</p>
              <p className="text-sm text-muted-foreground mt-1">
                The agent settings component crashed unexpectedly.
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
        <SafeAgentSettings />
      </ErrorBoundary>
    )
  }


  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('🚨 Main ErrorBoundary caught error in SettingsModal:', error, errorInfo)
      }}
      fallback={
        <Dialog open={isOpen} onOpenChange={handleCloseModal}>
          <DialogContent className="w-[85vw] !max-w-[1400px] h-[90vh] p-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Settings - Error
              </DialogTitle>
            </DialogHeader>
            
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="flex flex-col items-center justify-center space-y-4">
                <XCircle className="h-12 w-12 text-destructive" />
                <div className="text-center">
                  <p className="text-destructive font-medium">Settings Modal Error</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The settings modal crashed unexpectedly.
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
            </div>

            <div className="flex justify-end px-6 py-4 border-t flex-shrink-0 bg-background">
              <Button onClick={onClose}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      <>
      <Dialog open={isOpen} onOpenChange={handleCloseModal}>
      <DialogContent className="w-[85vw] !max-w-[1400px] h-[90vh] p-0 flex flex-col overflow-hidden">
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
                    className="w-full !justify-start"
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
              {activeTab === 'git' && renderGitSettings()}
              {activeTab === 'chat' && renderChatSettings()}
              {activeTab === 'agents' && renderAgentSettings()}
              {activeTab === 'llms' && renderLLMSettings()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between px-6 py-4 border-t flex-shrink-0 bg-background">
          <div className="flex items-center">
            {hasUnsavedChanges && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                You have unsaved changes
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleCloseModal} disabled={saving}>
              Cancel
            </Button>
            {hasUnsavedChanges && (
              <Button onClick={handleSaveChanges} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            )}
            {!hasUnsavedChanges && (
              <Button onClick={onClose} disabled={saving}>
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <AlertDialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes that will be lost if you continue. Do you want to save your changes or discard them?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleDiscardChanges}>
            Discard Changes
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleSaveChanges}>
            Save Changes
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
    </ErrorBoundary>
  )
}