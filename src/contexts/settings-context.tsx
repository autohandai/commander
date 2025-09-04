import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface CodeSettings {
  theme: string;
  font_size: number;
}

interface AppSettings {
  show_console_output: boolean;
  projects_folder: string;
  file_mentions_enabled: boolean;
  ui_theme?: string;
  code_settings: CodeSettings;
  chat_send_shortcut?: 'enter' | 'mod+enter';
  show_welcome_recent_projects?: boolean;
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
  show_welcome_recent_projects: true,
  code_settings: {
    theme: 'github',
    font_size: 14
  }
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  const refreshSettings = async () => {
    try {
      setIsLoading(true);
      const appSettings = await invoke<AppSettings>('load_app_settings');
      console.log('🔄 Settings refreshed:', appSettings);
      setSettings(appSettings);
    } catch (error) {
      console.warn('⚠️ Failed to load app settings (using defaults):', error);
      setSettings(defaultSettings);
    } finally {
      setIsLoading(false);
    }
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      await invoke('save_app_settings', { settings: updatedSettings });
      setSettings(updatedSettings);
      console.log('✅ Settings updated and saved:', updatedSettings);
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
