import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageCircle, User, Bot, Code, Brain, Activity, Terminal, X, FolderOpen, Lightbulb, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { RecentProject } from '@/hooks/use-recent-projects';
import { useFileMention } from '@/hooks/use-file-mention';
import { CODE_EXTENSIONS } from '@/types/file-mention';
import { PlanBreakdown } from './PlanBreakdown';
import { useToast } from '@/components/ToastProvider';
import { FileTypeIcon } from './FileTypeIcon';
import { SubAgentGroup } from '@/types/sub-agent';
import { ChatInput, AutocompleteOption as ChatAutocompleteOption } from '@/components/chat/ChatInput';

interface Agent {
  id: string;
  name: string;
  displayName: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

interface AgentCapability {
  id: string;
  name: string;
  description: string;
  category: string;
}

// (Removed unused SubAgentOption to satisfy noUnusedLocals)

interface AutocompleteOption {
  id: string;
  label: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }> | (() => React.ReactElement);
  category?: string;
  filePath?: string; // For file mentions
}

interface StreamChunk {
  session_id: string;
  content: string;
  finished: boolean;
}

interface PlanStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  estimatedTime?: string;
  dependencies?: string[];
  details?: string;
}

interface Plan {
  id: string;
  title: string;
  description: string;
  steps: PlanStep[];
  progress: number;
  isGenerating?: boolean;
}

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agent: string;
  isStreaming?: boolean;
  plan?: Plan;
}

interface CLISession {
  id: string;
  agent: string;
  command: string;
  working_dir?: string;
  is_active: boolean;
  created_at: number;
  last_activity: number;
}

interface SessionStatus {
  active_sessions: CLISession[];
  total_sessions: number;
}

interface ChatInterfaceProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedAgent?: string;
  project?: RecentProject;
}

interface AgentSettings {
  enabled: boolean;
  model?: string;
  sandbox_mode: boolean;
  auto_approval: boolean;
  session_timeout_minutes: number;
  output_format: string;
  debug_mode: boolean;
  max_tokens?: number;
  temperature?: number;
}

interface AllAgentSettings {
  claude: AgentSettings;
  codex: AgentSettings;
  gemini: AgentSettings;
  max_concurrent_sessions: number;
}

// Available agents with their capabilities
const AGENTS: Agent[] = [
  {
    id: 'claude',
    name: 'claude',
    displayName: 'Claude Code CLI',
    icon: Bot,
    description: 'Advanced reasoning, coding, and analysis'
  },
  {
    id: 'codex',
    name: 'codex', 
    displayName: 'Codex',
    icon: Code,
    description: 'Code generation and completion specialist'
  },
  {
    id: 'gemini',
    name: 'gemini',
    displayName: 'Gemini',
    icon: Brain,
    description: 'Google\'s multimodal AI assistant'
  },
  {
    id: 'test',
    name: 'test',
    displayName: 'Test CLI',
    icon: Bot,
    description: 'Test CLI streaming functionality'
  }
];

// Agent capabilities for @ command
const AGENT_CAPABILITIES: Record<string, AgentCapability[]> = {
  claude: [
    { id: 'analysis', name: 'Code Analysis', description: 'Deep code analysis and review', category: 'Analysis' },
    { id: 'refactor', name: 'Refactoring', description: 'Intelligent code refactoring', category: 'Development' },
    { id: 'debug', name: 'Debugging', description: 'Advanced debugging assistance', category: 'Development' },
    { id: 'explain', name: 'Code Explanation', description: 'Detailed code explanations', category: 'Learning' },
    { id: 'optimize', name: 'Optimization', description: 'Performance optimization suggestions', category: 'Performance' }
  ],
  codex: [
    { id: 'generate', name: 'Code Generation', description: 'Generate code from natural language', category: 'Generation' },
    { id: 'complete', name: 'Auto-completion', description: 'Intelligent code completion', category: 'Generation' },
    { id: 'translate', name: 'Language Translation', description: 'Convert between programming languages', category: 'Translation' },
    { id: 'patterns', name: 'Design Patterns', description: 'Implement common design patterns', category: 'Architecture' }
  ],
  gemini: [
    { id: 'multimodal', name: 'Multimodal Understanding', description: 'Process text, images, and code together', category: 'AI' },
    { id: 'reasoning', name: 'Advanced Reasoning', description: 'Complex logical reasoning tasks', category: 'AI' },
    { id: 'search', name: 'Web Integration', description: 'Real-time web search and integration', category: 'Integration' },
    { id: 'creative', name: 'Creative Solutions', description: 'Innovative problem-solving approaches', category: 'Creativity' }
  ]
};

export function ChatInterface({ isOpen, selectedAgent, project }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  const placeholderTimerRef = useRef<number | null>(null);
  const typingIntervalRef = useRef<number | null>(null);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<AutocompleteOption[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [commandType, setCommandType] = useState<'/' | '@' | null>(null);
  const [commandStart, setCommandStart] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Allow parallel executions: track active streaming sessions
  const [executingSessions, setExecutingSessions] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AllAgentSettings | null>(null);
  const [enabledAgents, setEnabledAgents] = useState<Record<string, boolean> | null>(null);
  const [workspaceEnabled, setWorkspaceEnabled] = useState(true);
  const [fileMentionsEnabled, setFileMentionsEnabled] = useState(true);
  const [planModeEnabled, setPlanModeEnabled] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgentGroup>({});
  const { files, listFiles, searchFiles } = useFileMention();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const storageKey = React.useMemo(() => project ? `chat:${project.path}` : null, [project]);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const { showError } = useToast();

  // Utilities to normalize agent id and check enablement
  const displayNameToId = React.useMemo(() => ({
    'Claude Code CLI': 'claude',
    'Codex': 'codex',
    'Gemini': 'gemini',
    'Test CLI': 'test',
  } as const), []);

  const getAgentId = (nameOrDisplay: string | undefined | null): string => {
    if (!nameOrDisplay) return 'claude';
    const lower = String(nameOrDisplay).toLowerCase();
    // match display names
    const fromDisplay = (displayNameToId as any)[nameOrDisplay];
    if (fromDisplay) return fromDisplay;
    // already an id
    if (['claude','codex','gemini','test'].includes(lower)) return lower;
    return lower;
  };

  // Helper function to resolve working directory for CLI commands
  const resolveWorkingDir = React.useCallback(async (): Promise<string> => {
    if (!project) {
      return '';
    }
    
    if (!workspaceEnabled) {
      return project.path;
    }
    
    try {
      const list = await invoke<Array<Record<string,string>>>('get_git_worktrees');
      const ws = list.find(w => (w.path || '').startsWith(project.path + '/.commander')) as any;
      const resolvedPath = (ws && ws.path) ? ws.path : project.path;
      return resolvedPath;
    } catch (error) {
      return project.path;
    }
  }, [project, workspaceEnabled]);

  const ensureEnabled = async (agentId: string): Promise<boolean> => {
    if (!enabledAgents) {
      // Lazy refresh if not yet loaded or stale
      try {
        const map = await invoke<Record<string, boolean>>('load_agent_settings');
        setEnabledAgents(map);
        return map[agentId] !== false;
      } catch (e) {
        console.error('Failed to refresh enabled agents:', e);
        // Fail safe: block when unknown to honor security/disable intent
        return false;
      }
    }
    return enabledAgents[agentId] !== false;
  };

  const isLongMessage = (text: string | undefined) => {
    if (!text) return false;
    if (text.length > 100) return true;
    const lines = text.split('\n');
    return lines.length > 6;
  };

  const truncateMessage = (text: string, limit = 100) => {
    if (text.length <= limit) return text;
    return text.slice(0, limit).trimEnd() + '…';
  };

  const toggleExpand = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNewSession = () => {
    // Clear messages
    setMessages([]);
    // Clear current plan if any
    setCurrentPlan(null);
    // Clear expanded messages
    setExpandedMessages(new Set());
    // Clear input
    setInputValue('');
    // Clear autocomplete
    setShowAutocomplete(false);
    setCommandType(null);
    // Clear from session storage
    if (storageKey) {
      try {
        sessionStorage.removeItem(storageKey);
      } catch (e) {
        console.warn('Failed to clear chat history from storage:', e);
      }
    }
    // Also clear from backend store
    if (project) {
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('save_project_chat', { projectPath: project.path, messages: [] }).catch(() => {})
      })
    }
  };

  // Rotating placeholder messages
  const NORMAL_PLACEHOLDERS = React.useMemo(() => [
    "Type /claude 'your prompt', /codex 'your code request', or /gemini 'your question'...",
    "Ask to generate tests for a function…",
    "Try @file to mention code in your repo…",
    "Say ‘refactor this component to hooks’…",
    "Run a CLI task with /codex quickly…",
  ], []);
  const PLAN_PLACEHOLDERS = React.useMemo(() => [
    "Describe what you want to accomplish — I’ll plan it…",
    "E.g., ‘Add dark mode with a toggle and tests’…",
    "Outline a multi-step refactor and I’ll break it down…",
  ], []);

  // Session management functions
  const loadSessionStatus = useCallback(async () => {
    try {
      const status = await invoke<SessionStatus>('get_active_sessions');
      setSessionStatus(status);
    } catch (error) {
      console.error('Failed to load session status:', error);
    }
  }, []);

  const loadAgentSettings = useCallback(async () => {
    try {
      const settings = await invoke<AllAgentSettings>('load_all_agent_settings');
      setAgentSettings(settings);
    } catch (error) {
      console.error('Failed to load agent settings:', error);
    }
  }, []);

  const loadEnabledAgents = useCallback(async () => {
    try {
      const map = await invoke<Record<string, boolean>>('load_agent_settings');
      setEnabledAgents(map);
    } catch (error) {
      console.error('Failed to load enabled agents:', error);
      setEnabledAgents(null);
    }
  }, []);

  const loadSubAgents = useCallback(async () => {
    try {
      const agents = await invoke<SubAgentGroup>('load_sub_agents_grouped');
      setSubAgents(agents);
      console.log('Loaded sub-agents:', agents);
    } catch (error) {
      console.error('Failed to load sub-agents:', error);
    }
  }, []);

  const terminateSession = async (sessionId: string) => {
    try {
      await invoke('terminate_session', { sessionId });
      await loadSessionStatus(); // Refresh session list
    } catch (error) {
      console.error('Failed to terminate session:', error);
    }
  };

  const terminateAllSessions = async () => {
    try {
      await invoke('terminate_all_sessions');
      await loadSessionStatus(); // Refresh session list
    } catch (error) {
      console.error('Failed to terminate all sessions:', error);
    }
  };

  const sendQuitCommand = async (sessionId: string) => {
    try {
      await invoke('send_quit_command_to_session', { sessionId });
      // Wait a moment then refresh session status
      setTimeout(loadSessionStatus, 1000);
    } catch (error) {
      console.error('Failed to send quit command:', error);
    }
  };

  // Helper function to get the selected model for an agent
  const getAgentModel = (agentName: string): string | null => {
    if (!agentSettings) return null;
    
    const displayNameToKey = {
      'Claude Code CLI': 'claude',
      'Codex': 'codex',
      'Gemini': 'gemini',
      'Test CLI': 'test',
    };
    
    const agentKey = displayNameToKey[agentName as keyof typeof displayNameToKey] || agentName.toLowerCase();
    const settings = agentSettings[agentKey as keyof typeof agentSettings] as AgentSettings;
    
    return settings?.model || null;
  };

  // Handle autocomplete filtering
  const updateAutocomplete = useCallback(async (value: string, cursorPos: number) => {
    const beforeCursor = value.slice(0, cursorPos);
    const match = beforeCursor.match(/([/@])([^\s]*)$/);
    
    if (!match) {
      setShowAutocomplete(false);
      setCommandType(null);
      return;
    }

    const [, command, query] = match;
    const startPos = beforeCursor.lastIndexOf(command);
    
    setCommandType(command as '/' | '@');
    setCommandStart(startPos);
    
    let options: AutocompleteOption[] = [];
    
    if (command === '/') {
      // Filter agents based on query
      options = AGENTS
        .filter(agent => {
          // Hide disabled agents; when map unknown, conservatively hide
          if (!enabledAgents) return false;
          return enabledAgents[agent.id] !== false;
        })
        .filter(agent => 
          query === '' || 
          agent.name.toLowerCase().includes(query.toLowerCase()) ||
          agent.displayName.toLowerCase().includes(query.toLowerCase())
        )
        .map(agent => ({
          id: agent.id,
          label: agent.name,
          description: agent.description,
          icon: agent.icon,
          category: 'Agents'
        }));
    } else if (command === '@') {
      // Handle both file mentions and agent capabilities
      const allOptions: AutocompleteOption[] = [];
      
      // Add file mentions if enabled
      if (fileMentionsEnabled && project) {
        try {
          if (query) {
            await searchFiles(query, { 
              directory_path: project.path,
              extensions: [...CODE_EXTENSIONS],
              max_depth: 3 
            });
          } else {
            await listFiles({ 
              directory_path: project.path,
              extensions: [...CODE_EXTENSIONS],
              max_depth: 2 
            });
          }
          
          const fileOptions = files
            .filter(file => !file.is_directory)
            .slice(0, 10) // Limit to 10 files for performance
            .map(file => ({
              id: `file-${file.relative_path}`,
              label: file.name,
              description: file.relative_path,
              icon: () => FileTypeIcon({ filename: file.name }),
              category: 'Files',
              filePath: file.relative_path
            }));
          
          allOptions.push(...fileOptions);
        } catch (error) {
          console.error('Failed to load files for autocomplete:', error);
        }
      }
      
      // Add sub-agents from CLI agent files
      Object.entries(subAgents).forEach(([cliName, agents]) => {
        agents
          .filter(agent => 
            query === '' ||
            agent.name.toLowerCase().includes(query.toLowerCase()) ||
            agent.description.toLowerCase().includes(query.toLowerCase())
          )
          .forEach(agent => {
            allOptions.push({
              id: `subagent-${cliName}-${agent.name}`,
              label: `@${agent.name}`,
              description: agent.description.split('\n')[0].substring(0, 100), // First line, truncated
              category: `${cliName.charAt(0).toUpperCase() + cliName.slice(1)} Sub-Agents`,
              icon: () => (
                <div className="flex items-center justify-center h-4 w-4 rounded-full text-xs font-bold" 
                     style={{ backgroundColor: agent.color || '#6b7280', color: 'white' }}>
                  {agent.name.charAt(0).toUpperCase()}
                </div>
              )
            } as AutocompleteOption);
          });
      });
      
      // Add agent capabilities
      AGENTS.forEach(agent => {
        // Skip disabled agents; when map unknown, skip conservatively
        if (!enabledAgents || enabledAgents[agent.id] === false) return;
        const capabilities = AGENT_CAPABILITIES[agent.id] || [];
        capabilities
          .filter(cap => 
            query === '' ||
            cap.name.toLowerCase().includes(query.toLowerCase()) ||
            cap.description.toLowerCase().includes(query.toLowerCase()) ||
            agent.displayName.toLowerCase().includes(query.toLowerCase())
          )
          .forEach(cap => {
            allOptions.push({
              id: `capability-${agent.id}-${cap.id}`,
              label: `${cap.name} (${agent.displayName})`,
              description: cap.description,
              category: cap.category
            });
          });
      });
      
      // Sort options: Files first, then sub-agents, then capabilities
      options = allOptions.sort((a, b) => {
        if (a.category === 'Files' && b.category !== 'Files') return -1;
        if (a.category !== 'Files' && b.category === 'Files') return 1;
        if (a.category?.includes('Sub-Agents') && !b.category?.includes('Sub-Agents')) return -1;
        if (!a.category?.includes('Sub-Agents') && b.category?.includes('Sub-Agents')) return 1;
        return a.label.localeCompare(b.label);
      });
    }
    
    setAutocompleteOptions(options);
    setSelectedOptionIndex(0);
    setShowAutocomplete(options.length > 0);
  }, [fileMentionsEnabled, project, files, listFiles, searchFiles, subAgents, agentSettings]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      // Defer to ensure element is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Load persisted messages for current project on mount/change
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { messages: ChatMessage[] };
        if (Array.isArray(parsed.messages)) {
          setMessages(parsed.messages);
        }
      }
    } catch (e) {
      console.warn('Failed to load chat history:', e);
    }
  }, [storageKey]);

  // Persist messages whenever they change
  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ messages }));
    } catch (e) {
      console.warn('Failed to persist chat history:', e);
    }
    // Also persist to backend store (debounced and filtered)
    const timer = setTimeout(() => {
      if (!project) return;
      const cleaned = messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        agent: m.agent,
      }))
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('save_project_chat', { projectPath: project.path, messages: cleaned }).catch(() => {})
      })
    }, 300);
    return () => clearTimeout(timer);
  }, [messages, storageKey]);

  // Load chat from backend store when opening a project
  useEffect(() => {
    if (!project) return;
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('load_project_chat', { projectPath: project.path }).then((msgs: any) => {
        if (Array.isArray(msgs) && msgs.length > 0) {
          // Merge minimal messages into UI message shape
          const restored: ChatMessage[] = msgs.map((m: any, i: number) => ({
            id: `restored-${i}-${m.timestamp}`,
            content: String(m.content ?? ''),
            role: m.role === 'assistant' ? 'assistant' : 'user',
            timestamp: Number(m.timestamp ?? Date.now()),
            agent: String(m.agent ?? 'claude'),
          }))
          setMessages(restored)
        }
      }).catch(() => {})
    }).catch(() => {})
  }, [project?.path])

  // Animated typing for rotating placeholder
  useEffect(() => {
    // Run only when input is empty and nothing is executing
    const shouldAnimate = isOpen && executingSessions.size === 0 && !isInputFocused && inputValue.trim() === '';
    const messages = planModeEnabled ? PLAN_PLACEHOLDERS : NORMAL_PLACEHOLDERS;
    let idx = 0;

    const clearTimers = () => {
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current);
        typingIntervalRef.current = null;
      }
      if (placeholderTimerRef.current) {
        window.clearTimeout(placeholderTimerRef.current);
        placeholderTimerRef.current = null;
      }
    };

    const typeMessage = (text: string, done: () => void) => {
      setTypedPlaceholder('');
      let i = 0;
      typingIntervalRef.current = window.setInterval(() => {
        i += 1;
        setTypedPlaceholder(text.slice(0, i));
        if (i >= text.length) {
          if (typingIntervalRef.current) {
            window.clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;
          }
          done();
        }
      }, 35);
    };

    const cycle = () => {
      if (!shouldAnimate || messages.length === 0) return;
      const text = messages[idx % messages.length];
      typeMessage(text, () => {
        placeholderTimerRef.current = window.setTimeout(() => {
          // small pause, then clear and move to next
          setTypedPlaceholder('');
          idx += 1;
          cycle();
        }, 1400);
      });
    };

    clearTimers();
    if (shouldAnimate) {
      cycle();
    } else {
      setTypedPlaceholder('');
    }

    return () => {
      clearTimers();
    };
  }, [isOpen, executingSessions, isInputFocused, inputValue, planModeEnabled, NORMAL_PLACEHOLDERS, PLAN_PLACEHOLDERS]);

  // Global shortcut: Cmd/Ctrl+Enter focuses the input so you can type immediately
  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    setInputValue(newValue);
    updateAutocomplete(newValue, cursorPos);
  };

  // Handle cursor position changes
  const handleInputSelect = (e: React.FormEvent<HTMLInputElement>) => {
    const cursorPos = (e.target as HTMLInputElement).selectionStart || 0;
    updateAutocomplete(inputValue, cursorPos);
  };

  // Handle autocomplete selection
  const handleAutocompleteSelect = (option: AutocompleteOption) => {
    if (!commandType) return;
    
    const beforeCommand = inputValue.slice(0, commandStart);
    const afterCommand = inputValue.slice(commandStart);
    const commandEnd = afterCommand.indexOf(' ');
    const afterSelection = commandEnd !== -1 ? afterCommand.slice(commandEnd) : '';
    
    let newValue: string;
    let insertText: string;
    
    if (commandType === '/') {
      // Replace with agent command
      insertText = option.label;
      newValue = beforeCommand + '/' + insertText + ' ' + afterSelection.trimStart();
    } else {
      // Check if it's a sub-agent selection
      if (option.id.startsWith('subagent-')) {
        // Sub-agent mention - use the name without @ since we already have @
        insertText = option.label.replace('@', '');
        newValue = beforeCommand + '@' + insertText + ' ' + afterSelection.trimStart();
      } else if (option.filePath) {
        // File mention
        insertText = option.filePath;
        newValue = beforeCommand + '@' + insertText + ' ' + afterSelection.trimStart();
      } else {
        // Capability reference
        insertText = option.label;
        newValue = beforeCommand + '@' + insertText + ' ' + afterSelection.trimStart();
      }
    }
    
    setInputValue(newValue);
    setShowAutocomplete(false);
    
    // Focus input and position cursor after the selection
    setTimeout(() => {
      if (inputRef.current) {
        const cursorPos = beforeCommand.length + 1 + insertText.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  };

  // Generate plan using Ollama
  const generatePlan = async (userInput: string): Promise<Plan> => {
    let systemPrompt = `You are an expert project planner. Break down the user's request into clear, actionable steps. 

For each step, provide:
1. A clear title (what needs to be done)
2. A brief description (how to do it)
3. Estimated time (be realistic)
4. Dependencies (if any)
5. Detailed implementation notes

Format your response as JSON:
{
  "title": "Plan title",
  "description": "Brief description of what this plan accomplishes", 
  "steps": [
    {
      "id": "step-1",
      "title": "Step title",
      "description": "Brief description",
      "estimatedTime": "5 minutes",
      "dependencies": ["step-0"],
      "details": "Detailed implementation notes and considerations"
    }
  ]
}

Make the plan comprehensive but practical. Focus on implementation steps that can be executed by AI coding assistants.`;

    try {
      // Try to load the system prompt from prompts config
      const promptsConfig = await invoke<any>('load_prompts');
      const planSystemPrompt = promptsConfig?.prompts?.plan_mode?.system?.content;
      if (planSystemPrompt) {
        systemPrompt = planSystemPrompt;
      }
    } catch (error) {
      console.warn('Could not load plan system prompt, using default:', error);
    }

    try {
      // Call Ollama API through Tauri backend
      const response = await invoke<string>('generate_plan', {
        prompt: userInput,
        systemPrompt
      });
      
      const planData = JSON.parse(response);
      
      return {
        id: `plan-${Date.now()}`,
        title: planData.title,
        description: planData.description,
        steps: planData.steps.map((step: any) => ({
          ...step,
          status: 'pending' as const
        })),
        progress: 0,
        isGenerating: false
      };
    } catch (error) {
      console.error('Failed to generate plan:', error);
      
      // Fallback plan generation
      const steps = userInput.split(' ').length > 10 ? [
        {
          id: 'step-1',
          title: 'Analyze Requirements',
          description: 'Break down the user request and identify key components',
          status: 'pending' as const,
          estimatedTime: '2 minutes',
          details: 'Review the user input and identify what needs to be implemented'
        },
        {
          id: 'step-2', 
          title: 'Design Solution',
          description: 'Plan the implementation approach',
          status: 'pending' as const,
          estimatedTime: '5 minutes',
          dependencies: ['step-1'],
          details: 'Define the architecture and approach for implementation'
        },
        {
          id: 'step-3',
          title: 'Implement Changes',
          description: 'Execute the planned solution',
          status: 'pending' as const,
          estimatedTime: '10 minutes',
          dependencies: ['step-2'],
          details: 'Write code and make necessary changes'
        }
      ] : [
        {
          id: 'step-1',
          title: 'Execute Request',
          description: userInput,
          status: 'pending' as const,
          estimatedTime: '3 minutes',
          details: 'Simple request that can be executed directly'
        }
      ];
      
      return {
        id: `plan-${Date.now()}`,
        title: 'Generated Plan',
        description: `Plan for: ${userInput}`,
        steps,
        progress: 0,
        isGenerating: false
      };
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !project) return;
    
    // If plan mode is enabled, generate a plan instead of executing directly
    if (planModeEnabled) {
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        content: inputValue,
        role: 'user',
        timestamp: Date.now(),
        agent: 'Plan Mode',
      };
      
      setMessages(prev => [...prev, userMessage]);
      
      // Create assistant message with generating plan
      const assistantMessageId = `assistant-${Date.now()}`;
      const planMessage: ChatMessage = {
        id: assistantMessageId,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Plan Mode',
        plan: {
          id: `plan-${Date.now()}`,
          title: 'Generating Plan...',
          description: 'Analyzing your request and creating a step-by-step plan',
          steps: [],
          progress: 0,
          isGenerating: true
        }
      };
      
      setMessages(prev => [...prev, planMessage]);
      setInputValue('');
      setShowAutocomplete(false);
      setCommandType(null);
      
      try {
        const plan = await generatePlan(inputValue);
        setCurrentPlan(plan);
        
        // Update the message with the generated plan
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, plan: plan }
            : msg
        ));
      } catch (error) {
        console.error('Failed to generate plan:', error);
        setMessages(prev => prev.map(msg => 
          msg.id === assistantMessageId 
            ? { ...msg, content: `Error generating plan: ${error}`, plan: undefined }
            : msg
        ));
      }
      
      return;
    }
    
    // Regular message handling (existing logic)
    // Parse command from input (e.g., "/claude help" -> agent="claude", message="help")
    let agentToUse = selectedAgent;
    let messageToSend = inputValue;
    
    // Check if input starts with a command
    if (inputValue.startsWith('/')) {
      const parts = inputValue.split(' ');
      const command = parts[0].slice(1); // Remove the '/'
      const args = parts.slice(1).join(' ');
      
      // Map command to agent
      if (['claude', 'codex', 'gemini', 'test'].includes(command)) {
        const commandToAgent = {
          'claude': 'Claude Code CLI',
          'codex': 'Codex', 
          'gemini': 'Gemini',
          'test': 'Test CLI',
        };
        agentToUse = commandToAgent[command as keyof typeof commandToAgent];
        messageToSend = args || 'help'; // Default to 'help' if no args provided
      }
    }
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: inputValue,
      role: 'user',
      timestamp: Date.now(),
      agent: agentToUse || selectedAgent || 'claude',
    };
    
    // Respect settings: block disabled agents (refresh map if needed)
    const targetDisplay = agentToUse || selectedAgent || 'claude';
    const targetId = getAgentId(targetDisplay);
    const allowed = await ensureEnabled(targetId);
    if (!allowed) {
      showError(`${targetDisplay} is disabled in Settings`, 'Agent disabled');
      return;
    }

    setMessages(prev => [...prev, userMessage]);
    
    // Create assistant message for streaming response
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: Date.now(),
      agent: agentToUse || selectedAgent || 'claude',
      isStreaming: true,
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    setExecutingSessions(prev => {
      const s = new Set(prev);
      s.add(assistantMessageId);
      return s;
    });
    
    // Clear input and hide autocomplete
    setInputValue('');
    setShowAutocomplete(false);
    setCommandType(null);
    
    try {
      // Determine which CLI command to execute
      const agentCommandMap = {
        'claude': 'execute_claude_command',
        'codex': 'execute_codex_command', 
        'gemini': 'execute_gemini_command',
        'test': 'execute_test_command',
      };
      
      // Map display names to command names
      const displayNameToCommand = {
        'Claude Code CLI': 'claude',
        'Codex': 'codex',
        'Gemini': 'gemini',
        'Test CLI': 'test',
      };
      
      const finalAgent = agentToUse || selectedAgent || 'claude';
      const commandName = displayNameToCommand[finalAgent as keyof typeof displayNameToCommand] || finalAgent.toLowerCase();
      const commandFunction = agentCommandMap[commandName as keyof typeof agentCommandMap];
      
      if (commandFunction) {
        const workingDir = await resolveWorkingDir();
        await invoke(commandFunction, {
          sessionId: assistantMessageId,
          message: messageToSend,
          workingDir: workingDir,
        });
        
        // Refresh session status after command execution
        setTimeout(loadSessionStatus, 500);
      }
    } catch (error) {
      console.error('Failed to execute command:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, content: `Error: ${error}`, isStreaming: false }
          : msg
      ));
      setExecutingSessions(prev => {
        const s = new Set(prev);
        s.delete(assistantMessageId);
        return s;
      });
    }
  };

  // Handle plan execution
  const handleExecutePlan = async () => {
    if (!currentPlan || !project) return;
    
    const planSteps = currentPlan.steps.map(step => step.title + ': ' + step.description).join('\n');
    const planPrompt = `Execute this plan step by step:

${currentPlan.title}
${currentPlan.description}

Steps to execute:
${planSteps}

Please execute each step systematically.`;
    
    // Create a message for plan execution
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: `Execute Plan: ${currentPlan.title}`,
      role: 'user',
      timestamp: Date.now(),
      agent: selectedAgent || 'claude',
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Create assistant message for execution response
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: Date.now(),
      agent: selectedAgent || 'claude',
      isStreaming: true,
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    setExecutingSessions(prev => {
      const s = new Set(prev);
      s.add(assistantMessageId);
      return s;
    });
    
    try {
      // Execute with the selected agent
      const agentCommandMap = {
        'claude': 'execute_claude_command',
        'codex': 'execute_codex_command', 
        'gemini': 'execute_gemini_command',
        'test': 'execute_test_command',
      };
      
      const displayNameToCommand = {
        'Claude Code CLI': 'claude',
        'Codex': 'codex',
        'Gemini': 'gemini',
        'Test CLI': 'test',
      };
      
      const finalAgent = selectedAgent || 'claude';
      const targetId2 = getAgentId(finalAgent);
      if (!(await ensureEnabled(targetId2))) {
        showError(`${finalAgent} is disabled in Settings`, 'Agent disabled');
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: 'Agent disabled in Settings', isStreaming: false } : m));
        return;
      }
      const commandName = displayNameToCommand[finalAgent as keyof typeof displayNameToCommand] || finalAgent.toLowerCase();
      const commandFunction = agentCommandMap[commandName as keyof typeof agentCommandMap];
      
      if (commandFunction) {
        const workingDir = await resolveWorkingDir();
        await invoke(commandFunction, {
          sessionId: assistantMessageId,
          message: planPrompt,
          workingDir: workingDir,
        });
      }
    } catch (error) {
      console.error('Failed to execute plan:', error);
      setMessages(prev => prev.map(msg => 
        msg.id === assistantMessageId 
          ? { ...msg, content: `Error executing plan: ${error}`, isStreaming: false }
          : msg
      ));
      setExecutingSessions(prev => {
        const s = new Set(prev);
        s.delete(assistantMessageId);
        return s;
      });
    }
  };

  // Handle individual step execution  
  const handleExecuteStep = async (stepId: string) => {
    if (!currentPlan || !project) return;
    
    const step = currentPlan.steps.find(s => s.id === stepId);
    if (!step) return;
    
    const stepPrompt = `Execute this specific step from the plan:

Step: ${step.title}
Description: ${step.description}
${step.details ? `Details: ${step.details}` : ''}

Please focus only on this step.`;
    
    // Update step status to in_progress
    setCurrentPlan(prev => prev ? {
      ...prev,
      steps: prev.steps.map(s => 
        s.id === stepId ? { ...s, status: 'in_progress' as const } : s
      )
    } : null);
    
    // Update the plan in messages
    setMessages(prev => prev.map(msg => 
      msg.plan ? {
        ...msg,
        plan: {
          ...msg.plan,
          steps: msg.plan.steps.map(s => 
            s.id === stepId ? { ...s, status: 'in_progress' as const } : s
          )
        }
      } : msg
    ));
    
    // Create execution message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: `Execute Step: ${step.title}`,
      role: 'user',
      timestamp: Date.now(),
      agent: selectedAgent || 'claude',
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Create assistant response
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      content: '',
      role: 'assistant', 
      timestamp: Date.now(),
      agent: selectedAgent || 'claude',
      isStreaming: true,
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    setExecutingSessions(prev => {
      const s = new Set(prev);
      s.add(assistantMessageId);
      return s;
    });
    
    try {
      const agentCommandMap = {
        'claude': 'execute_claude_command',
        'codex': 'execute_codex_command', 
        'gemini': 'execute_gemini_command',
        'test': 'execute_test_command',
      };
      
      const displayNameToCommand = {
        'Claude Code CLI': 'claude',
        'Codex': 'codex',
        'Gemini': 'gemini',
        'Test CLI': 'test',
      };
      
      const finalAgent = selectedAgent || 'claude';
      const targetId3 = getAgentId(finalAgent);
      if (!(await ensureEnabled(targetId3))) {
        showError(`${finalAgent} is disabled in Settings`, 'Agent disabled');
        setMessages(prev => prev.map(m => m.id === assistantMessageId ? { ...m, content: 'Agent disabled in Settings', isStreaming: false } : m));
        return;
      }
      const commandName = displayNameToCommand[finalAgent as keyof typeof displayNameToCommand] || finalAgent.toLowerCase();
      const commandFunction = agentCommandMap[commandName as keyof typeof agentCommandMap];
      
      if (commandFunction) {
        const workingDir = await resolveWorkingDir();
        await invoke(commandFunction, {
          sessionId: assistantMessageId,
          message: stepPrompt,
          workingDir: workingDir,
        });
        
        // Mark step as completed after successful execution
        setTimeout(() => {
          setCurrentPlan(prev => prev ? {
            ...prev,
            steps: prev.steps.map(s => 
              s.id === stepId ? { ...s, status: 'completed' as const } : s
            )
          } : null);
          
          setMessages(prev => prev.map(msg => 
            msg.plan ? {
              ...msg,
              plan: {
                ...msg.plan,
                steps: msg.plan.steps.map(s => 
                  s.id === stepId ? { ...s, status: 'completed' as const } : s
                )
              }
            } : msg
          ));
        }, 2000); // Mark as completed after 2 seconds
      }
    } catch (error) {
      console.error('Failed to execute step:', error);
      // Mark step as pending again on error
      setCurrentPlan(prev => prev ? {
        ...prev,
        steps: prev.steps.map(s => 
          s.id === stepId ? { ...s, status: 'pending' as const } : s
        )
      } : null);
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === assistantMessageId) {
          return { ...msg, content: `Error executing step: ${error}`, isStreaming: false };
        }
        if (msg.plan) {
          return {
            ...msg,
            plan: {
              ...msg.plan,
              steps: msg.plan.steps.map(s => 
                s.id === stepId ? { ...s, status: 'pending' as const } : s
              )
            }
          };
        }
        return msg;
      }));
      setExecutingSessions(prev => {
        const s = new Set(prev);
        s.delete(assistantMessageId);
        return s;
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showAutocomplete) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
      return;
    }
    
    // Handle autocomplete navigation
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedOptionIndex(prev => 
          prev < autocompleteOptions.length - 1 ? prev + 1 : 0
        );
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        setSelectedOptionIndex(prev => 
          prev > 0 ? prev - 1 : autocompleteOptions.length - 1
        );
        break;
        
      case 'Enter':
        e.preventDefault();
        if (autocompleteOptions[selectedOptionIndex]) {
          handleAutocompleteSelect(autocompleteOptions[selectedOptionIndex]);
        }
        break;
        
      case 'Escape':
        e.preventDefault();
        setShowAutocomplete(false);
        break;
        
      case 'Tab':
        e.preventDefault();
        if (autocompleteOptions[selectedOptionIndex]) {
          handleAutocompleteSelect(autocompleteOptions[selectedOptionIndex]);
        }
        break;
    }
  };

  // Listen for streaming CLI responses
  useEffect(() => {
    const unlistenStream = listen<StreamChunk>('cli-stream', (event) => {
      const chunk = event.payload;
      
      setMessages(prev => prev.map(msg => {
        if (msg.id === chunk.session_id) {
          return {
            ...msg,
            content: msg.content + chunk.content,
            isStreaming: !chunk.finished,
          };
        }
        return msg;
      }));
      
      if (chunk.finished) {
        setExecutingSessions(prev => {
          const s = new Set(prev);
          s.delete(chunk.session_id);
          return s;
        });
      }
    });

    const unlistenError = listen<string>('cli-error', (event) => {
      console.error('CLI Error:', event.payload);
    });

    return () => {
      unlistenStream.then(fn => fn());
      unlistenError.then(fn => fn());
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load initial session status and set up periodic refresh
  useEffect(() => {
    // Load workspace preference from backend (defaults to true)
    invoke<boolean>('get_git_worktree_preference').then((pref) => {
      setWorkspaceEnabled(!!pref)
    }).catch(() => {
      setWorkspaceEnabled(true)
    })
    loadSessionStatus();
    
    const interval = setInterval(loadSessionStatus, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, [loadSessionStatus]);

  // Load session status and agent settings when chat opens
  useEffect(() => {
    if (isOpen) {
      loadSessionStatus();
      loadAgentSettings();
      loadSubAgents();
      
      // Load file mentions setting
      const loadFileMentionsSetting = async () => {
        try {
          const appSettings = await invoke('load_app_settings') as any;
          setFileMentionsEnabled(appSettings?.file_mentions_enabled ?? true);
        } catch (error) {
          console.error('Failed to load file mentions setting:', error);
        }
      };
      loadFileMentionsSetting();
    }
  }, [isOpen, loadSessionStatus, loadAgentSettings, loadEnabledAgents, loadSubAgents]);

  // Click outside to close autocomplete
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        autocompleteRef.current &&
        !autocompleteRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowAutocomplete(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected option into view
  useEffect(() => {
    if (showAutocomplete && autocompleteRef.current) {
      const selectedElement = autocompleteRef.current.children[0]?.children[selectedOptionIndex + 1] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ 
          block: 'nearest',
          behavior: 'smooth'
        });
      }
    }
  }, [selectedOptionIndex, showAutocomplete]);

  return (
    <div className="flex flex-col h-full min-h-0" data-testid="chat-root">
      {/* Session Status Header */}
      {sessionStatus && sessionStatus.total_sessions > 0 && (
        <div className="border-b bg-muted/30 px-6 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">
                {sessionStatus.total_sessions} Active Session{sessionStatus.total_sessions !== 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                {sessionStatus.active_sessions.slice(0, 3).map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-1 px-2 py-1 bg-background rounded text-xs"
                  >
                    <Terminal className="h-3 w-3" />
                    <span>{session.agent}</span>
                  </div>
                ))}
                {sessionStatus.total_sessions > 3 && (
                  <span className="text-xs text-muted-foreground">
                    +{sessionStatus.total_sessions - 3} more
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSessionPanel(!showSessionPanel)}
                className="h-6 px-2 text-xs"
              >
                {showSessionPanel ? 'Hide' : 'Manage'} Sessions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Session Management Panel */}
      {showSessionPanel && sessionStatus && (
        <div className="border-b bg-background p-4">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Active CLI Sessions</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={terminateAllSessions}
                  className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                >
                  Terminate All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSessionPanel(false)}
                  className="h-7 w-7 p-0"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {sessionStatus.active_sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Terminal className="h-4 w-4" />
                    <div>
                      <div className="font-medium text-sm">{session.agent}</div>
                      <div className="text-xs text-muted-foreground">
                        Created: {new Date(session.created_at * 1000).toLocaleTimeString()}
                        {session.working_dir && (
                          <span className="ml-2">• {session.working_dir.split('/').pop()}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => sendQuitCommand(session.id)}
                      className="h-6 px-2 text-xs"
                    >
                      Send Quit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => terminateSession(session.id)}
                      className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                    >
                      Force Kill
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chat Messages Area with ScrollArea */}
      <ScrollArea className="flex-1 p-6" data-testid="chat-scrollarea">
        <div className="max-w-4xl mx-auto">
          {/* New Session Button */}
          {messages.length > 0 && (
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewSession}
                className="h-8 px-3 text-xs flex items-center gap-2"
              >
                <RotateCcw className="h-3 w-3" />
                New Session
              </Button>
            </div>
          )}
          
          <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground mt-20">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
              <p className="text-sm mb-2">
                Ask questions about your code, request changes, or get help with your project.
              </p>
              <div className="text-xs text-muted-foreground space-y-1">
                <p><kbd className="px-1.5 py-0.5 bg-muted rounded">/claude</kbd> - Direct command execution</p>
                <p><kbd className="px-1.5 py-0.5 bg-muted rounded">/claude help</kbd> - Get help and available commands</p>
                <p>Non-interactive mode for fast, direct responses</p>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg p-3 ${
                    message.role === 'user' 
                      ? 'bg-primary text-primary-foreground ml-12' 
                      : 'bg-muted mr-12'
                  }`}>
                    <div className="flex items-center gap-2 mb-1 text-xs opacity-70">
                      {message.role === 'user' ? (
                        <User className="h-3 w-3" />
                      ) : (
                        <Bot className="h-3 w-3" />
                      )}
                      <span>{message.role === 'user' ? 'You' : message.agent}</span>
                      {message.role === 'assistant' && getAgentModel(message.agent) && (
                        <>
                          <span>•</span>
                          <span className="text-muted-foreground">using {getAgentModel(message.agent)}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
                      {message.isStreaming && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                  </div>
                    <div className="whitespace-pre-wrap text-sm">
                      {(() => {
                        const content = message.content || '';
                        const long = isLongMessage(content);
                        const expanded = expandedMessages.has(message.id);
                        if (!content && message.isStreaming) return 'Thinking...';
                        if (!long || expanded) return content;
                        return truncateMessage(content, 100);
                      })()}
                    </div>
                    {(() => {
                      const content = message.content || '';
                      const long = isLongMessage(content);
                      if (!long) return null;
                      const expanded = expandedMessages.has(message.id);
                      return (
                        <div className="mt-2 text-right">
                          <button
                            onClick={() => toggleExpand(message.id)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            {expanded ? 'Show less' : 'Show more'}
                          </button>
                        </div>
                      );
                    })()}
                    {message.plan && (
                      <div className="mt-3">
                        <PlanBreakdown
                          title={message.plan.title}
                          description={message.plan.description}
                          steps={message.plan.steps}
                          progress={message.plan.progress}
                          isGenerating={message.plan.isGenerating}
                          onExecutePlan={handleExecutePlan}
                          onExecuteStep={handleExecuteStep}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
          </div>
        </div>
      </ScrollArea>
      
      {/* Chat Input Area - Fixed at bottom (account for status bar overlay) */}
      <div className="border-t bg-background p-8 pb-16 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          <ChatInput
            inputRef={inputRef}
            autocompleteRef={autocompleteRef}
            inputValue={inputValue}
            typedPlaceholder={typedPlaceholder}
            onInputChange={handleInputChange}
            onInputSelect={handleInputSelect}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onClear={() => { setInputValue(''); setShowAutocomplete(false); }}
            onSend={handleSendMessage}
            showAutocomplete={showAutocomplete}
            autocompleteOptions={autocompleteOptions as unknown as ChatAutocompleteOption[]}
            selectedOptionIndex={selectedOptionIndex}
            onSelectOption={handleAutocompleteSelect}
            planModeEnabled={planModeEnabled}
            onPlanModeChange={setPlanModeEnabled}
            workspaceEnabled={workspaceEnabled}
            onWorkspaceEnabledChange={setWorkspaceEnabled}
            projectName={project?.name}
            selectedAgent={selectedAgent}
            getAgentModel={getAgentModel}
            fileMentionsEnabled={fileMentionsEnabled}
          />
        </div>
      </div>
      {/* Spacer to avoid overlap with fixed AIAgentStatusBar (h-6) */}
      <div className="h-8" aria-hidden />
    </div>
  );
}
