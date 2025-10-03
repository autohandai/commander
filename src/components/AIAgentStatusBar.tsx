import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSidebarWidth } from '@/contexts/sidebar-width-context';
import { useSidebar } from '@/components/ui/sidebar';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AIAgent {
  name: string;
  command: string;
  display_name: string;
  available: boolean;
  enabled: boolean;
  error_message?: string;
  installed_version?: string | null;
  latest_version?: string | null;
  upgrade_available?: boolean;
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
  const [selectedAgent, setSelectedAgent] = useState<AIAgent | null>(null);
  const { sidebarWidth } = useSidebarWidth();
  const { state } = useSidebar();

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }

    const updated = agents.find(agent => agent.name === selectedAgent.name);
    if (updated && updated !== selectedAgent) {
      setSelectedAgent(updated);
    }
  }, [agents, selectedAgent]);

  useEffect(() => {
    // Initial check
    checkAgents();

    // Listen for status updates
    const unlisten = listen<AgentStatus>('ai-agent-status', (event) => {
      const status = event.payload;
      if (status && Array.isArray(status.agents)) {
        setAgents(status.agents);
      }
    });

    // Start monitoring
    invoke('monitor_ai_agents').catch(console.error);

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const checkAgents = async () => {
    try {
      const status = await invoke<AgentStatus | null>('check_ai_agents');
      if (status && Array.isArray(status.agents)) {
        setAgents(status.agents);
      } else {
        setAgents([]);
      }
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
              className={`flex items-center gap-1.5 cursor-pointer relative group ${selectedAgent?.name === agent.name ? 'text-foreground' : ''}`}
              title={getTooltipMessage(agent)}
              onClick={() => setSelectedAgent(current => current?.name === agent.name ? null : agent)}
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

      {selectedAgent && (
        <AgentVersionCard
          agent={selectedAgent}
          onClose={() => setSelectedAgent(null)}
        />
      )}
    </div>
  );
}

interface AgentVersionCardProps {
  agent: AIAgent;
  onClose: () => void;
}

const upgradeHints: Record<string, { command: string; packageName: string }> = {
  claude: {
    command: 'npm install -g @anthropic-ai/claude-code',
    packageName: '@anthropic-ai/claude-code',
  },
  codex: {
    command: 'npm install -g @openai/codex',
    packageName: '@openai/codex',
  },
  gemini: {
    command: 'npm install -g @google/gemini-cli@latest',
    packageName: '@google/gemini-cli',
  },
};

function AgentVersionCard({ agent, onClose }: AgentVersionCardProps) {
  const hint = upgradeHints[agent.name];
  const installedVersion = agent.installed_version ?? 'Not detected';
  const latestVersion = agent.latest_version ?? 'Unknown';
  const showUpgrade = agent.upgrade_available;

  return (
    <div className="fixed bottom-8 right-4 w-80 rounded-md border border-border bg-popover text-popover-foreground shadow-lg p-4 flex flex-col gap-2 z-[60]">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm text-foreground">{agent.display_name}</p>
          <p className="text-xs text-muted-foreground">Command: {agent.command}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label={`Close ${agent.display_name} details`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-1 text-xs text-muted-foreground">
        <span className="text-foreground">Installed: <strong>{installedVersion}</strong></span>
        <span className="text-foreground">Latest: <strong>{latestVersion}</strong></span>
        {!agent.available && (
          <span className="text-red-500">Agent not detected on PATH.</span>
        )}
        {agent.error_message && (
          <span className="text-red-500">{agent.error_message}</span>
        )}
      </div>

      {hint && (
        <div className="bg-muted/60 p-2 rounded text-xs">
          {showUpgrade ? (
            <p className="text-amber-600 font-medium">
              New version available — run <code>{hint.command}</code> to upgrade.
            </p>
          ) : (
            <p className="text-green-600 font-medium">Agent is up to date.</p>
          )}
        </div>
      )}
    </div>
  );
}
