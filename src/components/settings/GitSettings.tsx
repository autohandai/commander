import { RefreshCw, Loader2, User, Mail, Link2, Zap, FolderOpen, CheckCircle2, AlertTriangle } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { GitSettingsProps } from "@/types/settings"

export function GitSettings({
  gitConfig,
  gitWorktreeEnabled,
  gitWorktreeSupported = false,
  gitConfigLoading,
  gitConfigError,
  onRefreshConfig,
  onToggleWorktree
}: GitSettingsProps) {
  return (
    <TooltipProvider>
      <div className="space-y-8">
        {/* Git Workspaces Configuration */}
        <div>
          <h3 className="text-lg font-medium mb-4">Workspaces</h3>
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Label htmlFor="git-worktree">Enable Workspaces</Label>
                  {gitWorktreeSupported ? (
                    <span className="inline-flex items-center text-xs text-green-600 dark:text-green-400 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Supported
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-xs text-yellow-600 dark:text-yellow-400 gap-1">
                      <AlertTriangle className="h-3 w-3" /> Unavailable
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  Workspaces use Git worktrees to create isolated environments for different features. Work on multiple branches simultaneously without switching contexts.
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Link2 className="h-3 w-3" />
                  <a 
                    href="https://git-scm.com/docs/git-worktree" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    Learn more about Git Worktree
                  </a>
                </div>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Switch
                    id="git-worktree"
                    checked={gitWorktreeEnabled}
                    onCheckedChange={onToggleWorktree}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Workspaces create separate directories for each branch using Git worktrees, enabling seamless multi-branch development</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <Separator />

        {/* Git Configuration */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Git Configuration</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={onRefreshConfig}
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
              {gitConfigError}
            </div>
          )}

          <div className="space-y-6">
            {/* Global Git Configuration */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                Global Configuration
              </h4>
              {gitConfigLoading ? (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                      <div className="flex items-center gap-2">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <div className="h-4 w-40 bg-muted animate-pulse rounded" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-28 bg-muted animate-pulse rounded" />
                    </div>
                    <div className="space-y-2">
                      <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border rounded-lg p-4 bg-muted/30">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(gitConfig.global).length > 0 ? (
                      Object.entries(gitConfig.global)
                        .filter(([key]) => ['user.name', 'user.email', 'core.editor', 'init.defaultBranch', 'push.default'].includes(key))
                        .map(([key, value]) => (
                          <div key={key} className="space-y-1">
                            <Label className="text-xs font-mono text-muted-foreground">{key}</Label>
                            <div className="flex items-center gap-2">
                              {key === 'user.name' && <User className="h-3 w-3 text-muted-foreground" />}
                              {key === 'user.email' && <Mail className="h-3 w-3 text-muted-foreground" />}
                              <span className="text-sm bg-background px-2 py-1 rounded font-mono">{value}</span>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="col-span-full text-center py-8">
                        <p className="text-sm text-muted-foreground">No global git configuration found</p>
                        <p className="text-xs text-muted-foreground mt-1">Make sure Git is installed and configured</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Local Git Configuration */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Local Configuration (Current Repository)
              </h4>
              {gitConfigLoading ? (
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded" />
                  <div className="h-4 bg-muted animate-pulse rounded" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(gitConfig.local).length > 0 ? (
                    Object.entries(gitConfig.local)
                      .filter(([key]) => ['user.name', 'user.email', 'core.editor', 'branch.main.remote', 'branch.main.merge'].includes(key))
                      .map(([key, value]) => (
                        <div key={key} className="space-y-1">
                          <Label className="text-xs font-mono">{key}</Label>
                          <div className="flex items-center gap-2">
                            {key === 'user.name' && <User className="h-3 w-3 text-muted-foreground" />}
                            {key === 'user.email' && <Mail className="h-3 w-3 text-muted-foreground" />}
                            <span className="text-sm">{value}</span>
                          </div>
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">Not in a git repository or no local configuration</p>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Git Aliases */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Git Aliases
              </h4>
              {gitConfigLoading ? (
                <div className="space-y-2">
                  <div className="h-4 bg-muted animate-pulse rounded" />
                  <div className="h-4 bg-muted animate-pulse rounded" />
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(gitConfig.aliases).length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Object.entries(gitConfig.aliases).map(([alias, command]) => (
                        <div key={alias} className="p-3 bg-muted/30 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="font-mono text-xs">git {alias}</Badge>
                          </div>
                          <p className="text-sm font-mono text-muted-foreground">{command}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 bg-muted/20 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground mb-2">No git aliases configured</p>
                      <p className="text-xs text-muted-foreground">
                        You can create aliases like: <code className="bg-muted px-1 rounded">git config --global alias.co checkout</code>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
