import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSidebarWidth } from '@/contexts/sidebar-width-context';
import { useSidebar } from '@/components/ui/sidebar';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AIAgent {
  name: string;
  command: string;
  display_name: string;
  available: boolean;
  enabled: boolean;
  error_message?: string;
}

interface AgentStatus {
  agents: AIAgent[];
}

interface AIAgentStatusBarProps {
  onChatToggle?: () => void;
  showChatButton?: boolean;
}

export function AIAgentStatusBar({ onChatToggle, showChatButton }: AIAgentStatusBarProps) {
  const [agents, setAgents] = useState<AIAgent[]>([]);
  const { sidebarWidth } = useSidebarWidth();
  const { state } = useSidebar();

  useEffect(() => {
    // Initial check
    checkAgents();

    // Listen for status updates
    const unlisten = listen<AgentStatus>('ai-agent-status', (event) => {
      setAgents(event.payload.agents);
    });

    // Start monitoring
    invoke('monitor_ai_agents').catch(console.error);

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const checkAgents = async () => {
    try {
      const status = await invoke<AgentStatus>('check_ai_agents');
      setAgents(status.agents);
    } catch (error) {
      console.error('Failed to check AI agents:', error);
    }
  };

  const getAgentStatus = (agent: AIAgent) => {
    if (!agent.enabled) {
      return {
        color: 'bg-neutral-400',
        status: 'disabled'
      };
    } else if (agent.available) {
      return {
        color: 'bg-green-500',
        status: 'available'
      };
    } else {
      return {
        color: 'bg-red-500',
        status: 'unavailable'
      };
    }
  };

  const getTooltipMessage = (agent: AIAgent) => {
    if (!agent.enabled) {
      return `${agent.display_name} is disabled`;
    } else if (agent.error_message) {
      return `${agent.display_name}: ${agent.error_message}`;
    } else if (agent.available) {
      return `${agent.display_name} is available`;
    } else {
      return `${agent.display_name} is not available`;
    }
  };

  // Calculate the actual left offset based on sidebar state
  // When collapsed, treat as invisible (0px) for status bar to span full width
  const actualSidebarWidth = state === 'collapsed' ? 0 : sidebarWidth;

  return (
    <div 
      className="fixed bottom-0 h-6 bg-muted/70 border-t border-border flex items-center justify-end px-4 text-xs z-50 transition-[left] duration-200 ease-linear"
      style={{ 
        left: `${actualSidebarWidth}px`,
        width: `calc(100vw - ${actualSidebarWidth}px)`
      }}
    >
      <div className="flex items-center gap-4">
        {showChatButton && onChatToggle && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onChatToggle}
              className="h-5 px-2 text-xs"
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              Chat
            </Button>
            <div className="w-px h-3 bg-border" />
          </>
        )}
        <span className="text-muted-foreground">Agents:</span>
        {agents.map((agent) => {
          const status = getAgentStatus(agent);
          return (
            <div 
              key={agent.name} 
              className="flex items-center gap-1.5 cursor-help relative group"
              title={getTooltipMessage(agent)}
            >
              <div 
                className={`w-2 h-2 rounded-full ${status.color} ${
                  !agent.enabled ? 'opacity-60' : ''
                }`}
              />
              <span className={`text-foreground ${!agent.enabled ? 'opacity-60' : ''}`}>
                {agent.display_name}
              </span>
              
              {/* Tooltip on hover */}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground border border-border text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-10">
                {getTooltipMessage(agent)}
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-transparent border-t-border"></div>
              </div>
            </div>
          );
        })}
        {agents.length === 0 && (
          <span className="text-muted-foreground">Checking...</span>
        )}
      </div>
    </div>
  );
}
