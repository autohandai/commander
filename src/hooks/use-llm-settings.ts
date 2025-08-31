import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LLMSettings, LLMProvider, ProviderStatus, LLMModel } from '@/types/llm';

export const useLLMSettings = () => {
  const [settings, setSettings] = useState<LLMSettings | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<Record<string, ProviderStatus>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to load saved settings first
      const savedSettings = await invoke<LLMSettings | null>('load_llm_settings');
      
      if (savedSettings) {
        setSettings(savedSettings);
      } else {
        // If no saved settings, get defaults
        const defaultSettings = await invoke<LLMSettings>('get_default_llm_settings');
        setSettings(defaultSettings);
      }

      // Check provider statuses
      await refreshProviderStatuses();
    } catch (err) {
      console.error('Failed to load LLM settings:', err);
      setError(err as string);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshProviderStatuses = useCallback(async () => {
    if (!settings) return;

    const statuses: Record<string, ProviderStatus> = {};

    for (const [id, provider] of Object.entries(settings.providers)) {
      const status: ProviderStatus = {
        id,
        name: provider.name,
        installed: true,
        configured: false,
        models_loaded: false,
      };

      try {
        if (provider.provider_type === 'ollama') {
          // Check if Ollama is installed
          status.installed = await invoke<boolean>('check_ollama_installation');
          if (status.installed) {
            status.configured = true;
            // Try to load models
            const models = await invoke('fetch_ollama_models');
            status.models_loaded = Array.isArray(models) && models.length > 0;
          }
        } else if (provider.provider_type === 'openrouter') {
          status.configured = !!provider.api_key;
          if (provider.api_key) {
            // Only try to fetch models if API key is available
            try {
              const models = await invoke<LLMModel[]>('fetch_openrouter_models', { apiKey: provider.api_key });
              status.models_loaded = Array.isArray(models) && models.length > 0;
            } catch {
              status.error = 'Failed to fetch OpenRouter models';
            }
          }
        } else if (provider.provider_type === 'openai') {
          status.configured = !!provider.api_key;
          if (provider.api_key) {
            // Try to fetch live models from OpenAI API
            try {
              const models = await invoke<LLMModel[]>('fetch_openai_models', { apiKey: provider.api_key });
              status.models_loaded = Array.isArray(models) && models.length > 0;
            } catch {
              status.error = 'Failed to fetch OpenAI models';
            }
          } else {
            // Use default models if no API key
            status.models_loaded = provider.models.length > 0;
          }
        }
      } catch (err) {
        status.error = err as string;
        status.installed = false;
      }

      statuses[id] = status;
    }

    setProviderStatuses(statuses);
  }, [settings]);

  const saveSettings = useCallback(async (newSettings: LLMSettings) => {
    try {
      setSaving(true);
      setError(null);

      await invoke('save_llm_settings', { settings: newSettings });
      setSettings(newSettings);
      
      // Refresh provider statuses after saving
      await refreshProviderStatuses();
    } catch (err) {
      console.error('Failed to save LLM settings:', err);
      setError(err as string);
      throw err;
    } finally {
      setSaving(false);
    }
  }, [refreshProviderStatuses]);

  const updateProvider = useCallback(async (providerId: string, updates: Partial<LLMProvider>) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        [providerId]: {
          ...settings.providers[providerId],
          ...updates,
        },
      },
    };

    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const setActiveProvider = useCallback(async (providerId: string) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      active_provider: providerId,
    };

    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const fetchProviderModels = useCallback(async (providerId: string): Promise<LLMModel[]> => {
    if (!settings) return [];

    const provider = settings.providers[providerId];
    if (!provider) return [];

    try {
      switch (provider.provider_type) {
        case 'openrouter':
          if (provider.api_key) {
            return await invoke<LLMModel[]>('fetch_openrouter_models', { apiKey: provider.api_key });
          }
          return [];
        case 'ollama':
          return await invoke<LLMModel[]>('fetch_ollama_models');
        case 'openai':
          if (provider.api_key) {
            return await invoke<LLMModel[]>('fetch_openai_models', { apiKey: provider.api_key });
          }
          return provider.models; // Return default models if no API key
        default:
          break;
      }
    } catch (err) {
      console.error(`Failed to fetch models for ${providerId}:`, err);
      throw err;
    }

    return [];
  }, [settings]);

  const openOllamaWebsite = useCallback(async () => {
    try {
      await invoke('open_ollama_website');
    } catch (err) {
      console.error('Failed to open Ollama website:', err);
      throw err;
    }
  }, []);

  const updateSelectedModel = useCallback(async (providerId: string, modelId: string) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      providers: {
        ...settings.providers,
        [providerId]: {
          ...settings.providers[providerId],
          selected_model: modelId,
        },
      },
    };

    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updateSystemPrompt = useCallback(async (prompt: string) => {
    if (!settings) return;

    const newSettings = {
      ...settings,
      system_prompt: prompt,
    };

    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  return {
    settings,
    providerStatuses,
    loading,
    saving,
    error,
    loadSettings,
    saveSettings,
    updateProvider,
    setActiveProvider,
    fetchProviderModels,
    refreshProviderStatuses,
    openOllamaWebsite,
    updateSelectedModel,
    updateSystemPrompt,
  };
};