import { createContext, useContext, useState, useEffect, useLayoutEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { applyDashboardPalette } from '@/lib/dashboard-palettes';

type DefaultCliAgent = 'autohand' | 'claude' | 'codex' | 'gemini';

const FALLBACK_AGENT: DefaultCliAgent = 'claude';
const allowedDefaultAgents: DefaultCliAgent[] = ['autohand', 'claude', 'codex', 'gemini'];

function normalizeDefaultAgent(value?: string | null): DefaultCliAgent {
  if (!value) return FALLBACK_AGENT;
  const normalized = value.toLowerCase() as DefaultCliAgent;
  return allowedDefaultAgents.includes(normalized) ? normalized : FALLBACK_AGENT;
}

interface CodeSettings {
  theme: string;
  font_size: number;
  auto_collapse_sidebar: boolean;
  show_file_explorer: boolean;
}

interface AppSettings {
  show_console_output: boolean;
  projects_folder: string;
  file_mentions_enabled: boolean;
  ui_theme?: string;
  code_settings: CodeSettings;
  chat_send_shortcut?: 'enter' | 'mod+enter';
  show_welcome_recent_projects?: boolean;
  max_chat_history?: number;
  default_cli_agent?: DefaultCliAgent;
  suggest_create_agents_md?: boolean;
  has_completed_onboarding?: boolean;
  show_onboarding_on_start?: boolean;
  dashboard_time_range?: number;
  time_saved_multiplier?: number;
  show_dashboard_activity?: boolean;
  dashboard_color_palette?: string;
  dashboard_chart_type?: 'scatter' | 'knowledge-base';
  docs_auto_sync?: boolean;
  chat_history_style?: 'palette' | 'sidebar' | 'strip';
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
  refreshSettings: () => Promise<void>;
  isLoading: boolean;
}

const defaultSettings: AppSettings = {
  show_console_output: true,
  projects_folder: '',
  file_mentions_enabled: true,
  chat_send_shortcut: 'mod+enter',
  show_welcome_recent_projects: false,
  max_chat_history: 50,
  code_settings: {
    theme: 'github',
    font_size: 14,
    auto_collapse_sidebar: false,
    show_file_explorer: true,
  },
  default_cli_agent: FALLBACK_AGENT,
  suggest_create_agents_md: true,
  has_completed_onboarding: false,
  show_onboarding_on_start: false,
  dashboard_color_palette: 'default',
  dashboard_chart_type: 'scatter',
  docs_auto_sync: false,
  chat_history_style: 'palette',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSettings = async () => {
    try {
      setIsLoading(true);
      const appSettings = await invoke<Partial<AppSettings>>('load_app_settings');
      const defaultCliAgent = normalizeDefaultAgent(appSettings?.default_cli_agent);
      const mergedCodeSettings = {
        ...defaultSettings.code_settings,
        ...(appSettings.code_settings || {}),
      };
      setSettings({
        ...defaultSettings,
        ...appSettings,
        code_settings: mergedCodeSettings,
        default_cli_agent: defaultCliAgent,
        suggest_create_agents_md: appSettings.suggest_create_agents_md ?? true,
      });
    } catch (error) {
      console.warn('⚠️ Failed to load app settings (using defaults):', error);
      setSettings(defaultSettings);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const mergedCodeSettings = newSettings.code_settings
        ? {
            ...settings.code_settings,
            ...newSettings.code_settings,
          }
        : settings.code_settings;

      const updatedSettings: AppSettings = {
        ...settings,
        ...newSettings,
        code_settings: mergedCodeSettings,
      };
      updatedSettings.default_cli_agent = normalizeDefaultAgent(updatedSettings.default_cli_agent);
      await invoke('save_app_settings', { settings: updatedSettings });
      setSettings(updatedSettings);
      // Settings updated and saved
    } catch (error) {
      console.error('❌ Failed to save settings:', error);
      throw error;
    }
  };

  // Load settings on mount
  useEffect(() => {
    refreshSettings();
  }, []);

  // Apply UI theme to document based on settings
  useEffect(() => {
    const applyTheme = (theme: string | undefined) => {
      const root = document.documentElement;
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      const setClass = () => {
        const isDark = (theme === 'dark') || (theme === 'auto' && prefersDark.matches);
        if (theme === 'light') {
          root.classList.remove('dark');
          root.classList.add('force-light');
        } else if (isDark) {
          root.classList.add('dark');
          root.classList.remove('force-light');
        } else {
          root.classList.remove('dark');
          root.classList.remove('force-light');
        }
      };
      setClass();
      if (theme === 'auto' && prefersDark && 'addEventListener' in prefersDark) {
        const handler = () => setClass();
        prefersDark.addEventListener('change', handler);
        return () => prefersDark.removeEventListener('change', handler);
      }
      return () => {};
    };

    const cleanup = applyTheme(settings.ui_theme || 'auto');
    return cleanup;
  }, [settings.ui_theme]);

  // Inform native window about theme on load/changes
  useEffect(() => {
    const t = settings.ui_theme || 'auto';
    // Defer import to avoid SSR issues and allow tests to run
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('set_window_theme', { theme: t }).catch(() => {});
    }).catch(() => {});
  }, [settings.ui_theme]);

  // Apply dashboard color palette before dependent chart effects read CSS vars.
  // Re-apply when either the palette OR theme changes so light-mode overrides take effect.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const paletteKey = settings.dashboard_color_palette || 'default';
    const themeMode = (settings.ui_theme || 'auto') as 'light' | 'dark' | 'auto';
    applyDashboardPalette(paletteKey, themeMode);

    // When theme is 'auto', listen for OS color-scheme changes and re-apply.
    if (themeMode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyDashboardPalette(paletteKey, 'auto');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [settings.dashboard_color_palette, settings.ui_theme]);

  return (
    <SettingsContext.Provider 
      value={{ 
        settings, 
        updateSettings, 
        refreshSettings, 
        isLoading 
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
