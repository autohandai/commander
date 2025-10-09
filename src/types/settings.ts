/**
 * Shared types for Settings components
 * Preserves ALL existing functionality from SettingsModal.tsx
 */

// ============================
// Core Settings Types
// ============================

export type SettingsTab = 'general' | 'code' | 'git' | 'chat' | 'prompts' | 'agents' | 'llms' | 'shortcuts' | 'subagents';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}

// ============================
// General Settings Types
// ============================

export interface AppSettings {
  show_console_output: boolean;
  projects_folder: string;
  file_mentions_enabled: boolean;
  // UI theme for the app: 'auto' | 'light' | 'dark'
  ui_theme?: string;
  // Show/Hide recent projects on the Welcome screen
  show_welcome_recent_projects?: boolean;
  // Maximum number of chat messages retained per session
  max_chat_history?: number;
  code_settings?: { theme: string; font_size: number; auto_collapse_sidebar?: boolean };
}

// ============================
// Git Settings Types
// ============================

export interface GitConfig {
  global: Record<string, string>;
  local: Record<string, string>;
  aliases: Record<string, string>;
}

// ============================
// Agent Settings Types
// ============================

export interface AgentConfig {
  model: string;
  output_format: 'markdown' | 'json' | 'plain' | 'code';
  session_timeout_minutes: number;
  max_tokens: number | null;
  temperature: number | null;
  sandbox_mode: boolean;
  auto_approval: boolean;
  debug_mode: boolean;
}

export interface AllAgentSettings {
  max_concurrent_sessions: number;
  claude?: AgentConfig;
  codex?: AgentConfig;
  gemini?: AgentConfig;
}

export interface BasicAgentSettings {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
}

// Type for Record<string, boolean> used in the main modal
export type AgentSettingsRecord = Record<string, boolean>

export interface AgentInfo {
  id: 'claude' | 'codex' | 'gemini';
  name: string;
  description: string;
}

// ============================
// LLM Settings Types (re-exported from existing types)
// ============================

import type { 
  LLMModel as ExistingLLMModel,
  LLMProvider as ExistingLLMProvider,
  LLMSettings as ExistingLLMSettings,
  ProviderStatus as ExistingProviderStatus
} from './llm'

export type LLMModel = ExistingLLMModel
export type LLMProvider = ExistingLLMProvider
export type LLMSettings = ExistingLLMSettings
export type ProviderStatus = ExistingProviderStatus

// ============================
// Chat Settings Types
// ============================

export interface ChatSettings {
  file_mentions_enabled: boolean;
  auto_scroll: boolean;
  message_history_limit: number;
}

// ============================
// State Management Types
// ============================

export interface SettingsState {
  // General
  defaultProjectsFolder: string;
  showConsoleOutput: boolean;
  fileMentionsEnabled: boolean;
  
  // Temporary states for unsaved changes
  tempDefaultProjectsFolder: string;
  tempShowConsoleOutput: boolean;
  tempFileMentionsEnabled: boolean;
  
  // Agent settings
  agentSettings: BasicAgentSettings;
  tempAgentSettings: BasicAgentSettings;
  allAgentSettings: AllAgentSettings | null;
  tempAllAgentSettings: AllAgentSettings | null;
  
  // Git configuration
  gitConfig: GitConfig;
  gitWorktreeEnabled: boolean;
  
  // UI state
  hasUnsavedChanges: boolean;
  showUnsavedChangesDialog: boolean;
  
  // Loading states
  agentSettingsLoading: boolean;
  gitConfigLoading: boolean;
  
  // Error states
  agentSettingsError: string | null;
  gitConfigError: string | null;
}

// ============================
// Component Props Types
// ============================

export interface GeneralSettingsProps {
  tempDefaultProjectsFolder: string;
  tempShowConsoleOutput: boolean;
  systemPrompt?: string;
  saving: boolean;
  // UI theme state (temporary for unsaved changes)
  tempUiTheme?: string;
  // Welcome screen recent projects toggle (temporary for unsaved changes)
  tempShowWelcomeRecentProjects?: boolean;
  gitConfig: GitConfig;
  gitWorktreeEnabled: boolean;
  gitConfigLoading: boolean;
  gitConfigError: string | null;
  onFolderChange: (folder: string) => void;
  onSelectFolder: () => Promise<void>;
  onConsoleOutputChange: (enabled: boolean) => void;
  onSystemPromptChange: (prompt: string) => void;
  onClearRecentProjects: () => Promise<void>;
  onRefreshGitConfig: () => Promise<void>;
  onToggleGitWorktree: (enabled: boolean) => Promise<void>;
  // Theme change handler
  onUiThemeChange?: (theme: string) => void;
  // Welcome screen toggle change handler
  onShowWelcomeRecentProjectsChange?: (enabled: boolean) => void;
}

export interface GitSettingsProps {
  gitConfig: GitConfig;
  gitWorktreeEnabled: boolean;
  gitWorktreeSupported?: boolean;
  gitConfigLoading: boolean;
  gitConfigError: string | null;
  onRefreshConfig: () => Promise<void>;
  onToggleWorktree: (enabled: boolean) => Promise<void>;
}

export interface ChatSettingsProps {
  tempFileMentionsEnabled: boolean;
  onFileMentionsChange: (enabled: boolean) => void;
  tempChatSendShortcut?: 'enter' | 'mod+enter';
  onChatSendShortcutChange?: (shortcut: 'enter' | 'mod+enter') => void;
  tempMaxChatHistory?: number;
  onMaxChatHistoryChange?: (limit: number) => void;
  tempDefaultCliAgent: string;
  onDefaultCliAgentChange?: (agentId: string) => void;
}

export interface AgentSettingsProps {
  agentSettings: AgentSettingsRecord;
  tempAgentSettings: AgentSettingsRecord;
  allAgentSettings: AllAgentSettings | null;
  tempAllAgentSettings: AllAgentSettings | null;
  agentModels: Record<string, string[]>;
  fetchingAgentModels: Record<string, boolean>;
  agentSettingsLoading: boolean;
  agentSettingsError: string | null;
  onToggleAgent: (agentId: string, enabled: boolean) => void;
  onUpdateAgentSetting: (agentId: string, key: string, value: any) => void;
  onFetchAgentModels: (agentId: string) => Promise<void>;
}

export interface LLMSettingsProps {
  settings: LLMSettings | null;
  providerStatuses: Record<string, ProviderStatus>;
  loading: boolean;
  saving: boolean;
  error: string | null;
  tempApiKeys: Record<string, string>;
  fetchingModels: Record<string, boolean>;
  onUpdateProvider: (providerId: string, updates: Partial<LLMProvider>) => Promise<void>;
  onSetActiveProvider: (providerId: string) => void;
  onFetchModels: (providerId: string) => Promise<void>;
  onRefreshStatuses: () => Promise<void>;
  onOpenOllamaWebsite: () => void;
  onUpdateSelectedModel: (providerId: string, modelId: string) => void;
  onSaveApiKey: (providerId: string) => Promise<void>;
  onTempApiKeyChange: (providerId: string, key: string) => void;
  onUpdateSystemPrompt: (prompt: string) => void;
}

// ============================
// Hook Return Types
// ============================

export interface UseTauriOperationsReturn {
  // App settings
  loadAppSettings: () => Promise<AppSettings>;
  saveAppSettings: (settings: AppSettings) => Promise<void>;
  
  // Projects folder
  getDefaultProjectsFolder: () => Promise<string>;
  saveProjectsFolder: (path: string) => Promise<void>;
  selectProjectsFolder: () => Promise<string | null>;
  loadProjectsFolder: () => Promise<string | null>;
  ensureDirectoryExists: (path: string) => Promise<void>;
  clearRecentProjects: () => Promise<void>;
  
  // Agent settings
  loadAgentSettings: () => Promise<BasicAgentSettings | null>;
  saveAgentSettings: (settings: BasicAgentSettings) => Promise<void>;
  loadAllAgentSettings: () => Promise<AllAgentSettings>;
  saveAllAgentSettings: (settings: AllAgentSettings) => Promise<void>;
  fetchAgentModels: (agent: string) => Promise<string[]>;
  
  // Git configuration
  getGitGlobalConfig: () => Promise<Record<string, string>>;
  getGitLocalConfig: () => Promise<Record<string, string>>;
  getGitAliases: () => Promise<Record<string, string>>;
  getGitWorktreeEnabled: () => Promise<boolean>;
  setGitWorktreeEnabled: (enabled: boolean) => Promise<void>;
}

export interface UseSettingsStateReturn {
  state: SettingsState;
  actions: {
    updateGeneralSettings: (updates: Partial<SettingsState>) => void;
    updateAgentSettings: (updates: Partial<BasicAgentSettings>) => void;
    updateAllAgentSettings: (updates: Partial<AllAgentSettings>) => void;
    updateGitConfig: (config: Partial<GitConfig>) => void;
    setHasUnsavedChanges: (hasChanges: boolean) => void;
    resetTempValues: () => void;
    saveAllChanges: () => Promise<void>;
  };
  meta: {
    loading: boolean;
    saving: boolean;
    hasUnsavedChanges: boolean;
  };
}

// ============================
// Menu Item Types
// ============================

export interface SettingsMenuItem {
  id: SettingsTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ============================
// Error Boundary Types
// ============================

export interface SettingsErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}
