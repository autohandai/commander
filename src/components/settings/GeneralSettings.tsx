import { RefreshCw, FolderOpen, GitBranch, User, Mail, Link2, Zap, Loader2 } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { GeneralSettingsProps } from "@/types/settings"

export function GeneralSettings({
  tempDefaultProjectsFolder,
  tempShowConsoleOutput,
  systemPrompt,
  saving,
  gitConfig,
  gitWorktreeEnabled,
  gitConfigLoading,
  gitConfigError,
  onFolderChange,
  onSelectFolder,
  onConsoleOutputChange,
  onSystemPromptChange,
  onClearRecentProjects,
  onRefreshGitConfig,
  onToggleGitWorktree
}: GeneralSettingsProps) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">General Settings</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-name">Application Name</Label>
            <Input
              id="app-name"
              placeholder="Commander"
              defaultValue="Commander"
            />
          </div>
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
            <Select defaultValue="auto">
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
      
      <Separator />
      
      <TooltipProvider>
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Git Configuration
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshGitConfig}
              disabled={gitConfigLoading}
            >
              {gitConfigLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
          
          {gitConfigError && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded mb-4">
              Failed to load git configuration: {gitConfigError}
            </div>
          )}
          
          <div className="space-y-6">
            {/* Git Worktree Toggle */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Git Worktree
              </h4>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="git-worktree">Enable Git Worktree Support</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-auto p-1">
                          <Link2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          Git worktrees allow you to check out multiple branches in separate directories.
                          <br />
                          <a 
                            href="https://git-scm.com/docs/git-worktree" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-400 underline hover:text-blue-300"
                          >
                            Learn more about git worktree
                          </a>
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Allows working with multiple branches simultaneously in separate directories.
                  </p>
                </div>
                <Switch
                  id="git-worktree"
                  checked={gitWorktreeEnabled}
                  onCheckedChange={onToggleGitWorktree}
                  disabled={gitConfigLoading}
                />
              </div>
            </div>
            
            {/* Global Git Configuration */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Global Configuration
              </h4>
              {gitConfigLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading git configuration...
                </div>
              ) : Object.keys(gitConfig.global).length > 0 ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* User settings */}
                    {gitConfig.global['user.name'] && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <User className="h-3 w-3" />
                          Name
                        </div>
                        <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded">
                          {gitConfig.global['user.name']}
                        </p>
                      </div>
                    )}
                    {gitConfig.global['user.email'] && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Mail className="h-3 w-3" />
                          Email
                        </div>
                        <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded">
                          {gitConfig.global['user.email']}
                        </p>
                      </div>
                    )}
                    
                    {/* Other global settings */}
                    {Object.entries(gitConfig.global)
                      .filter(([key]) => !key.startsWith('user.') && !key.startsWith('alias.'))
                      .slice(0, 8) // Show max 8 other settings to avoid overwhelming
                      .map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <div className="text-sm font-medium">{key}</div>
                          <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded break-all">
                            {value}
                          </p>
                        </div>
                      ))}
                  </div>
                  
                  {Object.keys(gitConfig.global).filter(key => !key.startsWith('user.') && !key.startsWith('alias.')).length > 8 && (
                    <p className="text-xs text-muted-foreground mt-3">
                      ... and {Object.keys(gitConfig.global).filter(key => !key.startsWith('user.') && !key.startsWith('alias.')).length - 8} more settings
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No global git configuration found. Make sure Git is installed and configured.
                </p>
              )}
            </div>
            
            {/* Local Git Configuration */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Local Configuration
              </h4>
              {gitConfigLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </div>
              ) : Object.keys(gitConfig.local).length > 0 ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(gitConfig.local).map(([key, value]) => (
                      <div key={key} className="space-y-1">
                        <div className="text-sm font-medium">{key}</div>
                        <p className="text-sm text-muted-foreground font-mono bg-background px-2 py-1 rounded break-all">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No local git configuration found. This directory may not be a git repository.
                </p>
              )}
            </div>
            
            {/* Git Aliases */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Git Aliases
              </h4>
              {gitConfigLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Loading...
                </div>
              ) : Object.keys(gitConfig.aliases).length > 0 ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="space-y-3">
                    {Object.entries(gitConfig.aliases).map(([alias, command]) => (
                      <div key={alias} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-background rounded">
                        <div className="flex items-center gap-2 min-w-0">
                          <code className="text-sm font-mono bg-primary/10 text-primary px-2 py-1 rounded">
                            git {alias}
                          </code>
                        </div>
                        <div className="flex-1 min-w-0">
                          <code className="text-sm font-mono text-muted-foreground break-all">
                            {command}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No git aliases configured. You can add aliases with <code className="bg-muted px-1 py-0.5 rounded text-xs">git config --global alias.alias_name "command"</code>
                </p>
              )}
            </div>
          </div>
        </div>
      </TooltipProvider>
    </div>
  )
}