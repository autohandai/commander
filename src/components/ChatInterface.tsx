import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageCircle, Activity, Terminal, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { invoke } from '@tauri-apps/api/core';
import { RecentProject } from '@/hooks/use-recent-projects';
import { useFileMention } from '@/hooks/use-file-mention';
import { CODE_EXTENSIONS } from '@/types/file-mention';
import { useToast } from '@/components/ToastProvider';
import { SubAgentGroup } from '@/types/sub-agent';
import { AGENTS, AGENT_CAPABILITIES, getAgentId, DISPLAY_TO_ID, getAgentDisplayById, normalizeDefaultAgentId } from '@/components/chat/agents';
import { useWorkingDir } from '@/components/chat/hooks/useWorkingDir';
import { ChatInput, AutocompleteOption as ChatAutocompleteOption } from '@/components/chat/ChatInput';
import { MessagesList } from '@/components/chat/MessagesList';
import { SessionStatusHeader } from '@/components/chat/SessionStatusHeader';
import { SessionManagementPanel } from '@/components/chat/SessionManagementPanel';
import { useChatAutocomplete } from '@/components/chat/hooks/useChatAutocomplete';
import { useCLIEvents } from '@/components/chat/hooks/useCLIEvents';
import { useRotatingPlaceholder } from '@/components/chat/hooks/useRotatingPlaceholder';
import { useChatPersistence } from '@/components/chat/hooks/useChatPersistence';
import { useAgentEnablement } from '@/components/chat/hooks/useAgentEnablement';
import type { ChatMessage } from '@/components/chat/types';
import type { SessionStatus } from '@/components/chat/types';
import { useChatExecution } from '@/components/chat/hooks/useChatExecution';
import { ClaudeStreamParser } from '@/components/chat/stream/claudeStreamParser'
import { CodexStreamParser } from '@/components/chat/codex/streamParser'
import { setStepStatus, updateMessagesPlanStep } from '@/components/chat/planStatus';
import { buildAutocompleteOptions } from '@/components/chat/autocomplete';
import type { Plan } from '@/components/chat/plan';
import { generatePlan as generatePlanShared } from '@/components/chat/plan';
import { useSettings } from '@/contexts/settings-context';
import { generateId } from '@/components/chat/utils/id';

// Agent and capability types are defined in chat/agents

// (Removed unused SubAgentOption to satisfy noUnusedLocals)

// AutocompleteOption and Plan types are now imported from shared chat modules

// ChatMessage type moved to chat/types

// CLISession and SessionStatus moved to chat/types

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


export function ChatInterface({ isOpen, selectedAgent, project }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [typedPlaceholder, setTypedPlaceholder] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<ChatAutocompleteOption[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [commandType, setCommandType] = useState<'/' | '@' | null>(null);
  const [commandStart, setCommandStart] = useState(0);
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  // Allow parallel executions: track active streaming sessions
  const [executingSessions, setExecutingSessions] = useState<Set<string>>(new Set());
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AllAgentSettings | null>(null);
  const { enabledAgents, ensureEnabled } = useAgentEnablement();
  const [workspaceEnabled, setWorkspaceEnabled] = useState(true);
  const [fileMentionsEnabled, setFileMentionsEnabled] = useState(true);
  const [chatSendShortcut, setChatSendShortcut] = useState<'enter' | 'mod+enter'>('mod+enter');
  const [planModeEnabled, setPlanModeEnabled] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [subAgents, setSubAgents] = useState<SubAgentGroup>({});
  const [executionMode, setExecutionMode] = useState<'chat'|'collab'|'full'>('collab');
  const [unsafeFull, setUnsafeFull] = useState(false);
  const { files, listFiles, searchFiles } = useFileMention();
  const [mentionBasePath, setMentionBasePath] = useState<string | undefined>(project?.path);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const storageKey = React.useMemo(() => project ? `chat:${project.path}` : null, [project]);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [historyCompacted, setHistoryCompacted] = useState(false);
  const { showError } = useToast();
  let settingsContextValue: ReturnType<typeof useSettings> | undefined
  try {
    settingsContextValue = useSettings()
  } catch {
    settingsContextValue = undefined
  }
  const settingsMaxHistory = settingsContextValue?.settings?.max_chat_history
  const configuredDefaultAgentId = React.useMemo(
    () => normalizeDefaultAgentId(settingsContextValue?.settings?.default_cli_agent),
    [settingsContextValue?.settings?.default_cli_agent]
  )
  const configuredDefaultAgentDisplay = React.useMemo(
    () => getAgentDisplayById(configuredDefaultAgentId),
    [configuredDefaultAgentId]
  )

  const historyLimit = React.useMemo(() => {
    const limit = settingsMaxHistory ?? 15
    if (!limit || limit <= 0) return 15
    return Math.max(1, Math.floor(limit))
  }, [settingsMaxHistory])

  const clampMessages = useCallback(
    (next: ChatMessage[]) => {
      if (!Array.isArray(next)) return next;
      if (!historyLimit || historyLimit <= 0) return next;
      if (next.length <= historyLimit) {
        return next.map((msg) =>
          msg.isStreaming ? { ...msg, status: msg.status ?? 'running' } : msg
        );
      }
      const trimmed = next.slice(next.length - historyLimit);
      return trimmed.map((msg) =>
        msg.isStreaming ? { ...msg, status: msg.status ?? 'running' } : msg
      );
    },
    [historyLimit]
  );

  const setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>> = useCallback(
    (value) => {
      setMessagesState((prev) => {
        const computed =
          typeof value === 'function'
            ? (value as (prev: ChatMessage[]) => ChatMessage[])(prev)
            : value;
        return clampMessages(computed);
      });
    },
    [clampMessages]
  );

  // Utilities to normalize agent id and check enablement live in chat/agents

  // Helper function to resolve working directory for CLI commands
  const resolveWorkingDir = useWorkingDir(project?.path, workspaceEnabled);

  // ensureEnabled provided by hook

  const isLongMessage = (text: string | undefined) => {
    if (!text) return false;
    if (text.length > 100) return true;
    const lines = text.split('\n');
    return lines.length > 6;
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

  // Execution helper (depends on resolveWorkingDir and loadSessionStatus)
  const { execute } = useChatExecution({ resolveWorkingDir, setMessages, setExecutingSessions, loadSessionStatus, invoke })

  // enabled agent loading handled by hook on demand

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
    
    const agentKey = DISPLAY_TO_ID[agentName as keyof typeof DISPLAY_TO_ID] || agentName.toLowerCase();
    const settings = agentSettings[agentKey as keyof typeof agentSettings] as AgentSettings;
    
    return settings?.model || null;
  };

  // Handle autocomplete filtering
  const { updateAutocomplete: updateAutocompleteHook } = useChatAutocomplete({
    enabledAgents,
    agents: AGENTS,
    agentCapabilities: AGENT_CAPABILITIES as any,
    fileMentionsEnabled,
    projectPath: mentionBasePath,
    files: files as any,
    subAgents,
    listFiles,
    searchFiles,
    codeExtensions: [...CODE_EXTENSIONS],
    setOptions: (opts) => setAutocompleteOptions(opts as unknown as ChatAutocompleteOption[]),
    setSelectedIndex: setSelectedOptionIndex,
    setShow: setShowAutocomplete,
  })
  const updateAutocomplete = useCallback(async (value: string, cursorPos: number) => {
    const beforeCursor = value.slice(0, cursorPos)
    const match = beforeCursor.match(/([/@])([^\s]*)$/)
    if (match) {
      const symbol = match[1] as '/' | '@'
      const symbolIndex = beforeCursor.lastIndexOf(symbol)
      setCommandType(symbol)
      setCommandStart(symbolIndex)
    } else {
      setCommandType(null)
    }
    await updateAutocompleteHook(value, cursorPos)
  }, [updateAutocompleteHook]);

  // Track the effective base path for file mentions (workspace if enabled)
  useEffect(() => {
    (async () => {
      try {
        const wd = await resolveWorkingDir();
        setMentionBasePath(wd || project?.path);
      } catch {
        setMentionBasePath(project?.path);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.path, workspaceEnabled]);


  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      // Defer to ensure element is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Persistence (sessionStorage + tauri store)
  useChatPersistence({
    projectPath: project?.path,
    storageKey,
    messages,
    onRestore: (restored) => setMessages(restored as any),
    tauriInvoke: (cmd, args) => invoke(cmd as any, args),
    debounceMs: 300,
  })

    const typedFromHook = useRotatingPlaceholder({
    isOpen,
    executingCount: executingSessions.size,
    isInputFocused,
    inputValue,
    normal: NORMAL_PLACEHOLDERS,
    plan: PLAN_PLACEHOLDERS,
    planModeEnabled,
  })
  useEffect(() => {
    setTypedPlaceholder(typedFromHook)
  }, [typedFromHook])



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
  const handleAutocompleteSelect = (option: ChatAutocompleteOption) => {
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
    // Delegate to shared plan generator to keep logic centralized
    return generatePlanShared(userInput, { invoke });
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !project) return;
    const conversationId = generateId('conv');
    
    // If plan mode is enabled, use CLAUDE/GEMINI permission-mode=plan instead of local planner
    const defaultDisplay = selectedAgent || configuredDefaultAgentDisplay
    const defaultId = getAgentId(defaultDisplay)
    const isAgentPlanCapable = defaultId === 'claude' || defaultId === 'gemini'
    if (planModeEnabled && !isAgentPlanCapable) {
      const userMessage: ChatMessage = {
        id: generateId('user'),
        content: inputValue,
        role: 'user',
        timestamp: Date.now(),
        agent: 'Plan Mode',
        conversationId,
      };
      
      setHistoryCompacted(false);
      setMessages(prev => [...prev, userMessage]);
      
      // Create assistant message with generating plan
      const assistantMessageId = generateId('assistant');
      const planMessage: ChatMessage = {
        id: assistantMessageId,
        content: '',
        role: 'assistant',
        timestamp: Date.now(),
        agent: 'Plan Mode',
        conversationId,
        plan: {
          id: generateId('plan'),
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
    let agentToUse = selectedAgent || configuredDefaultAgentDisplay;
    let messageToSend = inputValue;
    
    // Check if input starts with a command
    if (inputValue.startsWith('/')) {
      const parts = inputValue.split(' ');
      const command = parts[0].slice(1); // Remove the '/'
      const args = parts.slice(1).join(' ');
      
      // Map command to agent
      if (['claude', 'codex', 'gemini', 'ollama', 'test'].includes(command)) {
        const commandToAgent = {
          'claude': 'Claude Code CLI',
          'codex': 'Codex', 
          'gemini': 'Gemini',
          'ollama': 'Ollama',
          'test': 'Test CLI',
        };
        agentToUse = commandToAgent[command as keyof typeof commandToAgent];
        messageToSend = args || 'help'; // Default to 'help' if no args provided
      }
    }
    
    const userMessage: ChatMessage = {
      id: generateId('user'),
      content: inputValue,
      role: 'user',
      timestamp: Date.now(),
      agent: agentToUse || configuredDefaultAgentDisplay,
      conversationId,
    };
    
    // Respect settings: block disabled agents (refresh map if needed)
    const targetDisplay = agentToUse || configuredDefaultAgentDisplay;
    const targetId = getAgentId(targetDisplay);
    const allowed = await ensureEnabled(targetId);
    if (!allowed) {
      showError(`${targetDisplay} is disabled in Settings`, 'Agent disabled');
      return;
    }

    setHistoryCompacted(false);
    setMessages(prev => [...prev, userMessage]);
    
    // Clear input and hide autocomplete
    setInputValue('');
    setShowAutocomplete(false);
    setCommandType(null);
    
    const permissionMode = planModeEnabled ? 'plan' : 'acceptEdits'
    let approvalMode: 'default' | 'auto_edit' | 'yolo' | undefined

    if (targetId === 'gemini') {
      try {
        const cliSettings = await invoke<any>('load_agent_cli_settings', { agent: 'gemini', projectPath: project.path })
        const directDefault = cliSettings?.approvalDefault || cliSettings?.approval_default
        if (typeof directDefault === 'string') {
          const normalized = directDefault.replace('-', '_') as 'default' | 'auto_edit' | 'yolo'
          approvalMode = normalized
        } else if (agentSettings?.gemini?.auto_approval) {
          approvalMode = 'auto_edit'
        }
      } catch (error) {
        console.error('Failed to load Gemini CLI settings:', error)
        if (agentSettings?.gemini?.auto_approval) {
          approvalMode = 'auto_edit'
        }
      }
    }

    await execute(
      agentToUse || configuredDefaultAgentDisplay,
      messageToSend,
      executionMode,
      unsafeFull,
      permissionMode as any,
      approvalMode,
      conversationId
    )
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
    
    const conversationId = generateId('conv');
    // Create a message for plan execution
    const userMessage: ChatMessage = {
      id: generateId('user'),
      content: `Execute Plan: ${currentPlan.title}`,
      role: 'user',
      timestamp: Date.now(),
      agent: selectedAgent || configuredDefaultAgentDisplay,
      conversationId,
    };
    
    setHistoryCompacted(false);
    setMessages(prev => [...prev, userMessage]);
    
    try {
      const finalAgent = selectedAgent || configuredDefaultAgentDisplay;
      const targetId2 = getAgentId(finalAgent);
      if (!(await ensureEnabled(targetId2))) {
        showError(`${finalAgent} is disabled in Settings`, 'Agent disabled');
        return;
      }
      await execute(
        finalAgent,
        planPrompt,
        executionMode,
        unsafeFull,
        planModeEnabled ? 'plan' : 'acceptEdits',
        undefined,
        conversationId
      )
    } catch (error) {
      console.error('Failed to execute plan:', error);
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
    const conversationId = generateId('conv');

    // Update step status to in_progress
    setCurrentPlan(prev => (prev ? setStepStatus(prev, stepId, 'in_progress') : null));
    
    // Update the plan in messages
    setMessages(prev => updateMessagesPlanStep(prev, stepId, 'in_progress'));
    
    // Create execution message
    const userMessage: ChatMessage = {
      id: generateId('user'),
      content: `Execute Step: ${step.title}`,
      role: 'user',
      timestamp: Date.now(),
      agent: selectedAgent || configuredDefaultAgentDisplay,
      conversationId,
    };
    
    setHistoryCompacted(false);
    setMessages(prev => [...prev, userMessage]);
    
    try {
      const finalAgent = selectedAgent || configuredDefaultAgentDisplay;
      const targetId3 = getAgentId(finalAgent);
      if (!(await ensureEnabled(targetId3))) {
        showError(`${finalAgent} is disabled in Settings`, 'Agent disabled');
        return;
      }
      await execute(
        finalAgent,
        stepPrompt,
        executionMode,
        unsafeFull,
        planModeEnabled ? 'plan' : 'acceptEdits',
        undefined,
        conversationId
      )
      // Mark step as completed after successful execution
      setTimeout(() => {
        setCurrentPlan(prev => (prev ? setStepStatus(prev, stepId, 'completed') : null));
        setMessages(prev => updateMessagesPlanStep(prev, stepId, 'completed'));
      }, 2000)
    } catch (error) {
      console.error('Failed to execute step:', error);
      // Mark step as pending again on error
      setCurrentPlan(prev => (prev ? setStepStatus(prev, stepId, 'pending') : null));
      // Reflect pending state inside the plan in messages
      setMessages(prev => updateMessagesPlanStep(prev, stepId, 'pending'));
    }
  };

  const handleCompactConversation = () => {
    setMessages(prev => {
      if (!prev.length) return prev;
      const keep = Math.max(1, Math.floor(historyLimit / 2));
      const sliced = prev.slice(Math.max(prev.length - keep, 0));
      return sliced;
    });
    setHistoryCompacted(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showAutocomplete) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (e.metaKey || e.ctrlKey || chatSendShortcut === 'enter') {
          // Force send regardless of autocomplete state
          handleSendMessage();
          return;
        }
        // If options exist, prefer selecting the current one to avoid races
        let opt = autocompleteOptions[selectedOptionIndex] || autocompleteOptions[0]
        if (!opt && commandType) {
          // Build options synchronously from current state as a fallback
          const beforeCursor = inputRef.current ? inputRef.current.value.slice(0, inputRef.current.selectionStart || 0) : inputValue
          const m = beforeCursor.match(/([/@])([^\s]*)$/)
          const q = m ? m[2] || '' : ''
          const opts = buildAutocompleteOptions(commandType, q, {
            fileMentionsEnabled,
            projectName: project?.name,
            files: files as any,
            subAgents,
            enabledAgents,
            agentCapabilities: AGENT_CAPABILITIES as any,
            agents: AGENTS as any,
          })
          opt = opts[0] as any
        }
        if (opt) {
          handleAutocompleteSelect(opt as any)
        } else {
          handleSendMessage();
        }
      }
      return;
    }

    // Handle autocomplete navigation
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      // Force send even with autocomplete open
      e.preventDefault();
      setShowAutocomplete(false);
      setCommandType(null);
      handleSendMessage();
      return;
    }
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
        if (chatSendShortcut === 'enter') {
          setShowAutocomplete(false);
          setCommandType(null);
          handleSendMessage();
        } else if (autocompleteOptions[selectedOptionIndex]) {
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

  // Listen for streaming CLI responses via hook
  useCLIEvents({
    onStreamChunk: (chunk) => {
      // Per-session parser cache (Ref on component instance)
      if (!(window as any).__claudeParsers) (window as any).__claudeParsers = new Map<string, ClaudeStreamParser>()
      const parsers: Map<string, ClaudeStreamParser> = (window as any).__claudeParsers

      setMessages(prev => prev.map(msg => {
        if (msg.id !== chunk.session_id) return msg
        const agentId = (msg.agent || '').toLowerCase()
        const looksJson = chunk.content.trim().startsWith('{') || chunk.content.includes('"type"')

        const announcement = chunk.content.trim().startsWith('🔗 Agent:')
        if (announcement) {
          return {
            ...msg,
            isStreaming: !chunk.finished,
            status: chunk.finished ? 'completed' : 'running',
          }
        }

        let parser = parsers.get(chunk.session_id)
        const shouldParseClaude = agentId.includes('claude') && (parser || looksJson)

        if (shouldParseClaude) {
          if (!parser) {
            parser = new ClaudeStreamParser('claude')
            parsers.set(chunk.session_id, parser)
          }
          const delta = parser.feed(chunk.content)
          const content = delta ? msg.content + delta : msg.content
          return {
            ...msg,
            content,
            isStreaming: !chunk.finished,
            status: chunk.finished ? 'completed' : 'running',
          }
        }

        if (agentId.includes('codex') && looksJson) {
          if (!(window as any).__codexParsers) (window as any).__codexParsers = new Map<string, CodexStreamParser>()
          const codexParsers: Map<string, CodexStreamParser> = (window as any).__codexParsers
          let parser = codexParsers.get(chunk.session_id)
          if (!parser) {
            parser = new CodexStreamParser()
            codexParsers.set(chunk.session_id, parser)
          }
          const text = parser.feed(chunk.content)
          const steps = parser.getSteps()
          if (text !== undefined) {
            return {
              ...msg,
              content: text,
              isStreaming: !chunk.finished,
              status: chunk.finished ? 'completed' : 'running',
              steps,
            }
          }
          // If parser returns undefined (filtered event), still propagate step updates
          return {
            ...msg,
            steps,
            isStreaming: !chunk.finished,
            status: chunk.finished ? 'completed' : (msg.status ?? 'running'),
          }
        }

        return {
          ...msg,
          content: msg.content + chunk.content,
          isStreaming: !chunk.finished,
          status: chunk.finished ? 'completed' : 'running',
        }
      }))
      if (chunk.finished) {
        setExecutingSessions(prev => {
          const s = new Set(prev);
          s.delete(chunk.session_id);
          return s;
        });
        // Refresh file mention list when agents finish writing files
        if (mentionBasePath && fileMentionsEnabled) {
          listFiles({ directory_path: mentionBasePath, extensions: [...CODE_EXTENSIONS], max_depth: 3 })
            .then(() => {
              if (showAutocomplete && commandType === '@') {
                const pos = inputRef.current?.selectionStart ?? (inputValue?.length ?? 0)
                updateAutocomplete(inputValue, pos)
              }
            })
            .catch(() => {})
        }
        try {
          const parsers: Map<string, ClaudeStreamParser> = (window as any).__claudeParsers
          parsers?.delete(chunk.session_id)
        } catch {}
        try {
          const codexParsers: Map<string, CodexStreamParser> = (window as any).__codexParsers
          codexParsers?.delete(chunk.session_id)
        } catch {}
      }
    },
    onError: (message) => {
      console.error('CLI Error:', message);
    },
  });

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
          const shortcut = appSettings?.chat_send_shortcut;
          setChatSendShortcut(shortcut === 'enter' ? 'enter' : 'mod+enter');
        } catch (error) {
          console.error('Failed to load file mentions setting:', error);
        }
      };
      loadFileMentionsSetting();
    }
  }, [isOpen, loadSessionStatus, loadAgentSettings, loadSubAgents]);

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

  const historyWarningThreshold = Math.max(1, historyLimit - 2);
  const showCompactPrompt = messages.length >= historyWarningThreshold;

  return (
    <div className="relative flex flex-col flex-1 h-full min-h-0 overflow-hidden" data-testid="chat-root">
            <SessionStatusHeader
        sessionStatus={sessionStatus as any}
        showSessionPanel={showSessionPanel}
        onTogglePanel={() => setShowSessionPanel(!showSessionPanel)}
      />

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

      {showCompactPrompt && (
        <div className="border-b bg-muted/40 px-6 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {historyCompacted
                ? 'Conversation compacted. Older messages are collapsed to keep the recent context concise.'
                : `Displaying the most recent ${historyLimit} messages. Compact older messages to maintain focus.`}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={handleCompactConversation}
            >
              Compact conversation
            </Button>
          </div>
        </div>
      )}

      {/* Session Management Panel */}
      {showSessionPanel && sessionStatus && (
        <SessionManagementPanel
          sessions={sessionStatus.active_sessions as any}
          onTerminateAll={terminateAllSessions}
          onSendQuit={sendQuitCommand}
          onTerminateSession={terminateSession}
          onClose={() => setShowSessionPanel(false)}
        />
      )}

      {/* Messages area (ScrollArea fills root; content padded for input) */}
      <ScrollArea data-state="visible" data-testid="chat-scrollarea" className="absolute inset-0 p-6 flex-1 min-h-0">
        <div className="max-w-4xl mx-auto pb-32">
            {/* New Session control moved into ChatInput */}
            
            <div className="space-y-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground mt-20">
                <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
                <p className="text-sm mb-2">
                  Ask questions about your code, request changes, or get help with your project.
                </p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p><kbd className="px-1.5 py-0.5 bg-muted rounded">/codex</kbd> - Direct command execution</p>
                  <p><kbd className="px-1.5 py-0.5 bg-muted rounded">/gemini help</kbd> - Introduce me to this repo</p>
                  <p><kbd className="px-1.5 py-0.5 bg-muted rounded">/claude help</kbd> - Get help and available commands</p>
                  <p>Non-interactive mode for fast, direct responses</p>
                </div>
              </div>
            ) : (
              <>
                <MessagesList
                  messages={messages as any}
                  expandedMessages={expandedMessages}
                  onToggleExpand={toggleExpand}
                  isLongMessage={isLongMessage}
                  onExecutePlan={handleExecutePlan}
                  onExecuteStep={handleExecuteStep}
                />
                <div ref={messagesEndRef} />
              </>
            )}
            </div>
        </div>
      </ScrollArea>

      {/* Chat Input Area - Absolutely positioned at bottom */}
      <div className="absolute bottom-0 left-0 right-0 border-t bg-background p-4 pb-8">
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
            chatSendShortcut={chatSendShortcut}
            defaultAgentLabel={configuredDefaultAgentDisplay}
            onNewSession={handleNewSession}
            showNewSession={messages.length > 0}
            executionMode={executionMode}
            onExecutionModeChange={setExecutionMode}
            unsafeFull={unsafeFull}
            onUnsafeFullChange={setUnsafeFull}
          />
        </div>
      </div>
    </div>
  );
}
