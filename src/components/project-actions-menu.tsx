import * as React from "react"
import { invoke } from "@tauri-apps/api/core"
import { AlertTriangle, ChevronDown, Copy, FolderGit, FolderOpen, GitBranch, Loader2, Trash2 } from "lucide-react"

import { RecentProject } from "@/hooks/use-recent-projects"
import { ProjectApplicationIcon } from "@/components/project-application-icon"
import { useToast } from "@/components/ToastProvider"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// NASA & Rocket Lab space mission names for auto-generated branch/worktree names
const MISSION_NAMES = [
  "apollo", "gemini", "mercury", "artemis", "voyager", "pioneer",
  "cassini", "galileo", "juno", "dawn", "new-horizons", "insight",
  "perseverance", "curiosity", "spirit", "opportunity", "pathfinder",
  "hubble", "webb", "kepler", "chandra", "spitzer", "osiris-rex",
  "stardust", "genesis", "deep-impact", "messenger", "maven", "grace",
  "landsat", "discovery", "endeavour", "challenger", "columbia", "atlantis",
  "electron", "photon", "capstone", "still-testing", "there-and-back-again",
  "running-out-of-fingers", "love-at-first-insight", "its-a-test",
  "rocket-like-a-hurricane", "virginia-is-for-launch-lovers",
  "look-ma-no-hands", "birds-of-a-feather", "owl-night-long",
  "as-the-crow-flies", "baby-come-back", "catch-me-if-you-can",
  "stronger-together", "live-and-let-fly", "ice-ice-baby",
  "they-go-up-so-fast", "the-owl-spreads-its-wings",
  "good-luck-have-fun", "making-waves", "begin-again",
  "changing-the-world", "wise-one-looks-ahead",
]

function randomMissionName() {
  return MISSION_NAMES[Math.floor(Math.random() * MISSION_NAMES.length)]
}

export interface ProjectApplicationTarget {
  id: string
  label: string
  installed: boolean
}

let cachedProjectApplications: ProjectApplicationTarget[] | null = null
let projectApplicationsPromise: Promise<ProjectApplicationTarget[]> | null = null

export function getOpenDirectoryLabel() {
  if (typeof navigator === "undefined") return "Open Directory"
  const platform = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase()
  return platform.includes("mac") ? "Show in Finder" : "Open Directory"
}

async function loadProjectApplications() {
  if (cachedProjectApplications) {
    return cachedProjectApplications
  }

  if (!projectApplicationsPromise) {
    projectApplicationsPromise = invoke<ProjectApplicationTarget[]>("get_available_project_applications")
      .then((applications) => {
        cachedProjectApplications = applications
        return applications
      })
      .finally(() => {
        projectApplicationsPromise = null
      })
  }

  return projectApplicationsPromise
}

export function useProjectApplications() {
  const [projectApplications, setProjectApplications] = React.useState<ProjectApplicationTarget[]>(cachedProjectApplications ?? [])
  const [loadingProjectApplications, setLoadingProjectApplications] = React.useState(!cachedProjectApplications)

  React.useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        setLoadingProjectApplications(!cachedProjectApplications)
        const applications = await loadProjectApplications()
        if (!cancelled) {
          setProjectApplications(applications)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load available project applications:", error)
          setProjectApplications([])
        }
      } finally {
        if (!cancelled) {
          setLoadingProjectApplications(false)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return { projectApplications, loadingProjectApplications }
}

interface ProjectActionsMenuProps {
  project: RecentProject
  onProjectDeleted?: (projectPath: string) => void
  onProjectBranchCreated?: (project: RecentProject, branch: string) => Promise<void> | void
  onProjectWorktreeCreated?: (project: RecentProject, worktreePath: string) => Promise<void> | void
  projectApplications?: ProjectApplicationTarget[]
  loadingProjectApplications?: boolean
  showLaunchActions?: boolean
  showCreateActions?: boolean
  showDeleteAction?: boolean
  onCopyPath?: () => void
  trigger?: React.ReactElement
  triggerLabel?: string
  contentClassName?: string
  align?: "start" | "center" | "end"
  sideOffset?: number
}

export function ProjectActionsMenu({
  project,
  onProjectDeleted,
  onProjectBranchCreated,
  onProjectWorktreeCreated,
  projectApplications = [],
  loadingProjectApplications = false,
  showLaunchActions = false,
  showCreateActions = true,
  showDeleteAction = true,
  onCopyPath,
  trigger,
  triggerLabel,
  contentClassName,
  align = "end",
  sideOffset = 6,
}: ProjectActionsMenuProps) {
  const [open, setOpen] = React.useState(false)
  const [branchOpen, setBranchOpen] = React.useState(false)
  const [worktreeOpen, setWorktreeOpen] = React.useState(false)
  const [branchName, setBranchName] = React.useState("")
  const [worktreeName, setWorktreeName] = React.useState("")
  const [creatingBranch, setCreatingBranch] = React.useState(false)
  const [creatingWorktree, setCreatingWorktree] = React.useState(false)
  const [deleteConfirmationText, setDeleteConfirmationText] = React.useState("")
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deletingProjectPath, setDeletingProjectPath] = React.useState<string | null>(null)
  const openDirectoryLabel = React.useMemo(() => getOpenDirectoryLabel(), [])
  const { showError, showSuccess } = useToast()
  const hasCreateActions = showCreateActions && project.is_git_repo
  const hasLaunchActions = showLaunchActions && (loadingProjectApplications || projectApplications.length > 0)

  const handleCopyProjectName = React.useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(project.name)
        return
      }

      if (typeof document !== "undefined") {
        const textArea = document.createElement("textarea")
        textArea.value = project.name
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand("copy")
        document.body.removeChild(textArea)
      }
    } catch (error) {
      console.error("Failed to copy project name:", error)
    }
  }, [project.name])

  const handleOpenProjectDirectory = React.useCallback(async () => {
    try {
      await invoke("open_project_directory", { projectPath: project.path })
    } catch (error) {
      console.error("Failed to open project directory:", error)
    }
  }, [project.path])

  const handleOpenProjectWithApplication = React.useCallback(async (applicationId: string) => {
    try {
      await invoke("open_project_with_application", { projectPath: project.path, applicationId })
    } catch (error) {
      console.error("Failed to open project with application:", error)
    }
  }, [project.path])

  const handleDeleteProject = React.useCallback(async () => {
    setDeletingProjectPath(project.path)
    try {
      await invoke("delete_project", { projectPath: project.path })
      onProjectDeleted?.(project.path)
      showSuccess(`${project.name} was deleted from disk.`, "Project Deleted")
      setDeleteOpen(false)
      setDeleteConfirmationText("")
    } catch (error) {
      console.error("Failed to delete project:", error)
    } finally {
      setDeletingProjectPath(null)
    }
  }, [onProjectDeleted, project.name, project.path, showSuccess])

  const handleCreateBranch = React.useCallback(async () => {
    const branch = branchName.trim()
    if (!branch) return

    setCreatingBranch(true)
    try {
      await invoke("create_project_git_branch", { projectPath: project.path, branch })
      await onProjectBranchCreated?.(project, branch)
      showSuccess(`${branch} is ready to use.`, "Branch Created")
      setBranchOpen(false)
      setBranchName("")
    } catch (error) {
      console.error("Failed to create git branch:", error)
      const detail = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
      showError(detail || `Failed to create ${branch}`, "Branch Creation Error")
    } finally {
      setCreatingBranch(false)
    }
  }, [branchName, onProjectBranchCreated, project, showError, showSuccess])

  const handleCreateWorktree = React.useCallback(async () => {
    const name = worktreeName.trim()
    if (!name) return

    setCreatingWorktree(true)
    try {
      const worktreePath = await invoke<string>("create_workspace_worktree", { projectPath: project.path, name })
      await onProjectWorktreeCreated?.(project, worktreePath)
      showSuccess(`workspace/${name} is ready to use.`, "Worktree Created")
      setWorktreeOpen(false)
      setWorktreeName("")
    } catch (error) {
      console.error("Failed to create worktree:", error)
      const detail = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
      showError(detail || `Failed to create workspace/${name}`, "Worktree Creation Error")
    } finally {
      setCreatingWorktree(false)
    }
  }, [onProjectWorktreeCreated, project, showError, showSuccess, worktreeName])

  const menuTrigger = trigger ?? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium no-drag"
      aria-label={triggerLabel ?? `Project actions for ${project.name}`}
    >
      Open
      <ChevronDown className="size-3 opacity-60" />
    </Button>
  )

  const composedTrigger = React.cloneElement(menuTrigger, {
    "aria-label": triggerLabel ?? menuTrigger.props["aria-label"] ?? `Project actions for ${project.name}`,
    onClick: (event: React.MouseEvent) => {
      event.stopPropagation()
      menuTrigger.props.onClick?.(event)
      setOpen(true)
    },
  })

  return (
    <>
      <DropdownMenu modal={false} open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          {composedTrigger}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} sideOffset={sideOffset} className={contentClassName ?? "min-w-[210px]"}>
          {hasCreateActions ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false)
                  setBranchOpen(true)
                }}
              >
                <GitBranch className="size-4" />
                New Branch
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false)
                  setWorktreeOpen(true)
                }}
              >
                <FolderGit className="size-4" />
                New Worktree
              </DropdownMenuItem>
            </>
          ) : null}
          {hasCreateActions && (showLaunchActions || showDeleteAction) ? (
            <DropdownMenuSeparator />
          ) : null}
          {showLaunchActions ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false)
                  void handleOpenProjectDirectory()
                }}
              >
                <FolderOpen className="size-4" />
                {openDirectoryLabel}
              </DropdownMenuItem>
              {hasLaunchActions ? (
                <DropdownMenuSeparator />
              ) : null}
              {loadingProjectApplications ? (
                <DropdownMenuItem disabled>
                  <Loader2 className="size-4 animate-spin" />
                  Checking apps...
                </DropdownMenuItem>
              ) : (
                projectApplications.map((application) => (
                  <DropdownMenuItem
                    key={application.id}
                    disabled={!application.installed}
                    onClick={() => {
                      setOpen(false)
                      void handleOpenProjectWithApplication(application.id)
                    }}
                  >
                    <ProjectApplicationIcon applicationId={application.id} className="size-4 shrink-0" />
                    {application.label}
                  </DropdownMenuItem>
                ))
              )}
              {(onCopyPath || showDeleteAction) ? <DropdownMenuSeparator /> : null}
            </>
          ) : null}
          {onCopyPath ? (
            <>
              {!showLaunchActions ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false)
                  onCopyPath()
                }}
              >
                <Copy className="size-4" />
                Copy Path
                <span className="ml-auto text-xs text-muted-foreground">⌘⇧C</span>
              </DropdownMenuItem>
              {showDeleteAction ? <DropdownMenuSeparator /> : null}
            </>
          ) : null}
          {showDeleteAction ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                setOpen(false)
                setDeleteOpen(true)
                setDeleteConfirmationText("")
              }}
            >
              <Trash2 className="size-4" />
              Delete Project
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={branchOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setBranchName(`feature/${randomMissionName()}`)
          } else {
            setBranchName("")
          }
          setBranchOpen(nextOpen)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
            <DialogDescription>
              Create a new branch from the current HEAD and switch this project to it immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-actions-branch-name">Branch name</Label>
            <Input
              id="project-actions-branch-name"
              aria-label="Branch name"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
              placeholder="feature/new-branch"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBranchOpen(false)} disabled={creatingBranch}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreateBranch()} disabled={!branchName.trim() || creatingBranch}>
              {creatingBranch ? "Creating..." : "Create Branch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={worktreeOpen}
        onOpenChange={(nextOpen) => {
          if (nextOpen) {
            setWorktreeName(randomMissionName())
          } else {
            setWorktreeName("")
          }
          setWorktreeOpen(nextOpen)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Worktree</DialogTitle>
            <DialogDescription>
              Create a new workspace worktree under <span className="font-mono">.commander</span> and open it right away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-actions-worktree-name">Worktree name</Label>
            <Input
              id="project-actions-worktree-name"
              aria-label="Worktree name"
              value={worktreeName}
              onChange={(event) => setWorktreeName(event.target.value)}
              placeholder="feature-x"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setWorktreeOpen(false)} disabled={creatingWorktree}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleCreateWorktree()} disabled={!worktreeName.trim() || creatingWorktree}>
              {creatingWorktree ? "Creating..." : "Create Worktree"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(nextOpen) => {
          setDeleteOpen(nextOpen)
          if (!nextOpen) {
            setDeleteConfirmationText("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Type the project name to confirm permanent deletion from disk and from your recent projects list.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Warning:</span> This permanently removes the project directory from disk and cannot be undone.
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Project name</p>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <span className="min-w-0 truncate font-mono text-sm text-foreground">{project.name}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => void handleCopyProjectName()}
                >
                  <Copy className="size-3.5" />
                  Copy project name
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="delete-project-confirmation" className="text-sm font-medium">
                Confirm project name
              </label>
              <Input
                id="delete-project-confirmation"
                aria-label="Confirm project name"
                value={deleteConfirmationText}
                onChange={(event) => setDeleteConfirmationText(event.target.value)}
                placeholder={project.name}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Type <span className="font-medium text-foreground">{project.name}</span> to enable deletion.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingProjectPath === project.path}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteProject()}
              disabled={deleteConfirmationText.trim() !== project.name || deletingProjectPath === project.path}
            >
              {deletingProjectPath === project.path ? "Deleting..." : "Delete Project"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
