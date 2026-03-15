import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { Code, Copy, FolderGit, GitBranch, History, MessageCircle } from "lucide-react"

import { RecentProject } from "@/hooks/use-recent-projects"
import { Button } from "@/components/ui/button"
import { ProjectActionsMenu, useProjectApplications } from "@/components/project-actions-menu"

interface ProjectGitWorktree {
  path: string
  branch?: string | null
  is_main?: boolean
}

interface ProjectIdentityHeaderProps {
  project: RecentProject
  homeDir?: string | null
  onCopyPath: () => void
  activeTab?: string
  onTabChange?: (tab: string) => void
}

function normalizeGitRefName(value?: string | null) {
  if (!value) return "Detached"
  return value.replace(/^refs\/heads\//, "")
}

function normalizePath(value: string) {
  return value.replace(/[\\/]+$/, "")
}

function getWorkspaceNameFromPath(projectPath: string) {
  const match = projectPath.match(/[\\/]\.commander[\\/](.+)$/)
  return match?.[1]?.replace(/[\\/]+$/, "") || null
}

const VIEW_TABS = [
  { value: "chat", icon: MessageCircle, label: "Chat" },
  { value: "code", icon: Code, label: "Code" },
  { value: "history", icon: History, label: "History" },
] as const

export function ProjectIdentityHeader({
  project,
  homeDir,
  onCopyPath,
  activeTab,
  onTabChange,
}: ProjectIdentityHeaderProps) {
  const { projectApplications, loadingProjectApplications } = useProjectApplications()
  const [worktrees, setWorktrees] = React.useState<ProjectGitWorktree[]>([])

  React.useEffect(() => {
    let cancelled = false

    const loadWorktrees = async () => {
      if (!project.is_git_repo) {
        setWorktrees([])
        return
      }

      try {
        const list = await invoke<ProjectGitWorktree[]>("get_project_git_worktrees", { projectPath: project.path })
        if (!cancelled) {
          setWorktrees(list)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load project worktrees:", error)
          setWorktrees([])
        }
      }
    }

    void loadWorktrees()
    return () => {
      cancelled = true
    }
  }, [project.is_git_repo, project.path])

  const shortenedPath = React.useMemo(() => {
    if (!homeDir) return project.path
    return project.path.startsWith(homeDir) ? `~${project.path.slice(homeDir.length)}` : project.path
  }, [homeDir, project.path])

  const projectWorktree = React.useMemo(
    () => worktrees.find((entry) => normalizePath(entry.path) === normalizePath(project.path)),
    [project.path, worktrees]
  )

  const workspaceName = React.useMemo(() => getWorkspaceNameFromPath(project.path), [project.path])
  const worktreeLabel = React.useMemo(() => {
    if (projectWorktree?.is_main) return "Main worktree"
    if (workspaceName) return `Workspace ${workspaceName}`
    if (projectWorktree) return "Linked worktree"
    if (project.is_git_repo) return "Repository"
    return "Directory"
  }, [project.is_git_repo, projectWorktree, workspaceName])

  const branchLabel = normalizeGitRefName(projectWorktree?.branch ?? project.git_branch)

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-3"
      data-testid="project-identity-header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
        <FolderGit className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 overflow-hidden">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="min-w-0 shrink truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
              {project.name}
            </h1>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/70 bg-background px-2 py-0.5 text-[11px] font-medium text-foreground/85">
              <GitBranch className="size-3" />
              <span className="max-w-[120px] truncate">{branchLabel}</span>
            </span>
            <span className="hidden sm:inline-flex shrink-0 items-center rounded-full border border-border/60 bg-muted/45 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {worktreeLabel}
            </span>
            {project.git_status === "dirty" ? (
              <span className="hidden sm:inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[hsl(var(--warning))]">
                <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--warning))]" />
                Uncommitted
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden text-[12px] text-muted-foreground">
            <span className="min-w-0 truncate font-mono">{shortenedPath}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-md no-drag text-muted-foreground hover:text-foreground"
              onClick={onCopyPath}
              aria-label="Copy project path"
              title="Copy project path"
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
      {onTabChange && (
        <div className="flex items-center gap-0.5 shrink-0 no-drag">
          {VIEW_TABS.map(({ value, icon: Icon, label }) => (
            <Button
              key={value}
              type="button"
              variant="ghost"
              size="icon"
              className={`h-8 w-8 rounded-md ${
                activeTab === value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => onTabChange(value)}
              aria-label={label}
              title={label}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
      )}
      <div className="shrink-0">
        <ProjectActionsMenu
          project={project}
          projectApplications={projectApplications}
          loadingProjectApplications={loadingProjectApplications}
          showLaunchActions
          showCreateActions={false}
          showDeleteAction={false}
          onCopyPath={onCopyPath}
          triggerLabel={`Project actions for ${project.name}`}
        />
      </div>
    </div>
  )
}
