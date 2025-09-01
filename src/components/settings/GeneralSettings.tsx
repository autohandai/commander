import { FolderOpen } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import type { GeneralSettingsProps } from "@/types/settings"

export function GeneralSettings({
  tempDefaultProjectsFolder,
  tempShowConsoleOutput,
  systemPrompt,
  saving,
  tempUiTheme = 'auto',
  onFolderChange,
  onSelectFolder,
  onConsoleOutputChange,
  onSystemPromptChange,
  onClearRecentProjects,
  onUiThemeChange
}: GeneralSettingsProps) {
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
                    Clear all recent projects from local storage (development only)
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearRecentProjects}
                  disabled={saving}
                >
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
