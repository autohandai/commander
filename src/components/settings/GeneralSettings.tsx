import { FolderOpen } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import type { GeneralSettingsProps } from "@/types/settings"
import { useState } from "react"
import { useToast } from "@/components/ToastProvider"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

export function GeneralSettings({
  tempDefaultProjectsFolder,
  tempShowConsoleOutput,
  systemPrompt,
  saving,
  tempUiTheme = 'auto',
  gitConfig: _gitConfig,
  gitWorktreeEnabled: _gitWorktreeEnabled,
  gitConfigLoading: _gitConfigLoading,
  gitConfigError: _gitConfigError,
  onFolderChange,
  onSelectFolder,
  onConsoleOutputChange,
  onSystemPromptChange,
  onClearRecentProjects,
  onUiThemeChange,
  onRefreshGitConfig: _onRefreshGitConfig,
  onToggleGitWorktree: _onToggleGitWorktree,
}: GeneralSettingsProps) {
  const { showSuccess, showError } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [clearing, setClearing] = useState(false)

  const handleConfirmClear = async () => {
    try {
      setClearing(true)
      await onClearRecentProjects()
      showSuccess('Recent projects cleared', 'Success')
      setConfirmOpen(false)
    } catch (e) {
      showError('Failed to clear recent projects', 'Error')
    } finally {
      setClearing(false)
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">General Settings</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="projects-folder">Default Projects Folder</Label>
            <div className="flex gap-2">
              <Input
                id="projects-folder"
                placeholder="/Users/username/Projects"
                value={tempDefaultProjectsFolder}
                onChange={(e) => onFolderChange(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={onSelectFolder}
              >
                <FolderOpen className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              This folder will be used as the default location for cloning repositories.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select value={tempUiTheme} onValueChange={(v) => onUiThemeChange?.(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (System)</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="system-prompt">Global System Prompt</Label>
            <Textarea
              id="system-prompt"
              placeholder="Enter a global system prompt that will be used across all LLM providers..."
              value={systemPrompt || ''}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              disabled={saving}
              rows={4}
              className="resize-vertical"
            />
            <p className="text-xs text-muted-foreground">
              This prompt will be sent to all LLM providers as the system message for conversations.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Console Output</h4>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="console-output">Show Console Output</Label>
                <p className="text-xs text-muted-foreground">
                  Display real-time console output during git operations like cloning repositories.
                </p>
              </div>
              <Switch
                id="console-output"
                checked={tempShowConsoleOutput}
                onCheckedChange={onConsoleOutputChange}
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Development Tools</h4>
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Clear Recent Projects</Label>
                  <p className="text-xs text-muted-foreground">
                    Clear all recent projects from local storage. This action is irreversible.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmOpen(true)}
                  disabled={saving}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation dialog for clearing recent projects */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear recent projects?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove all recent projects from local storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClear} disabled={clearing}>
              {clearing ? 'Clearing…' : 'Yes, clear them'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
