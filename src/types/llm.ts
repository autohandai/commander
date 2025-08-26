export interface LLMModel {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  input_cost?: number;
  output_cost?: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  provider_type: string;
  base_url?: string;
  api_key?: string;
  models: LLMModel[];
  selected_model?: string;
}

export interface LLMSettings {
  active_provider: string;
  providers: Record<string, LLMProvider>;
  system_prompt: string;
}

export type ProviderType = 'openai' | 'openrouter' | 'ollama';

export interface ProviderStatus {
  id: string;
  name: string;
  installed: boolean;
  configured: boolean;
  models_loaded: boolean;
  error?: string;
}