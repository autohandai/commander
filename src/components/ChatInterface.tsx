import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageCircle, User, Bot, Code, Brain, Activity, Terminal, X, FolderOpen } from 'lucide-react';
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
import { FileText } from 'lucide-react';

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

interface AutocompleteOption {
  id: string;
  label: string;
  description: string;
  icon?: React.ComponentType<{ className?: string }>;
  category?: string;
  filePath?: string; // For file mentions
}

interface StreamChunk {
  session_id: string;
  content: string;
  finished: boolean;
}

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: number;
  agent: string;
  isStreaming?: boolean;
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
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<AutocompleteOption[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [commandType, setCommandType] = useState<'/' | '@' | null>(null);
  const [commandStart, setCommandStart] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus | null>(null);
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AllAgentSettings | null>(null);
  const [workspaceEnabled, setWorkspaceEnabled] = useState(false);
  const [fileMentionsEnabled, setFileMentionsEnabled] = useState(true);
  const { files, listFiles, searchFiles } = useFileMention();
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
              icon: FileText,
              category: 'Files',
              filePath: file.relative_path
            }));
          
          allOptions.push(...fileOptions);
        } catch (error) {
          console.error('Failed to load files for autocomplete:', error);
        }
      }
      
      // Add agent capabilities
      AGENTS.forEach(agent => {
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
      
      // Sort options: Files first, then capabilities
      options = allOptions.sort((a, b) => {
        if (a.category === 'Files' && b.category !== 'Files') return -1;
        if (a.category !== 'Files' && b.category === 'Files') return 1;
        return a.label.localeCompare(b.label);
      });
    }
    
    setAutocompleteOptions(options);
    setSelectedOptionIndex(0);
    setShowAutocomplete(options.length > 0);
  }, [fileMentionsEnabled, project, files, listFiles, searchFiles]);

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
    if (commandType === '/') {
      // Replace with agent command
      newValue = beforeCommand + '/' + option.label + ' ' + afterSelection.trimStart();
    } else {
      // Replace with file path or capability reference
      if (option.filePath) {
        // File mention
        newValue = beforeCommand + '@' + option.filePath + ' ' + afterSelection.trimStart();
      } else {
        // Capability reference
        newValue = beforeCommand + '@' + option.label + ' ' + afterSelection.trimStart();
      }
    }
    
    setInputValue(newValue);
    setShowAutocomplete(false);
    
    // Focus input and position cursor after the selection
    setTimeout(() => {
      if (inputRef.current) {
        const insertText = option.filePath || option.label;
        const cursorPos = beforeCommand.length + 1 + insertText.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !project || isExecuting) return;
    
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
    setIsExecuting(true);
    
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
        console.log(`Executing ${commandFunction} with message: "${messageToSend}" in directory: "${project.path}"`);
        await invoke(commandFunction, {
          sessionId: assistantMessageId,
          message: messageToSend,
          workingDir: project.path,
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
      setIsExecuting(false);
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
        setIsExecuting(false);
      }
    });

    const unlistenError = listen<string>('cli-error', (event) => {
      console.error('CLI Error:', event.payload);
      setIsExecuting(false);
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
    loadSessionStatus();
    
    const interval = setInterval(loadSessionStatus, 10000); // Refresh every 10 seconds
    
    return () => clearInterval(interval);
  }, [loadSessionStatus]);

  // Load session status and agent settings when chat opens
  useEffect(() => {
    if (isOpen) {
      loadSessionStatus();
      loadAgentSettings();
      
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
  }, [isOpen, loadSessionStatus, loadAgentSettings]);

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
    <div className="flex flex-col h-full">
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
      <ScrollArea className="flex-1 p-6">
        <div className="max-w-4xl mx-auto space-y-4">
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
                        <span className="animate-pulse">•••</span>
                      )}
                    </div>
                    <div className="whitespace-pre-wrap text-sm">
                      {message.content || (message.isStreaming ? 'Thinking...' : '')}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </ScrollArea>
      
      {/* Chat Input Area - Fixed at bottom */}
      <div className="border-t bg-background p-8 flex-shrink-0">
        <div className="max-w-4xl mx-auto">
          {/* Autocomplete Dropdown */}
          {showAutocomplete && autocompleteOptions.length > 0 && (
            <div 
              ref={autocompleteRef}
              className="mb-3 bg-background border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto"
            >
              <div className="p-2">
                <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
                  {commandType === '/' ? 'Available Agents' : fileMentionsEnabled ? `Files in ${project?.name || 'Project'} & Capabilities` : 'Agent Capabilities'}
                </div>
                {autocompleteOptions.map((option, index) => {
                  const IconComponent = option.icon;
                  return (
                    <button
                      key={option.id}
                      onClick={() => handleAutocompleteSelect(option)}
                      className={`w-full text-left p-3 rounded-md transition-colors flex items-start gap-3 ${
                        index === selectedOptionIndex 
                          ? 'bg-accent text-accent-foreground' 
                          : 'hover:bg-accent/50'
                      }`}
                    >
                      {IconComponent && (
                        <IconComponent className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{option.label}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {option.description}
                        </div>
                        {option.category && (
                          <div className="text-xs text-muted-foreground/70 mt-1">
                            {option.category}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          
          {/* Workspace Toggle */}
          <div className="flex justify-end mb-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2">
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                    <label htmlFor="workspace-switch" className="text-sm text-muted-foreground cursor-pointer">
                      Enable workspace
                    </label>
                    <Switch
                      id="workspace-switch"
                      checked={workspaceEnabled}
                      onCheckedChange={setWorkspaceEnabled}
                      aria-label="Enable workspace mode"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Enabling this you will start working with git worktree for changes</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onSelect={handleInputSelect}
                onKeyDown={handleKeyDown}
                placeholder="Type /claude 'your prompt', /codex 'your code request', or /gemini 'your question'..."
                className="pr-12 py-2.5 text-base"
                autoComplete="off"
                disabled={isExecuting}
              />
              {inputValue && (
                <button
                  onClick={() => {
                    setInputValue('');
                    setShowAutocomplete(false);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  ×
                </button>
              )}
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isExecuting}
              size="icon"
              className="h-10 w-10"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <span>Press Enter to send</span>
              <span>↑↓ to navigate • Tab/Enter to select • Esc to close</span>
              {project && (
                <>
                  <span>•</span>
                  <span>Working in: {project.name}</span>
                </>
              )}
              {selectedAgent && getAgentModel(selectedAgent) && (
                <>
                  <span>•</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {selectedAgent} using {getAgentModel(selectedAgent)}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">/agent prompt</kbd>
              <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">help</kbd>
              <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">@</kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}