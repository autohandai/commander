import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import {
  Clock,
  Folder,
  FolderGit,
  GitBranch,
  Home,
  Loader2,
  MoreVertical,
  Plus,
} from "lucide-react"

import { useAuth } from "@/contexts/auth-context"
import { useSettings } from "@/contexts/settings-context"
import { ProjectActionsMenu } from "@/components/project-actions-menu"
import { SearchForm } from "@/components/search-form"
import { NavUser } from "@/components/NavUser"
import { useRecentProjects, RecentProject } from "@/hooks/use-recent-projects"
import { ResizableSidebar } from "@/components/resizable-sidebar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"

interface ProjectGitWorktree {
  path: string
  branch?: string | null
  is_main?: boolean
}

interface SidebarChatSession {
  id: string
  start_time: number
  end_time: number
  agent: string
  branch: string | null
  message_count: number
  summary: string
  archived: boolean
  custom_title: string | null
  ai_summary: string | null
  forked_from: string | null
  source: "local" | "indexed"
  source_file: string | null
  model: string | null
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  isSettingsOpen?: boolean
  setIsSettingsOpen?: (open: boolean) => void
  onRefreshProjects?: React.MutableRefObject<{ refresh: () => void } | null>
  onProjectSelect?: (project: RecentProject) => void
  currentProject?: RecentProject | null
  onHomeClick?: () => void
  onAddProjectClick?: () => void
  onProjectDeleted?: (projectPath: string) => void
  executingProjectPaths?: Set<string>
  onProjectBranchSelect?: (project: RecentProject, branch: string) => Promise<void> | void
  onProjectWorktreeSelect?: (project: RecentProject, worktree: ProjectGitWorktree) => Promise<void> | void
  onProjectBranchCreated?: (project: RecentProject, branch: string) => Promise<void> | void
  onProjectWorktreeCreated?: (project: RecentProject, worktreePath: string) => Promise<void> | void
  onProjectSessionSelect?: (project: RecentProject, session: SidebarChatSession) => Promise<void> | void
  onNewChatProject?: (project: RecentProject) => void
  onDocSelect?: (slug: string) => void
}

function normalizeGitRefName(value?: string | null) {
  if (!value) return "Detached"
  return value.replace(/^refs\/heads\//, "")
}

function findMatchingWorktreeForBranch(worktrees: ProjectGitWorktree[], branch: string) {
  const normalizedBranch = normalizeGitRefName(branch)
  return worktrees.find((worktree) => !worktree.is_main && normalizeGitRefName(worktree.branch) === normalizedBranch)
}

function sessionTitle(session: SidebarChatSession) {
  return session.custom_title || session.ai_summary || session.summary || "Untitled session"
}

interface ProjectSidebarRowProps {
  project: RecentProject
  isActive: boolean
  isExpanded: boolean
  isLoadingRefs: boolean
  isExecuting: boolean
  branches: string[]
  worktrees: ProjectGitWorktree[]
  sessions: SidebarChatSession[]
  currentBranchName: string
  currentProjectPath?: string | null
  showProjectGitRefs: boolean
  showProjectSessions: boolean
  onProjectSelect?: (project: RecentProject) => void
  onToggleProjectExpansion: (project: RecentProject) => Promise<void> | void
  onProjectDeleted: (projectPath: string) => Promise<void> | void
  onProjectBranchCreated: (project: RecentProject, branch: string) => Promise<void> | void
  onProjectWorktreeCreated: (project: RecentProject, worktreePath: string) => Promise<void> | void
  onProjectBranchSelect: (project: RecentProject, branch: string) => Promise<void> | void
  onProjectWorktreeSelect: (project: RecentProject, worktree: ProjectGitWorktree) => Promise<void> | void
  onProjectSessionSelect?: (project: RecentProject, session: SidebarChatSession) => Promise<void> | void
  onNewChat?: (project: RecentProject) => void
}

const ProjectSidebarRow = React.memo(function ProjectSidebarRow({
  project,
  isActive,
  isExpanded,
  isLoadingRefs,
  isExecuting,
  branches,
  worktrees,
  sessions,
  currentBranchName,
  currentProjectPath,
  showProjectGitRefs,
  showProjectSessions,
  onProjectSelect,
  onToggleProjectExpansion,
  onProjectDeleted,
  onProjectBranchCreated,
  onProjectWorktreeCreated,
  onProjectBranchSelect,
  onProjectWorktreeSelect,
  onProjectSessionSelect,
  onNewChat,
}: ProjectSidebarRowProps) {
  const canExpand = (showProjectGitRefs && project.is_git_repo) || showProjectSessions

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
      >
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onProjectSelect?.(project)
            if (canExpand) {
              void onToggleProjectExpansion(project)
            }
          }}
          title={`${project.path}${project.git_branch ? ` (${project.git_branch})` : ""}`}
        >
          {project.is_git_repo ? (
            <FolderGit className="size-4" />
          ) : (
            <Folder className="size-4" />
          )}
          <div className="flex flex-col items-start flex-1 min-w-0">
            <span className="text-sm truncate w-full">{project.name}</span>
            {project.git_branch ? (
              <div className="flex items-center gap-1 text-xs text-muted-foreground min-w-0 w-full">
                <GitBranch className="size-3 shrink-0" />
                <span className="truncate" title={project.git_branch}>{project.git_branch}</span>
                {project.git_status === "dirty" ? (
                  <span className="shrink-0 text-[hsl(var(--warning))]">•</span>
                ) : null}
              </div>
            ) : null}
          </div>
          {isExecuting ? (
            <svg className="size-3.5 animate-spin shrink-0 ml-auto" viewBox="0 0 14 14" aria-label="Agent running">
              <circle
                cx="7"
                cy="7"
                r="5.5"
                fill="none"
                strokeWidth="2"
                stroke="hsl(var(--sidebar-primary))"
                strokeOpacity="0.25"
              />
              <circle
                cx="7"
                cy="7"
                r="5.5"
                fill="none"
                strokeWidth="2"
                stroke="hsl(var(--sidebar-primary))"
                strokeDasharray="20 14"
                strokeLinecap="round"
              />
            </svg>
          ) : null}
          <ProjectActionsMenu
            project={project}
            onProjectDeleted={onProjectDeleted}
            onProjectBranchCreated={onProjectBranchCreated}
            onProjectWorktreeCreated={onProjectWorktreeCreated}
            onNewChat={onNewChat}
            trigger={
              <span
                role="button"
                tabIndex={0}
                className="ml-auto flex size-5 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground no-drag"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); } }}
                aria-label={`Project actions for ${project.name}`}
              >
                <MoreVertical className="size-4" />
              </span>
            }
          />
        </a>
      </SidebarMenuButton>

      {canExpand && isExpanded ? (
        <SidebarMenuSub>
          {isLoadingRefs ? (
            <SidebarMenuSubItem>
              <div className="flex h-7 items-center gap-2 px-2 text-xs text-sidebar-foreground/60">
                <Loader2 className="size-3.5 animate-spin" />
                Loading refs...
              </div>
            </SidebarMenuSubItem>
          ) : (
            <div className="space-y-2 py-1">
              {showProjectSessions && sessions.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/40">
                    Sessions
                  </div>
                  {sessions.map((session) => (
                    <SidebarMenuSubItem key={`${project.path}-session-${session.id}`}>
                      <SidebarMenuSubButton
                        asChild
                        size="sm"
                        className="h-auto items-start py-1.5 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => void onProjectSessionSelect?.(project, session)}
                          className="w-full"
                          title={sessionTitle(session)}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5 text-left">
                            <div className="truncate" title={sessionTitle(session)}>{sessionTitle(session)}</div>
                            <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-sidebar-foreground/50">
                              <span className="shrink-0 rounded-sm bg-sidebar-accent/60 px-1 text-[10px] uppercase tracking-[0.08em]">{session.agent}</span>
                              {session.branch ? (
                                <span className="truncate" title={session.branch}>{normalizeGitRefName(session.branch)}</span>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </div>
              ) : null}

              {showProjectGitRefs && branches.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/40">
                    Branches
                  </div>
                  {branches.map((branch) => {
                    const matchingWorktree = findMatchingWorktreeForBranch(worktrees, branch)
                    return (
                      <SidebarMenuSubItem key={`${project.path}-branch-${branch}`}>
                        <SidebarMenuSubButton
                          asChild
                          size="sm"
                          isActive={normalizeGitRefName(branch) === currentBranchName}
                          className="h-8 text-xs"
                        >
                          <button
                            type="button"
                            onClick={() => void onProjectBranchSelect(project, branch)}
                            className="w-full"
                            title={`Switch ${project.name} to ${normalizeGitRefName(branch)}`}
                          >
                            <GitBranch className="size-3.5 shrink-0" />
                            <span className="truncate" title={normalizeGitRefName(branch)}>{normalizeGitRefName(branch)}</span>
                            {matchingWorktree ? (
                              <span className="ml-auto text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/35">
                                worktree
                              </span>
                            ) : null}
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </div>
              ) : null}

              {showProjectGitRefs && worktrees.length > 0 ? (
                <div className="space-y-0.5">
                  <div className="px-2 text-[10px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/40">
                    Worktrees
                  </div>
                  {worktrees.map((worktree) => (
                    <SidebarMenuSubItem key={`${project.path}-worktree-${worktree.path}`}>
                      <SidebarMenuSubButton
                        asChild
                        size="sm"
                        isActive={currentProjectPath === worktree.path}
                        className="h-auto items-start py-1.5 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => void onProjectWorktreeSelect(project, worktree)}
                          className="w-full"
                          title={worktree.path}
                        >
                          {worktree.is_main ? <FolderGit className="mt-0.5 size-3.5 shrink-0" /> : <Folder className="mt-0.5 size-3.5 shrink-0" />}
                          <div className="min-w-0 space-y-0.5 text-left">
                            <div className="truncate" title={normalizeGitRefName(worktree.branch) ?? undefined}>{normalizeGitRefName(worktree.branch)}</div>
                            <div className="truncate text-[11px] text-sidebar-foreground/50" title={worktree.is_main ? "Main worktree" : worktree.path}>
                              {worktree.is_main ? "Main worktree" : worktree.path}
                            </div>
                          </div>
                        </button>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </div>
              ) : null}

              {branches.length === 0 && worktrees.length === 0 && sessions.length === 0 ? (
                <SidebarMenuSubItem>
                  <div className="flex h-7 items-center gap-2 px-2 text-xs text-sidebar-foreground/50">
                    No branches or worktrees found
                  </div>
                </SidebarMenuSubItem>
              ) : null}
            </div>
          )}
        </SidebarMenuSub>
      ) : null}
    </SidebarMenuItem>
  )
})

export function AppSidebar({
  isSettingsOpen,
  setIsSettingsOpen,
  onRefreshProjects,
  onProjectSelect,
  currentProject,
  onHomeClick,
  onAddProjectClick,
  onProjectDeleted,
  executingProjectPaths,
  onProjectBranchSelect,
  onProjectWorktreeSelect,
  onProjectBranchCreated,
  onProjectWorktreeCreated,
  onProjectSessionSelect,
  onNewChatProject,
  onDocSelect,
  ...props
}: AppSidebarProps) {
  const { projects, loading, error, refreshProjects } = useRecentProjects()
  const { settings } = useSettings()
  const { user } = useAuth()
  const [expandedProjects, setExpandedProjects] = React.useState<Record<string, boolean>>({})
  const [projectBranches, setProjectBranches] = React.useState<Record<string, string[]>>({})
  const [projectWorktrees, setProjectWorktrees] = React.useState<Record<string, ProjectGitWorktree[]>>({})
  const [projectSessions, setProjectSessions] = React.useState<Record<string, SidebarChatSession[]>>({})
  const [loadingProjectRefs, setLoadingProjectRefs] = React.useState<Record<string, boolean>>({})
  const sidebarDataRef = React.useRef({
    expandedProjects,
    projectBranches,
    projectWorktrees,
    projectSessions,
    loadingProjectRefs,
  })
  const showProjectGitRefs =
    (settings.code_settings as { show_project_git_refs_in_sidebar?: boolean } | undefined)?.show_project_git_refs_in_sidebar ?? true
  const showProjectSessions = false

  React.useEffect(() => {
    sidebarDataRef.current = {
      expandedProjects,
      projectBranches,
      projectWorktrees,
      projectSessions,
      loadingProjectRefs,
    }
  }, [expandedProjects, loadingProjectRefs, projectBranches, projectSessions, projectWorktrees])

  React.useEffect(() => {
    if (onRefreshProjects) {
      onRefreshProjects.current = { refresh: refreshProjects }
    }
    return () => {
      if (onRefreshProjects) {
        onRefreshProjects.current = null
      }
    }
  }, [refreshProjects, onRefreshProjects])

  const handleDragStart = async (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".no-drag")) {
      return
    }

    try {
      await invoke("start_drag")
    } catch (error) {
      console.warn("Failed to start window drag:", error)
    }
  }

  const loadProjectRefs = React.useCallback(async (project: RecentProject, options?: { force?: boolean }) => {
    const { loadingProjectRefs, projectBranches, projectSessions, projectWorktrees } = sidebarDataRef.current
    const canLoadGitRefs = showProjectGitRefs && project.is_git_repo
    const canLoadSessions = showProjectSessions
    if ((!canLoadGitRefs && !canLoadSessions) || loadingProjectRefs[project.path]) return
    const force = options?.force ?? false
    if (
      !force &&
      (!canLoadGitRefs || (projectBranches[project.path] && projectWorktrees[project.path])) &&
      (!canLoadSessions || projectSessions[project.path])
    ) {
      return
    }

    setLoadingProjectRefs((prev) => ({ ...prev, [project.path]: true }))
    try {
      const [branches, worktrees, sessions] = await Promise.all([
        canLoadGitRefs
          ? invoke<string[]>("get_git_branches", { projectPath: project.path }).catch(() => [])
          : Promise.resolve(projectBranches[project.path] || []),
        canLoadGitRefs
          ? invoke<ProjectGitWorktree[]>("get_project_git_worktrees", { projectPath: project.path }).catch(() => [])
          : Promise.resolve(projectWorktrees[project.path] || []),
        canLoadSessions
          ? invoke<SidebarChatSession[]>("load_unified_chat_sessions", {
              projectPath: project.path,
              limit: 5,
              agent: null,
              includeArchived: false,
              includeIndexed: true,
            }).catch(() => [])
          : Promise.resolve(projectSessions[project.path] || []),
      ])
      if (canLoadGitRefs) {
        setProjectBranches((prev) => ({ ...prev, [project.path]: branches }))
        setProjectWorktrees((prev) => ({ ...prev, [project.path]: worktrees }))
      }
      if (canLoadSessions) {
        setProjectSessions((prev) => ({ ...prev, [project.path]: sessions }))
      }
    } finally {
      setLoadingProjectRefs((prev) => ({ ...prev, [project.path]: false }))
    }
  }, [showProjectGitRefs, showProjectSessions])

  const toggleProjectExpansion = React.useCallback(async (project: RecentProject) => {
    const { expandedProjects, projectBranches, projectSessions, projectWorktrees } = sidebarDataRef.current
    const nextExpanded = !expandedProjects[project.path]
    setExpandedProjects((prev) => ({ ...prev, [project.path]: nextExpanded }))

    if (
      nextExpanded &&
      (
        (showProjectGitRefs && project.is_git_repo && (!projectBranches[project.path] || !projectWorktrees[project.path])) ||
        (showProjectSessions && !projectSessions[project.path])
      )
    ) {
      await loadProjectRefs(project)
    }
  }, [loadProjectRefs, showProjectGitRefs, showProjectSessions])

  const handleProjectDeletedFromMenu = React.useCallback(async (projectPath: string) => {
    await refreshProjects()
    onProjectDeleted?.(projectPath)
  }, [onProjectDeleted, refreshProjects])

  const handleBranchCreatedFromMenu = React.useCallback(async (project: RecentProject, branch: string) => {
    await onProjectBranchCreated?.(project, branch)
    await loadProjectRefs(project, { force: true })
  }, [onProjectBranchCreated, loadProjectRefs])

  const handleWorktreeCreatedFromMenu = React.useCallback(async (project: RecentProject, worktreePath: string) => {
    await onProjectWorktreeCreated?.(project, worktreePath)
    await loadProjectRefs(project, { force: true })
  }, [onProjectWorktreeCreated, loadProjectRefs])

  const handleBranchSelect = React.useCallback(async (project: RecentProject, branch: string) => {
    const matchingWorktree = findMatchingWorktreeForBranch(sidebarDataRef.current.projectWorktrees[project.path] || [], branch)
    if (matchingWorktree) {
      await onProjectWorktreeSelect?.(project, matchingWorktree)
    } else {
      await onProjectBranchSelect?.(project, branch)
    }
    await loadProjectRefs(project, { force: true })
  }, [loadProjectRefs, onProjectBranchSelect, onProjectWorktreeSelect])

  const handleWorktreeSelect = React.useCallback(async (project: RecentProject, worktree: ProjectGitWorktree) => {
    await onProjectWorktreeSelect?.(project, worktree)
    await loadProjectRefs(project, { force: true })
  }, [loadProjectRefs, onProjectWorktreeSelect])

  return (
    <ResizableSidebar>
      <Sidebar variant="sidebar" className="flex flex-col" data-testid="app-sidebar" {...props}>
        <div
          className="h-2 w-full drag-area"
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        />

        <SidebarHeader className="px-4">
          <SearchForm onDocSelect={onDocSelect} />
        </SidebarHeader>

        <SidebarContent
          className="flex-1"
        >
          <SidebarGroup>
            <SidebarMenu className="mb-4">
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      onHomeClick?.()
                    }}
                    className="flex items-center gap-2"
                  >
                    <Home className="size-4" />
                    <span>Home</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            {onAddProjectClick ? (
              <SidebarGroupAction
                title="Add Project"
                onClick={onAddProjectClick}
                className="no-drag"
              >
                <Plus className="size-4" />
                <span className="sr-only">Add Project</span>
              </SidebarGroupAction>
            ) : null}

            <SidebarGroupContent>
              <SidebarMenu>
                {loading ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <Clock className="size-4 animate-pulse" />
                      <span>Loading projects...</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : error ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <Clock className="size-4 text-destructive" />
                      <span className="text-destructive text-sm">Failed to load projects</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : projects.length === 0 ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled>
                      <Folder className="size-4 text-muted-foreground" />
                      <span className="text-muted-foreground text-sm">No projects found</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : (
                  projects.map((project) => {
                    const isActive = currentProject?.path === project.path
                    const isExpanded = !!expandedProjects[project.path]
                    const isLoadingRefs = !!loadingProjectRefs[project.path]
                    const branches = projectBranches[project.path] || []
                    const worktrees = projectWorktrees[project.path] || []
                    const sessions = projectSessions[project.path] || []
                    const currentBranchName = normalizeGitRefName(project.git_branch)

                    return (
                      <ProjectSidebarRow
                        key={project.path}
                        project={project}
                        isActive={isActive}
                        isExpanded={isExpanded}
                        isLoadingRefs={isLoadingRefs}
                        isExecuting={!!executingProjectPaths?.has(project.path)}
                        branches={branches}
                        worktrees={worktrees}
                        sessions={sessions}
                        currentBranchName={currentBranchName}
                        currentProjectPath={currentProject?.path}
                        showProjectGitRefs={showProjectGitRefs}
                        showProjectSessions={showProjectSessions}
                        onProjectSelect={onProjectSelect}
                        onToggleProjectExpansion={toggleProjectExpansion}
                        onProjectDeleted={handleProjectDeletedFromMenu}
                        onProjectBranchCreated={handleBranchCreatedFromMenu}
                        onProjectWorktreeCreated={handleWorktreeCreatedFromMenu}
                        onProjectBranchSelect={handleBranchSelect}
                        onProjectWorktreeSelect={handleWorktreeSelect}
                        onProjectSessionSelect={onProjectSessionSelect}
                        onNewChat={onNewChatProject}
                      />
                    )
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/70 pt-3">
          <NavUser
            user={{
              name: user?.name ?? "User",
              email: user?.email ?? "",
              avatar: user?.avatar_url ?? "",
            }}
            setIsSettingsOpen={setIsSettingsOpen}
          />
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

    </ResizableSidebar>
  )
}
