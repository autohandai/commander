import { useState, useEffect, useCallback } from "react"
import { Settings as SettingsIcon, AlertCircle, Loader2, Monitor, Bot, MessageCircle, GitBranch, ExternalLink, Keyboard, Code2, MessageSquare } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { 
  ChatSettings,
  GeneralSettings,
  GitSettings,
  AgentSettings,
  LLMSettings,
  ShortCutsUISettings,
  CodeSettings,
  SubAgentsSettings,
  PromptsUISettings
} from "@/components/settings"
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
import { useLLMSettings } from "@/hooks/use-llm-settings"
import { useSettings as useAppSettingsContext } from "@/contexts/settings-context"
import type { SettingsModalProps, SettingsTab } from "@/types/settings"

const DEFAULT_CLI_AGENT_CHOICES = ['claude', 'codex', 'gemini', 'ollama'] as const
type DefaultCliAgentChoice = typeof DEFAULT_CLI_AGENT_CHOICES[number]

const normalizeDefaultCliAgent = (value?: string | null): DefaultCliAgentChoice => {
  if (!value) return 'claude'
  const normalized = value.toLowerCase() as DefaultCliAgentChoice
  return DEFAULT_CLI_AGENT_CHOICES.includes(normalized) ? normalized : 'claude'
}

if (typeof window !== 'undefined' && typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = function (_arg?: boolean | ScrollIntoViewOptions) {
    return undefined
  }
}

export function SettingsModal({ isOpen, onClose, initialTab }: SettingsModalProps) {
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
  const [chatSendShortcut, setChatSendShortcut] = useState<'enter' | 'mod+enter'>('mod+enter')
  const [tempChatSendShortcut, setTempChatSendShortcut] = useState<'enter' | 'mod+enter'>('mod+enter')
  const [maxChatHistory, setMaxChatHistory] = useState<number>(15)
  const [tempMaxChatHistory, setTempMaxChatHistory] = useState<number>(15)
  const [defaultCliAgent, setDefaultCliAgent] = useState<DefaultCliAgentChoice>('claude')
  const [tempDefaultCliAgent, setTempDefaultCliAgent] = useState<DefaultCliAgentChoice>('claude')
  // UI Theme state
  const [uiTheme, setUiTheme] = useState<string>('auto')
  const [tempUiTheme, setTempUiTheme] = useState<string>('auto')
  // Welcome screen recent projects toggle
  const [showWelcomeRecentProjects, setShowWelcomeRecentProjects] = useState<boolean>(true)
  const [tempShowWelcomeRecentProjects, setTempShowWelcomeRecentProjects] = useState<boolean>(true)
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
  const { updateSettings: updateAppSettings, settings: appSettingsContext } = useAppSettingsContext()

  // Code settings
  const [codeTheme, setCodeTheme] = useState<string>('github')
  const [tempCodeTheme, setTempCodeTheme] = useState<string>('github')
  const [codeFontSize, setCodeFontSize] = useState<number>(14)
  const [tempCodeFontSize, setTempCodeFontSize] = useState<number>(14)

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
  const [gitWorktreeSupported, setGitWorktreeSupported] = useState(false)
  const [gitConfigLoading, setGitConfigLoading] = useState(false)
  const [gitConfigError, setGitConfigError] = useState<string | null>(null)
  
  // Load app settings and projects folder on mount
  useEffect(() => {
    const loadAppSettings = async () => {
      try {
        console.log('🔄 Loading app settings...')
        
        // Load app settings with error handling
        try {
          const appSettings = await invoke<{ show_console_output: boolean, projects_folder: string, file_mentions_enabled: boolean, ui_theme?: string, code_settings?: { theme: string, font_size: number, auto_collapse_sidebar?: boolean }, chat_send_shortcut?: 'enter' | 'mod+enter', show_welcome_recent_projects?: boolean, max_chat_history?: number, default_cli_agent?: string }>('load_app_settings')
          console.log('✅ App settings loaded:', appSettings)
          if (appSettings) {
            setShowConsoleOutput(appSettings.show_console_output)
            setTempShowConsoleOutput(appSettings.show_console_output)
            setFileMentionsEnabled(appSettings.file_mentions_enabled)
            setTempFileMentionsEnabled(appSettings.file_mentions_enabled)
            const sendShortcut = (appSettings as any).chat_send_shortcut || 'mod+enter'
            setChatSendShortcut(sendShortcut)
            setTempChatSendShortcut(sendShortcut)
            const historyCap = typeof (appSettings as any).max_chat_history === 'number'
              ? Math.max(5, Math.floor((appSettings as any).max_chat_history))
              : 15
            setMaxChatHistory(historyCap)
            setTempMaxChatHistory(historyCap)
            const showWelcome = (appSettings as any).show_welcome_recent_projects ?? true
            setShowWelcomeRecentProjects(showWelcome)
            setTempShowWelcomeRecentProjects(showWelcome)
            const defaultAgent = normalizeDefaultCliAgent((appSettings as any).default_cli_agent)
            setDefaultCliAgent(defaultAgent)
            setTempDefaultCliAgent(defaultAgent)

            if (appSettings.projects_folder) {
              setDefaultProjectsFolder(appSettings.projects_folder)
              setTempDefaultProjectsFolder(appSettings.projects_folder)
            }
            const code = appSettings.code_settings || { theme: 'github', font_size: 14, auto_collapse_sidebar: false }
            setCodeTheme(code.theme)
            setTempCodeTheme(code.theme)
            setCodeFontSize(code.font_size)
            setTempCodeFontSize(code.font_size)
            const themePref = appSettings.ui_theme || 'auto'
            setUiTheme(themePref)
            setTempUiTheme(themePref)
          }
        } catch (appError) {
          console.warn('⚠️ Failed to load app settings (using defaults):', appError)
          // Keep using default values
        }
        
        // Load default projects folder if not set in app settings
        if (!defaultProjectsFolder) {
          try {
            const folder = await invoke<string>('get_default_projects_folder')
            console.log('✅ Default projects folder loaded:', folder)
            if (folder) {
              setDefaultProjectsFolder(folder)
              setTempDefaultProjectsFolder(folder)
            }
          } catch (folderError) {
            console.warn('⚠️ Failed to load default projects folder:', folderError)
          }
        }
        
        // Load agent settings
        try {
          const agents = await invoke<Record<string, boolean> | null>('load_agent_settings')
          console.log('🤖 Agent settings loaded:', agents)
          if (agents) {
            setAgentSettings(agents)
            setTempAgentSettings({...agents})
          } else {
            const defaultAgents = { claude: false, codex: false, gemini: false }
            setAgentSettings(defaultAgents)
            setTempAgentSettings(defaultAgents)
          }
        } catch (agentError) {
          console.warn('⚠️ Failed to load basic agent settings:', agentError)
          const defaultAgents = { claude: false, codex: false, gemini: false }
          setAgentSettings(defaultAgents)
          setTempAgentSettings(defaultAgents)
        }

        // Load full agent configuration (for advanced settings)
        loadAllAgentSettings()
        
        } catch (error) {
          console.error('❌ Error loading settings:', error)
        }
      }

    const loadAllAgentSettings = async () => {
      try {
        setAgentSettingsLoading(true)
        setAgentSettingsError(null)
        console.log('🔄 Loading all agent settings...')
        
        const allSettings = await invoke<any>('load_all_agent_settings')
        console.log('🤖 All agent settings loaded:', allSettings)
        
        if (allSettings && typeof allSettings === 'object') {
          setAllAgentSettings(allSettings)
          setTempAllAgentSettings({ ...allSettings })
        } else {
          console.log('🤖 No agent settings found, using defaults')
          // Set sensible defaults
          const defaultAllSettings = {
            max_concurrent_sessions: 10,
            claude: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
            codex: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false },
            gemini: { model: '', output_format: 'markdown', session_timeout_minutes: 30, max_tokens: null, temperature: null, sandbox_mode: false, auto_approval: false, debug_mode: false }
          }
          setAllAgentSettings(defaultAllSettings)
          setTempAllAgentSettings({ ...defaultAllSettings })
        }
      } catch (error) {
        console.error('❌ Error loading all agent settings:', error)
        setAgentSettingsError(error instanceof Error ? error.message : String(error))
      } finally {
        setAgentSettingsLoading(false)
      }
    }

    if (isOpen) {
      loadAppSettings()
    }
  }, [isOpen])

  // Switch to an externally requested tab when opening
  useEffect(() => {
    if (isOpen && initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTab])

  // Load git configuration
  const loadGitConfig = useCallback(async () => {
    setGitConfigLoading(true)
    setGitConfigError(null)
    
    try {
      console.log('🔄 Loading git configuration...')
      
      const [globalConfig, localConfig, aliases, worktreePref, worktreeSupported] = await Promise.all([
        invoke<Record<string, string>>('get_git_global_config').catch(() => ({})),
        invoke<Record<string, string>>('get_git_local_config').catch(() => ({})),
        invoke<Record<string, string>>('get_git_aliases').catch(() => ({})),
        invoke<boolean>('get_git_worktree_preference').catch(() => true),
        invoke<boolean>('get_git_worktree_enabled').catch(() => false),
      ])

      console.log('✅ Git config loaded:', { globalConfig, localConfig, aliases, worktreePref, worktreeSupported })
      
      setGitConfig({
        global: globalConfig,
        local: localConfig,
        aliases: aliases
      })
      setGitWorktreeEnabled(worktreePref)
      setGitWorktreeSupported(worktreeSupported)
    } catch (error) {
      console.error('❌ Error loading git configuration:', error)
      setGitConfigError(error instanceof Error ? error.message : String(error))
    } finally {
      setGitConfigLoading(false)
    }
  }, [])

  // Check for unsaved changes
  useEffect(() => {
    const hasChanges = 
      tempDefaultProjectsFolder !== defaultProjectsFolder ||
      tempShowConsoleOutput !== showConsoleOutput ||
      tempFileMentionsEnabled !== fileMentionsEnabled ||
      tempChatSendShortcut !== chatSendShortcut ||
      tempMaxChatHistory !== maxChatHistory ||
      tempDefaultCliAgent !== defaultCliAgent ||
      tempUiTheme !== uiTheme ||
      tempShowWelcomeRecentProjects !== showWelcomeRecentProjects ||
      tempCodeTheme !== codeTheme ||
      tempCodeFontSize !== codeFontSize ||
      JSON.stringify(tempAgentSettings) !== JSON.stringify(agentSettings) ||
      (tempAllAgentSettings && allAgentSettings && JSON.stringify(tempAllAgentSettings) !== JSON.stringify(allAgentSettings))
    
    setHasUnsavedChanges(hasChanges)
  }, [
    tempDefaultProjectsFolder,
    defaultProjectsFolder,
    tempShowConsoleOutput,
    showConsoleOutput,
    tempFileMentionsEnabled,
    fileMentionsEnabled,
    tempChatSendShortcut,
    chatSendShortcut,
    tempMaxChatHistory,
    maxChatHistory,
    tempDefaultCliAgent,
    defaultCliAgent,
    tempUiTheme,
    uiTheme,
    tempShowWelcomeRecentProjects,
    showWelcomeRecentProjects,
    tempCodeTheme,
    codeTheme,
    tempCodeFontSize,
    codeFontSize,
    tempAgentSettings,
    agentSettings,
    tempAllAgentSettings,
    allAgentSettings,
  ])

  // Live-apply UI theme while editing, and auto-save the preference
  useEffect(() => {
    const root = document.documentElement
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)')
    const isDark = tempUiTheme === 'dark' || (tempUiTheme === 'auto' && prefersDark.matches)
    // Manage dark and force-light classes to cooperate with OS media query
    if (tempUiTheme === 'light') {
      root.classList.remove('dark')
      root.classList.add('force-light')
    } else if (isDark) {
      root.classList.add('dark')
      root.classList.remove('force-light')
    } else {
      root.classList.remove('dark')
      root.classList.remove('force-light')
    }

    // Persist theme selection immediately without affecting other unsaved changes
    const saveTheme = async () => {
      try {
          const appSettings = {
            show_console_output: showConsoleOutput,
            projects_folder: defaultProjectsFolder,
            file_mentions_enabled: fileMentionsEnabled,
            ui_theme: tempUiTheme,
            max_chat_history: tempMaxChatHistory,
            chat_send_shortcut: tempChatSendShortcut,
            show_welcome_recent_projects: tempShowWelcomeRecentProjects,
            default_cli_agent: tempDefaultCliAgent,
            code_settings: { theme: codeTheme, font_size: codeFontSize, auto_collapse_sidebar: appSettingsContext.code_settings.auto_collapse_sidebar }
          }
        await updateAppSettings(appSettings)
        // Also update native window theme
        await invoke('set_window_theme', { theme: tempUiTheme })
        setUiTheme(tempUiTheme)
      } catch (e) {
        console.error('Failed to auto-save ui_theme:', e)
      }
    }
    saveTheme()
  }, [tempUiTheme])

  // Auto-save chat send shortcut when changed
  useEffect(() => {
    const saveShortcut = async () => {
      try {
        const appSettings = {
          show_console_output: showConsoleOutput,
          projects_folder: defaultProjectsFolder,
          file_mentions_enabled: fileMentionsEnabled,
          ui_theme: tempUiTheme,
          max_chat_history: tempMaxChatHistory,
          chat_send_shortcut: tempChatSendShortcut,
          show_welcome_recent_projects: tempShowWelcomeRecentProjects,
          default_cli_agent: tempDefaultCliAgent,
          code_settings: { theme: codeTheme, font_size: codeFontSize, auto_collapse_sidebar: appSettingsContext.code_settings.auto_collapse_sidebar },
        }
        await updateAppSettings(appSettings)
        setChatSendShortcut(tempChatSendShortcut)
      } catch (e) {
        console.error('Failed to auto-save chat_send_shortcut:', e)
      }
    }
    saveShortcut()
  }, [tempChatSendShortcut])

  useEffect(() => {
    const saveHistoryLimit = async () => {
      try {
        const appSettings = {
          show_console_output: showConsoleOutput,
          projects_folder: defaultProjectsFolder,
          file_mentions_enabled: fileMentionsEnabled,
          ui_theme: tempUiTheme,
          max_chat_history: tempMaxChatHistory,
          chat_send_shortcut: tempChatSendShortcut,
          show_welcome_recent_projects: tempShowWelcomeRecentProjects,
          default_cli_agent: tempDefaultCliAgent,
          code_settings: { theme: codeTheme, font_size: codeFontSize, auto_collapse_sidebar: appSettingsContext.code_settings.auto_collapse_sidebar },
        }
        await updateAppSettings(appSettings)
        setMaxChatHistory(tempMaxChatHistory)
      } catch (e) {
        console.error('Failed to auto-save max_chat_history:', e)
      }
    }
    saveHistoryLimit()
  }, [tempMaxChatHistory])

  // Auto-save Welcome Screen recents toggle for immediate reflection on Welcome screen
  useEffect(() => {
    const saveWelcomeToggle = async () => {
      try {
        const appSettings = {
          show_console_output: showConsoleOutput,
          projects_folder: defaultProjectsFolder,
          file_mentions_enabled: fileMentionsEnabled,
          ui_theme: tempUiTheme,
          max_chat_history: tempMaxChatHistory,
          chat_send_shortcut: tempChatSendShortcut,
          show_welcome_recent_projects: tempShowWelcomeRecentProjects,
          default_cli_agent: tempDefaultCliAgent,
          code_settings: { theme: codeTheme, font_size: codeFontSize, auto_collapse_sidebar: appSettingsContext.code_settings.auto_collapse_sidebar },
        }
        await updateAppSettings(appSettings)
        setShowWelcomeRecentProjects(tempShowWelcomeRecentProjects)
      } catch (e) {
        console.error('Failed to auto-save show_welcome_recent_projects:', e)
      }
    }
    saveWelcomeToggle()
  }, [tempShowWelcomeRecentProjects])

  // Default CLI agent changes are persisted via explicit Save action to respect unsaved-changes workflow.

  // Load git config when tab is activated
  useEffect(() => {
    if (isOpen && (activeTab === 'general' || activeTab === 'git') && Object.keys(gitConfig.global || {}).length === 0 && !gitConfigLoading) {
      loadGitConfig()
    }
  }, [isOpen, activeTab, gitConfig.global, gitConfigLoading, loadGitConfig])

  const handleSelectProjectsFolder = async () => {
    try {
      const selectedPath = await invoke<string | null>('select_projects_folder')
      if (selectedPath) {
        setTempDefaultProjectsFolder(selectedPath)
      }
    } catch (error) {
      console.error('Error selecting projects folder:', error)
    }
  }

  const handleSystemPromptChange = (prompt: string) => {
    updateSystemPrompt(prompt)
  }

  const handleClearRecentProjects = async () => {
    try {
      await invoke('clear_recent_projects')
      console.log('✅ Recent projects cleared')
    } catch (error) {
      console.error('❌ Error clearing recent projects:', error)
    }
  }

  const handleGitWorktreeToggle = async (enabled: boolean) => {
    try {
      await invoke('set_git_worktree_enabled', { enabled })
      setGitWorktreeEnabled(enabled)
    } catch (error) {
      console.error('Error toggling git worktree:', error)
    }
  }

  const handleToggleAgent = (agentId: string, enabled: boolean) => {
    setTempAgentSettings(prev => ({ ...prev, [agentId]: enabled }))
  }

  const handleUpdateAgentSetting = (agentId: string, key: string, value: any) => {
    setTempAllAgentSettings((prev: any) => {
      // Handle global settings (like max_concurrent_sessions)
      if (agentId === 'global') {
        return {
          ...prev,
          [key]: value
        }
      }
      
      // Ensure prev exists and is an object
      const safePrev = prev || {}
      
      // Create default agent config if it doesn't exist
      const defaultAgentConfig = {
        model: '',
        output_format: 'markdown',
        session_timeout_minutes: 30,
        max_tokens: null,
        temperature: null,
        sandbox_mode: false,
        auto_approval: false,
        debug_mode: false
      }
      
      // Safely get existing agent config or use defaults
      const existingAgentConfig = safePrev[agentId] || defaultAgentConfig
      
      return {
        ...safePrev,
        [agentId]: {
          ...existingAgentConfig,
          [key]: value
        }
      }
    })
  }

  const fetchAgentModels = async (agentId: string) => {
    if (fetchingAgentModels[agentId]) return
    
    setFetchingAgentModels(prev => ({ ...prev, [agentId]: true }))
    
    try {
      console.log(`🔄 Fetching models for ${agentId}...`)
      const models = await invoke<string[]>('fetch_agent_models', { agent: agentId })
      console.log(`✅ Models for ${agentId}:`, models)
      setAgentModels(prev => ({ ...prev, [agentId]: models }))
    } catch (error) {
      console.error(`❌ Error fetching models for ${agentId}:`, error)
    } finally {
      setFetchingAgentModels(prev => ({ ...prev, [agentId]: false }))
    }
  }

  const fetchModels = async (providerId: string) => {
    setFetchingModels(prev => ({ ...prev, [providerId]: true }))
    try {
      await fetchProviderModels(providerId)
    } finally {
      setFetchingModels(prev => ({ ...prev, [providerId]: false }))
    }
  }

  const refreshStatuses = async () => {
    await refreshProviderStatuses()
  }

  const handleOpenOllamaWebsite = () => {
    openOllamaWebsite()
  }

  const handleUpdateSelectedModel = (providerId: string, modelId: string) => {
    updateSelectedModel(providerId, modelId)
  }

  const handleSaveApiKey = async (providerId: string) => {
    const tempKey = tempApiKeys[providerId]
    if (!tempKey) return
    
    try {
      await updateProvider(providerId, { api_key: tempKey })
      setTempApiKeys(prev => ({ ...prev, [providerId]: '' }))
    } catch (error) {
      console.error('Failed to save API key:', error)
    }
  }

  const handleTempApiKeyChange = (providerId: string, key: string) => {
    setTempApiKeys(prev => ({ ...prev, [providerId]: key }))
  }

  const applyUiTheme = (theme: string) => {
    const root = document.documentElement
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = theme === 'dark' || (theme === 'auto' && prefersDark)
    if (isDark) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }

  const handleSaveChanges = async () => {
    try {
      console.log('💾 Saving settings changes...')

      // Save app settings
      const appSettings = {
        show_console_output: tempShowConsoleOutput,
        projects_folder: tempDefaultProjectsFolder,
        file_mentions_enabled: tempFileMentionsEnabled,
        ui_theme: tempUiTheme,
        max_chat_history: tempMaxChatHistory,
        chat_send_shortcut: tempChatSendShortcut,
        show_welcome_recent_projects: tempShowWelcomeRecentProjects,
        default_cli_agent: tempDefaultCliAgent,
        code_settings: { theme: tempCodeTheme, font_size: tempCodeFontSize, auto_collapse_sidebar: appSettingsContext.code_settings.auto_collapse_sidebar }
      }
      await updateAppSettings(appSettings)
      
      // Save agent settings if they changed
      if (JSON.stringify(tempAgentSettings) !== JSON.stringify(agentSettings)) {
        await invoke('save_agent_settings', { settings: tempAgentSettings })
      }

      // Save all agent settings if they changed
      if (tempAllAgentSettings && allAgentSettings && JSON.stringify(tempAllAgentSettings) !== JSON.stringify(allAgentSettings)) {
        await invoke('save_all_agent_settings', { settings: tempAllAgentSettings })
      }

      // Update state to reflect saved values
      setShowConsoleOutput(tempShowConsoleOutput)
      setFileMentionsEnabled(tempFileMentionsEnabled)
      setChatSendShortcut(tempChatSendShortcut)
      setMaxChatHistory(tempMaxChatHistory)
      setDefaultCliAgent(tempDefaultCliAgent)
      setDefaultProjectsFolder(tempDefaultProjectsFolder)
      setUiTheme(tempUiTheme)
      setShowWelcomeRecentProjects(tempShowWelcomeRecentProjects)
      setCodeTheme(tempCodeTheme)
      setCodeFontSize(tempCodeFontSize)
      setAgentSettings(tempAgentSettings)
      setAllAgentSettings(tempAllAgentSettings)
      // Apply theme immediately
      applyUiTheme(tempUiTheme)
      
      console.log('✅ Settings saved successfully')
    } catch (error) {
      console.error('❌ Error saving settings:', error)
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
    // Reset temp values
    setTempDefaultProjectsFolder(defaultProjectsFolder)
    setTempShowConsoleOutput(showConsoleOutput)
    setTempFileMentionsEnabled(fileMentionsEnabled)
    setTempChatSendShortcut(chatSendShortcut)
    setTempMaxChatHistory(maxChatHistory)
    setTempDefaultCliAgent(defaultCliAgent)
    setTempUiTheme(uiTheme)
    setTempShowWelcomeRecentProjects(showWelcomeRecentProjects)
    setTempCodeTheme(codeTheme)
    setTempCodeFontSize(codeFontSize)
    setTempAgentSettings({ ...agentSettings })
    if (allAgentSettings) {
      setTempAllAgentSettings({ ...allAgentSettings })
    }
    setShowUnsavedChangesDialog(false)
    onClose()
  }

  const menuItems = [
    {
      id: 'general' as const,
      label: 'General',
      icon: Monitor,
    },
    {
      id: 'code' as const,
      label: 'Code',
      icon: Code2,
    },
    {
      id: 'git' as const,
      label: 'Git',
      icon: GitBranch,
    },
    {
      id: 'subagents' as const,
      label: 'Sub Agents',
      icon: Bot,
    },
    {
      id: 'chat' as const,
      label: 'Chat',
      icon: MessageCircle,
    },
    {
      id: 'prompts' as const,
      label: 'Prompts',
      icon: MessageSquare,
    },
    {
      id: 'shortcuts' as const,
      label: 'Shortcuts',
      icon: Keyboard,
    },
    {
      id: 'agents' as const,
      label: 'CLI Agents',
      icon: Bot,
    },
    {
      id: 'llms' as const,
      label: 'LLMs',
      icon: ExternalLink,
    },
  ]

  return (
    <ErrorBoundary
      fallback={
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="w-[85vw] !max-w-[1400px] h-[90vh] p-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Settings - Error
              </DialogTitle>
            </DialogHeader>

            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div className="text-center">
                <p className="text-destructive font-medium">Settings Modal Error</p>
                <p className="text-sm text-muted-foreground mt-1">
                  An unexpected error occurred in the settings modal.
                </p>
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
              {activeTab === 'general' && (
                <GeneralSettings
                  tempDefaultProjectsFolder={tempDefaultProjectsFolder}
                  tempShowConsoleOutput={tempShowConsoleOutput}
                  systemPrompt={settings?.system_prompt}
                  saving={saving}
                  tempUiTheme={tempUiTheme}
                  tempShowWelcomeRecentProjects={tempShowWelcomeRecentProjects}
                  gitConfig={gitConfig}
                  gitWorktreeEnabled={gitWorktreeEnabled}
                  gitConfigLoading={gitConfigLoading}
                  gitConfigError={gitConfigError}
                  onFolderChange={setTempDefaultProjectsFolder}
                  onSelectFolder={handleSelectProjectsFolder}
                  onConsoleOutputChange={setTempShowConsoleOutput}
                  onSystemPromptChange={handleSystemPromptChange}
                  onClearRecentProjects={handleClearRecentProjects}
                  onRefreshGitConfig={loadGitConfig}
                  onToggleGitWorktree={handleGitWorktreeToggle}
                  onUiThemeChange={setTempUiTheme}
                  onShowWelcomeRecentProjectsChange={setTempShowWelcomeRecentProjects}
                />
              )}
              {activeTab === 'git' && (
                <GitSettings
                  gitConfig={gitConfig}
                  gitWorktreeEnabled={gitWorktreeEnabled}
                  gitWorktreeSupported={gitWorktreeSupported}
                  gitConfigLoading={gitConfigLoading}
                  gitConfigError={gitConfigError}
                  onRefreshConfig={loadGitConfig}
                  onToggleWorktree={handleGitWorktreeToggle}
                />
              )}
              {activeTab === 'subagents' && (
                <SubAgentsSettings />
              )}
              {activeTab === 'code' && (
                <CodeSettings />
              )}
              {activeTab === 'chat' && (
                <ChatSettings
                  tempFileMentionsEnabled={tempFileMentionsEnabled}
                  onFileMentionsChange={setTempFileMentionsEnabled}
                  tempChatSendShortcut={tempChatSendShortcut}
                  onChatSendShortcutChange={setTempChatSendShortcut}
                  tempMaxChatHistory={tempMaxChatHistory}
                  onMaxChatHistoryChange={setTempMaxChatHistory}
                  tempDefaultCliAgent={tempDefaultCliAgent}
                  onDefaultCliAgentChange={(value) => setTempDefaultCliAgent(normalizeDefaultCliAgent(value))}
                />
              )}
              {activeTab === 'prompts' && <PromptsUISettings />}
              {activeTab === 'shortcuts' && <ShortCutsUISettings />}
              {activeTab === 'agents' && (
                <AgentSettings
                  agentSettings={agentSettings}
                  tempAgentSettings={tempAgentSettings}
                  allAgentSettings={allAgentSettings}
                  tempAllAgentSettings={tempAllAgentSettings}
                  agentModels={agentModels}
                  fetchingAgentModels={fetchingAgentModels}
                  agentSettingsLoading={agentSettingsLoading}
                  agentSettingsError={agentSettingsError}
                  onToggleAgent={handleToggleAgent}
                  onUpdateAgentSetting={handleUpdateAgentSetting}
                  onFetchAgentModels={fetchAgentModels}
                />
              )}
              {activeTab === 'llms' && (
                <LLMSettings
                  settings={settings}
                  providerStatuses={providerStatuses}
                  loading={loading}
                  saving={saving}
                  error={error}
                  tempApiKeys={tempApiKeys}
                  fetchingModels={fetchingModels}
                  onUpdateProvider={updateProvider}
                  onSetActiveProvider={setActiveProvider}
                  onFetchModels={fetchModels}
                  onRefreshStatuses={refreshStatuses}
                  onOpenOllamaWebsite={handleOpenOllamaWebsite}
                  onUpdateSelectedModel={handleUpdateSelectedModel}
                  onSaveApiKey={handleSaveApiKey}
                  onTempApiKeyChange={handleTempApiKeyChange}
                  onUpdateSystemPrompt={updateSystemPrompt}
                />
              )}
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
