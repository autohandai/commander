import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, MessageCircle, ChevronDown, User, Bot, Code, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { RecentProject } from '@/hooks/use-recent-projects';

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

interface ChatInterfaceProps {
  isOpen: boolean;
  onToggle: () => void;
  selectedAgent?: string;
  project?: RecentProject;
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

export function ChatInterface({ isOpen, onToggle, selectedAgent, project }: ChatInterfaceProps) {
  const [inputValue, setInputValue] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [autocompleteOptions, setAutocompleteOptions] = useState<AutocompleteOption[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [commandType, setCommandType] = useState<'/' | '@' | null>(null);
  const [commandStart, setCommandStart] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Handle autocomplete filtering
  const updateAutocomplete = useCallback((value: string, cursorPos: number) => {
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
      // Show capabilities for all agents or filter by query
      const allCapabilities: AutocompleteOption[] = [];
      
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
            allCapabilities.push({
              id: `${agent.id}-${cap.id}`,
              label: `${cap.name} (${agent.displayName})`,
              description: cap.description,
              category: cap.category
            });
          });
      });
      
      options = allCapabilities;
    }
    
    setAutocompleteOptions(options);
    setSelectedOptionIndex(0);
    setShowAutocomplete(options.length > 0);
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
    if (commandType === '/') {
      // Replace with agent command
      newValue = beforeCommand + '/' + option.label + ' ' + afterSelection.trimStart();
    } else {
      // Replace with capability reference
      newValue = beforeCommand + '@' + option.label + ' ' + afterSelection.trimStart();
    }
    
    setInputValue(newValue);
    setShowAutocomplete(false);
    
    // Focus input and position cursor after the selection
    setTimeout(() => {
      if (inputRef.current) {
        const cursorPos = beforeCommand.length + 1 + option.label.length + 1;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    }, 0);
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !selectedAgent || !project || isExecuting) return;
    
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: inputValue,
      role: 'user',
      timestamp: Date.now(),
      agent: selectedAgent,
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Create assistant message for streaming response
    const assistantMessageId = `assistant-${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      content: '',
      role: 'assistant',
      timestamp: Date.now(),
      agent: selectedAgent,
      isStreaming: true,
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    setIsExecuting(true);
    
    // Clear input and hide autocomplete
    const messageToSend = inputValue;
    setInputValue('');
    setShowAutocomplete(false);
    setCommandType(null);
    
    try {
      // Determine which CLI command to execute based on selected agent
      const agentCommandMap = {
        'Claude Code CLI': 'execute_claude_command',
        'Codex': 'execute_codex_command',
        'Gemini': 'execute_gemini_command',
      };
      
      const commandFunction = agentCommandMap[selectedAgent as keyof typeof agentCommandMap];
      if (commandFunction) {
        await invoke(commandFunction, {
          sessionId: assistantMessageId,
          message: messageToSend,
          workingDir: project.path,
        });
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
      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground mt-20">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
              <p className="text-sm">
                Ask questions about your code, request changes, or get help with your project.
              </p>
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
      </div>
      
      {/* Chat Input Area */}
      <div className="border-t bg-background p-4">
        <div className="max-w-4xl mx-auto">
          {/* Autocomplete Dropdown */}
          {showAutocomplete && autocompleteOptions.length > 0 && (
            <div 
              ref={autocompleteRef}
              className="mb-2 bg-background border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto"
            >
              <div className="p-2">
                <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
                  {commandType === '/' ? 'Available Agents' : 'Agent Capabilities'}
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
          
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onSelect={handleInputSelect}
                onKeyDown={handleKeyDown}
                placeholder="What would you like to build? Try typing / for agents or @ for capabilities..."
                className="pr-12 py-3 text-base"
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
          
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Press Enter to send</span>
              <span>↑↓ to navigate • Tab/Enter to select • Esc to close</span>
              {project && (
                <>
                  <span>•</span>
                  <span>Working in: {project.name}</span>
                </>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Type <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">/</kbd> for agents • 
              <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">@</kbd> for capabilities
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}