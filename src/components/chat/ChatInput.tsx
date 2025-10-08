import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Lightbulb, FolderOpen, Send, PenLine } from 'lucide-react'

export interface AutocompleteOption {
  id: string
  label: string
  description: string
  icon?: React.ComponentType<{ className?: string }> | (() => React.ReactElement)
  category?: string
  filePath?: string
}

interface ChatInputProps {
  inputRef: React.RefObject<HTMLInputElement | null>
  autocompleteRef: React.RefObject<HTMLDivElement | null>

  inputValue: string
  typedPlaceholder: string
  onInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onInputSelect: (e: React.SyntheticEvent<HTMLInputElement>) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onFocus: () => void
  onBlur: () => void
  onClear: () => void
  onSend: () => void

  // Autocomplete
  showAutocomplete: boolean
  autocompleteOptions: AutocompleteOption[]
  selectedOptionIndex: number
  onSelectOption: (option: AutocompleteOption) => void

  // Toggles
  planModeEnabled: boolean
  onPlanModeChange: (v: boolean) => void
  workspaceEnabled: boolean
  onWorkspaceEnabledChange: (v: boolean) => void

  // Context for helper text
  projectName?: string
  selectedAgent?: string
  getAgentModel: (agentName: string) => string | null

  // File mentions toggle affects autocomplete header text
  fileMentionsEnabled: boolean
  chatSendShortcut?: 'enter' | 'mod+enter'
  defaultAgentLabel?: string

  // Session controls
  onNewSession?: () => void
  showNewSession?: boolean

  // Execution mode selector
  executionMode?: 'chat' | 'collab' | 'full'
  onExecutionModeChange?: (m: 'chat' | 'collab' | 'full') => void
  unsafeFull?: boolean
  onUnsafeFullChange?: (v: boolean) => void
}

export function ChatInput(props: ChatInputProps) {
  const {
    inputRef,
    autocompleteRef,
    inputValue,
    typedPlaceholder,
    onInputChange,
    onInputSelect,
    onKeyDown,
    onFocus,
    onBlur,
    onClear,
    onSend,
    showAutocomplete,
    autocompleteOptions,
    selectedOptionIndex,
    onSelectOption,
    planModeEnabled,
    onPlanModeChange,
    workspaceEnabled,
    onWorkspaceEnabledChange,
    projectName,
    selectedAgent,
    getAgentModel,
    fileMentionsEnabled,
    chatSendShortcut = 'mod+enter',
    defaultAgentLabel,
    onNewSession,
    showNewSession,
    executionMode = 'collab',
    onExecutionModeChange,
    unsafeFull = false,
    onUnsafeFullChange,
  } = props

  const resolvedDefaultAgentLabel = defaultAgentLabel ?? 'Claude Code CLI'
  const defaultPlaceholder = `Send a message (defaults to ${resolvedDefaultAgentLabel}). Use /agent to target a specific CLI.`

  // Global shortcut for starting a new chat session
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        if (onNewSession) {
          e.preventDefault()
          onNewSession()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNewSession])

  return (
    <div className="max-w-4xl mx-auto group">
      {showAutocomplete && autocompleteOptions.length > 0 && (
        <div
          ref={autocompleteRef}
          className="mb-3 bg-background border border-border rounded-lg shadow-xl max-h-48 overflow-y-auto"
        >
          <div className="p-2">
            <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
              {fileMentionsEnabled ? `Files in ${projectName || 'Project'} & Capabilities` : 'Agent Capabilities'}
            </div>
            {autocompleteOptions.map((option, index) => {
              const IconComponent = option.icon
              return (
                <button
                  key={option.id}
                  onClick={() => onSelectOption(option)}
                  className={`w-full text-left p-3 rounded-md transition-colors flex items-start gap-3 ${
                    index === selectedOptionIndex
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-accent/50'
                  }`}
                >
                  {IconComponent && (
                    typeof IconComponent === 'function' && IconComponent.length === 0 ? (
                      <IconComponent />
                    ) : (
                      <IconComponent className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    )
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{option.description}</div>
                    {option.category && (
                      <div className="text-xs text-muted-foreground/70 mt-1">{option.category}</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-6 mb-3 items-center">
        {/* Execution Mode (shadcn select) */}
        <div className="flex items-center gap-2">
          <Select value={executionMode} onValueChange={(v: any) => onExecutionModeChange?.(v)}>
            <SelectTrigger className="h-8 min-w-[220px]" aria-label="Execution Mode">
              <SelectValue placeholder="Execution Mode" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="chat">Chat (read-only)</SelectItem>
              <SelectItem value="collab">Agent (ask to execute)</SelectItem>
              <SelectItem value="full">Agent (full access)</SelectItem>
            </SelectContent>
          </Select>
          <label className={`text-xs inline-flex items-center gap-2 ${executionMode !== 'full' ? 'opacity-50' : ''}`}>
            <input
              type="checkbox"
              checked={unsafeFull}
              onChange={(e) => onUnsafeFullChange?.(e.target.checked)}
              disabled={executionMode !== 'full'}
            />
            Advanced
          </label>
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-4 w-4 text-muted-foreground" />
                <label htmlFor="plan-mode-switch" className="text-sm text-muted-foreground cursor-pointer">
                  Plan Mode
                </label>
                <Switch
                  id="plan-mode-switch"
                  checked={planModeEnabled}
                  onCheckedChange={onPlanModeChange}
                  aria-label="Enable plan mode"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generate step-by-step plans before execution using Ollama</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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
                  onCheckedChange={onWorkspaceEnabledChange}
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
        {showNewSession && onNewSession && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 opacity-60 hover:opacity-100 group-hover:opacity-100 transition-opacity"
                  aria-label="New chat"
                  title="New chat"
                  onClick={onNewSession}
                >
                  <PenLine className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <span>New chat</span>
                <div className="mt-1 text-[10px] text-muted-foreground">Cmd/Ctrl+Shift+N</div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        <div className="relative flex-1">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={onInputChange}
            onSelect={onInputSelect}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={typedPlaceholder || (
              planModeEnabled
                ? "Describe what you want to accomplish - I'll create a step-by-step plan..."
                : defaultPlaceholder
            )}
            className="pr-12 py-2.5 text-base"
            autoComplete="off"
            disabled={false}
          />
          {inputValue && (
            <button
              onClick={onClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear input"
            >
              ×
            </button>
          )}
        </div>
        <Button onClick={onSend} disabled={!inputValue.trim()} size="icon" className="h-10 w-10">
          <Send className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {showAutocomplete ? (
            <>
              {chatSendShortcut === 'enter' ? (
                <span>Enter sends • Tab selects • Esc closes</span>
              ) : (
                <span>Enter selects • Ctrl/Cmd+Enter sends</span>
              )}
              <span>↑↓ to navigate • Tab selects • Esc closes</span>
            </>
          ) : (
            <>
              {chatSendShortcut === 'enter' ? (
                <span>Press Enter to send</span>
              ) : (
                <span>Cmd+Enter to send</span>
              )}
             
              <span>↑↓ to navigate • Tab/Enter to select • Esc to close</span>
            </>
          )}
          {projectName && (
            <>
              <span>•</span>
              <span>Working in: {projectName}</span>
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
  )
}
