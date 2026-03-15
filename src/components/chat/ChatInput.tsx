import React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Send, PenLine } from 'lucide-react'

export interface AutocompleteOption {
  id: string
  label: string
  description: string
  icon?: React.ComponentType<{ className?: string }> | (() => React.ReactElement)
  category?: string
  filePath?: string
}

export interface ChatInputProps {
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

  // Context for helper text
  planModeEnabled: boolean
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
}

function ChatInputInner(props: ChatInputProps) {
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
    projectName,
    selectedAgent,
    getAgentModel,
    fileMentionsEnabled,
    chatSendShortcut = 'mod+enter',
    defaultAgentLabel,
    onNewSession,
    showNewSession,
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

      <div
        data-testid="chat-input-helper"
        className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
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
              <span aria-hidden="true">•</span>
              <span className="min-w-0 truncate">Working in: {projectName}</span>
            </>
          )}
          {selectedAgent && getAgentModel(selectedAgent) && (
            <>
              <span aria-hidden="true">•</span>
              <span className="min-w-0 truncate text-[hsl(var(--link))]">
                {selectedAgent} using {getAgentModel(selectedAgent)}
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:justify-end">
          <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">/agent prompt</kbd>
          <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">help</kbd>
          <kbd className="px-1.5 py-0.5 text-xs bg-muted rounded">@</kbd>
        </div>
      </div>
    </div>
  )
}

export const ChatInput = React.memo(ChatInputInner)
