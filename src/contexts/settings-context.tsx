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
  code_settings: CodeSettings;
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