import React from 'react'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ChevronDown, FolderOpen, Lightbulb } from 'lucide-react'
import type { AgentExecutionMode } from '@/components/chat/agents'

export interface ChatControlsBarProps {
  executionModeOptions?: AgentExecutionMode[]
  executionMode?: string
  onExecutionModeChange?: (m: string) => void
  showDangerousToggle?: boolean
  unsafeFull?: boolean
  onUnsafeFullChange?: (v: boolean) => void
  planModeEnabled: boolean
  onPlanModeChange: (v: boolean) => void
  workspaceEnabled: boolean
  onWorkspaceEnabledChange: (v: boolean) => void
}

function ChatControlsBarInner({
  executionModeOptions,
  executionMode,
  onExecutionModeChange,
  showDangerousToggle = false,
  unsafeFull = false,
  onUnsafeFullChange,
  planModeEnabled,
  onPlanModeChange,
  workspaceEnabled,
  onWorkspaceEnabledChange,
}: ChatControlsBarProps) {
  const activeMode = executionModeOptions?.find((mode) => mode.value === executionMode)

  return (
    <div className="mb-3 flex items-center justify-end gap-2 overflow-x-auto sm:gap-4">
      {executionModeOptions && executionModeOptions.length > 0 && (
        <div className="flex shrink-0 items-center gap-1.5">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="Execution Mode"
                className="h-7 gap-1.5 border-border bg-background px-2 text-xs font-normal"
              >
                <span className="truncate">{activeMode?.label ?? 'Mode'}</span>
                <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className="min-w-[220px]">
              <DropdownMenuRadioGroup value={executionMode} onValueChange={onExecutionModeChange}>
              {executionModeOptions.map((opt) => (
                <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                  {opt.label}
                </DropdownMenuRadioItem>
              ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {showDangerousToggle && (
            <label
              htmlFor="unsafe-full-switch"
              className={`inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors ${
                executionMode === 'full' ? 'text-foreground' : 'opacity-50'
              }`}
            >
              <Switch
                id="unsafe-full-switch"
                checked={unsafeFull}
                onCheckedChange={onUnsafeFullChange}
                disabled={executionMode !== 'full'}
                aria-label="Enable advanced mode"
                className="scale-90"
              />
              <span className="hidden sm:inline">Advanced</span>
            </label>
          )}
        </div>
      )}

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <label htmlFor="plan-mode-switch" className="flex shrink-0 cursor-pointer items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden md:inline text-xs text-muted-foreground">Plan</span>
              <Switch
                id="plan-mode-switch"
                checked={planModeEnabled}
                onCheckedChange={onPlanModeChange}
                aria-label="Enable plan mode"
                className="scale-90"
              />
            </label>
          </TooltipTrigger>
          <TooltipContent>
            <p>Generate step-by-step plans before execution using Ollama</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <label htmlFor="workspace-switch" className="flex shrink-0 cursor-pointer items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="hidden md:inline text-xs text-muted-foreground">Workspace</span>
              <Switch
                id="workspace-switch"
                checked={workspaceEnabled}
                onCheckedChange={onWorkspaceEnabledChange}
                aria-label="Enable workspace mode"
                className="scale-90"
              />
            </label>
          </TooltipTrigger>
          <TooltipContent>
            <p>Enabling this you will start working with git worktree for changes</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  )
}

export const ChatControlsBar = React.memo(ChatControlsBarInner)
