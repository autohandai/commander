import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from "@/components/ui/sidebar"
import { SidebarWidthProvider } from "@/contexts/sidebar-width-context"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Folder } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import React, { useState, useEffect, useRef } from "react"
import { SettingsModal } from "@/components/SettingsModal"
import { CloneRepositoryModal } from "@/components/CloneRepositoryModal"
import { NewProjectModal } from "@/components/NewProjectModal"
import { AboutDialog } from "@/components/AboutDialog"
import { ToastProvider, useToast } from "@/components/ToastProvider"
import { SettingsProvider } from "@/contexts/settings-context"
import { AuthProvider, useAuth } from "@/contexts/auth-context"
import { LoginScreen } from "@/components/LoginScreen"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AIAgentStatusBar } from "@/components/AIAgentStatusBar"
import { ChatInterface } from "@/components/ChatInterface"
import { CodeView } from "@/components/CodeView"
import { HistoryView } from "@/components/HistoryView"
import { ChatHistoryManager } from "@/components/chat-history/ChatHistoryManager"
import { OnboardingModal } from "@/components/OnboardingModal"
import { ProjectIdentityHeader } from "@/components/project-identity-header"
import { ProjectChooserModal } from "@/components/ProjectChooserModal"
import { DashboardView } from "@/components/dashboard/DashboardView"
import { DocsViewer } from "@/components/DocsViewer"
import { useRecentProjects, RecentProject } from "@/hooks/use-recent-projects"
import { useSettings } from "@/contexts/settings-context"
import type { MenuEventPayload } from "@/types/menu"


interface ProjectViewProps {
  project: RecentProject
  selectedAgent?: string
  activeTab: string
  onTabChange: (tab: string) => void
  onExecutingChange?: (projectPath: string, sessionIds: string[]) => void
  pendingChatPrompt?: string | null
  onPendingChatPromptConsumed?: () => void
  loadedSession?: { messages: Array<{ id: string; role: string; content: string; timestamp: number; agent: string }>; sessionId: string } | null
  onLoadedSessionConsumed?: () => void
}

function ProjectView({ project, selectedAgent, activeTab, onTabChange, onExecutingChange, pendingChatPrompt, onPendingChatPromptConsumed, loadedSession, onLoadedSessionConsumed }: ProjectViewProps) {
  const handleTabChange = React.useCallback((value: string) => {
    onTabChange(value)
  }, [onTabChange])

  return (
    <div className="flex-1 flex min-h-0 min-w-0">
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0 min-w-0">
          <TabsContent value="chat" className="flex-1 flex flex-col m-0 min-h-0 min-w-0" forceMount>
            <ChatInterface
              isOpen={true}
              selectedAgent={selectedAgent}
              project={project}
              onExecutingChange={onExecutingChange}
              pendingPrompt={pendingChatPrompt}
              loadedSession={loadedSession}
              onLoadedSessionConsumed={onLoadedSessionConsumed}
              onPendingPromptConsumed={onPendingChatPromptConsumed}
            />
          </TabsContent>

          <TabsContent value="code" className="flex-1 flex flex-col m-0 min-h-0 min-w-0" forceMount>
            <CodeView project={project} />
          </TabsContent>

          <TabsContent value="history" className="flex-1 flex flex-col m-0 min-h-0 min-w-0" forceMount>
            <HistoryView project={project} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

function SidebarAutoCollapseManager({ activeTab, enabled, projectActive, chatHistoryOpen }: { activeTab: string; enabled: boolean; projectActive: boolean; chatHistoryOpen: boolean }) {
  const { setOpen } = useSidebar()
  // Use a ref so the effect only fires on tab/setting/project changes,
  // NOT when setOpen's reference changes due to sidebar state toggling.
  const setOpenRef = useRef(setOpen)
  setOpenRef.current = setOpen

  // Track chatHistoryOpen in a ref so the tab-based effect can read it
  // without having it in its dependency array (avoids re-opening sidebar
  // when chat history closes).
  const chatHistoryOpenRef = useRef(chatHistoryOpen)
  chatHistoryOpenRef.current = chatHistoryOpen

  // Collapse sidebar when chat history panel opens
  useEffect(() => {
    if (chatHistoryOpen) {
      setOpenRef.current(false)
    }
  }, [chatHistoryOpen])

  // Auto-manage sidebar based on tab changes only
  useEffect(() => {
    if (!enabled || !projectActive) return
    // Don't re-open sidebar if chat history is currently open
    if (chatHistoryOpenRef.current) return

    setOpenRef.current(activeTab !== 'code')
  }, [activeTab, enabled, projectActive])

  return null
}

function AppContent() {
  const { settings, isLoading } = useSettings()
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<import('@/types/settings').SettingsTab | undefined>(undefined)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [isProjectChooserOpen, setIsProjectChooserOpen] = useState(false)
  const [currentProject, setCurrentProject] = useState<RecentProject | null>(null)
  const [activeTab, setActiveTab] = useState<string>('chat')
  const [executingProjectPaths, setExecutingProjectPaths] = useState<Set<string>>(new Set())
  const projectSessionsRef = useRef<Map<string, Set<string>>>(new Map())
  const projectContextKey = currentProject?.path ?? null

  const handleExecutingChange = React.useCallback((projectPath: string, sessionIds: string[]) => {
    projectSessionsRef.current.set(projectPath, new Set(sessionIds))
    const executing = new Set<string>()
    for (const [path, sessions] of projectSessionsRef.current) {
      if (sessions.size > 0) executing.add(path)
    }
    setExecutingProjectPaths(executing)
  }, [])
  const handleProjectDeleted = React.useCallback((projectPath: string) => {
    if (currentProject?.path === projectPath) {
      setCurrentProject(null)
      setActiveTab('chat')
    }
    projectSessionsRef.current.delete(projectPath)
    setExecutingProjectPaths((prev) => {
      const next = new Set(prev)
      next.delete(projectPath)
      return next
    })
  }, [currentProject])
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined)
  const [welcomePhrase, setWelcomePhrase] = useState<string>("")
  const [dashboardDays, setDashboardDays] = useState(30)
  const { showSuccess, showError, showToast } = useToast()
  const [pendingChatPrompt, setPendingChatPrompt] = useState<string | null>(null)
  const [activeDocSlug, setActiveDocSlug] = useState<string | null>(null)
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false)
  const [loadedSession, setLoadedSession] = useState<{ messages: Array<{ id: string; role: string; content: string; timestamp: number; agent: string }>; sessionId: string } | null>(null)
  const projectsRefreshRef = useRef<{ refresh: () => void } | null>(null)
  const { projects: allRecentProjects } = useRecentProjects()
  const [homeDir, setHomeDir] = useState<string>("")

  const WELCOME_PHRASES = [
    'Command any AI coding CLI agent from one screen',
    'Your AI coding command center — one screen, all agents',
    'Orchestrate CLI coding agents with ease',
    'Spin up, chat, code — all in one place',
    'Command, collaborate, and ship with AI agents',
    'One hub to drive every AI coding workflow',
    'Clone, create, and command — faster together',
  ]

  const pickRandomPhrase = (prev?: string) => {
    if (WELCOME_PHRASES.length === 0) return ''
    let next = WELCOME_PHRASES[Math.floor(Math.random() * WELCOME_PHRASES.length)]
    if (WELCOME_PHRASES.length > 1 && next === prev) {
      // Try once more to avoid repeats on quick toggles
      next = WELCOME_PHRASES[Math.floor(Math.random() * WELCOME_PHRASES.length)]
    }
    return next
  }

  const handleDragStart = async (e: React.MouseEvent) => {
    // Only trigger drag if not clicking on interactive elements
    if ((e.target as HTMLElement).closest('.no-drag')) {
      return;
    }
    try {
      await invoke('start_drag');
    } catch (error) {
      console.warn('Failed to start window drag:', error);
    }
  };

  const handleCloneSuccess = () => {
    showSuccess('Repository cloned successfully!', 'Clone Complete')
    // Refresh projects list to show the newly cloned repository
    if (projectsRefreshRef.current?.refresh) {
      projectsRefreshRef.current.refresh()
    }
  }

  const handleOpenProject = async () => {
    try {
      const selectedPath = await invoke('select_git_project_folder') as string | null
      
      if (selectedPath) {
        
        // Open via backend (validates, sets cwd, updates recents w/ dedup) and use returned data
        const opened = await invoke<RecentProject>('open_existing_project', { project_path: selectedPath, projectPath: selectedPath })
        setCurrentProject(opened)
        setActiveTab('chat')

        // Refresh projects list
        if (projectsRefreshRef.current?.refresh) {
          projectsRefreshRef.current.refresh()
        }
        
        showSuccess('Git project opened successfully!', 'Project Opened')
      }
    } catch (error) {
      console.error('❌ Failed to open git project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to open project folder'
      showError(errorMessage, 'Error')
    }
  }

  const handleNewProjectSuccess = (projectPath: string) => {
    showSuccess('Project created successfully!', 'Project Created')
    
    // Add the project to recent list first
    invoke('add_project_to_recent', { project_path: projectPath })
      .catch(console.error)
      .then(() => {
        // Refresh projects list to show the newly created project
        if (projectsRefreshRef.current?.refresh) {
          projectsRefreshRef.current.refresh()
        }
      })
    
    // Set the newly created project as active
    // Create a temporary project object for immediate display
    const newProject: RecentProject = {
      name: projectPath.split('/').pop() || 'New Project',
      path: projectPath,
      last_accessed: Math.floor(Date.now() / 1000), // Convert to Unix timestamp
      is_git_repo: true, // We know it's a git repo since we created it
      git_branch: 'main', // Default branch name
      git_status: 'clean'
    }
    setCurrentProject(newProject)
    setActiveTab('chat')
  }

  const openProjectPath = React.useCallback(async (
    projectPath: string,
    options?: { refreshProjectsList?: boolean }
  ) => {
    const opened = await invoke<RecentProject>('open_existing_project', { project_path: projectPath, projectPath })
    setCurrentProject(opened)
    setActiveTab('chat')
    if (options?.refreshProjectsList && projectsRefreshRef.current?.refresh) {
      projectsRefreshRef.current.refresh()
    }
    return opened
  }, [])

  const handleProjectSelect = React.useCallback((project: RecentProject) => {
    void openProjectPath(project.path, { refreshProjectsList: false }).catch((error) => {
      console.error('❌ Failed to select project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to switch project'
      showError(errorMessage, 'Project Switch Error')
    })
  }, [openProjectPath, showError])

  const handleProjectBranchSelect = React.useCallback(async (project: RecentProject, branch: string) => {
    try {
      await invoke('switch_project_git_branch', { projectPath: project.path, branch })
      await openProjectPath(project.path, { refreshProjectsList: false })
    } catch (error) {
      console.error('❌ Failed to switch branch:', error)
      const detail = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
      const errorMessage = detail || `Failed to switch to ${branch}`
      showError(errorMessage, 'Branch Switch Error')
    }
  }, [openProjectPath, showError])

  const handleProjectWorktreeSelect = React.useCallback(async (_project: RecentProject, worktree: { path: string }) => {
    try {
      await openProjectPath(worktree.path, { refreshProjectsList: false })
    } catch (error) {
      console.error('❌ Failed to open worktree:', error)
      const detail = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
      const errorMessage = detail || `Failed to open worktree at ${worktree.path}`
      showError(errorMessage, 'Worktree Switch Error')
    }
  }, [openProjectPath, showError])

  const handleProjectBranchCreated = React.useCallback(async (project: RecentProject, branch: string) => {
    // Optimistic update — the backend already switched branches via `git checkout -b`.
    // Just update the current project state; the sidebar's ref-cache refresh handles the tree.
    if (currentProject?.path === project.path) {
      setCurrentProject(prev => prev ? { ...prev, git_branch: branch } : prev)
    }
  }, [currentProject?.path])

  const handleProjectWorktreeCreated = React.useCallback(async (_project: RecentProject, worktreePath: string) => {
    try {
      // Open the worktree path as current project but skip the full project list refresh.
      // The sidebar's ref-cache refresh handles showing the new worktree in the tree.
      await openProjectPath(worktreePath, { refreshProjectsList: false })
    } catch (error) {
      console.error('❌ Failed to open newly created worktree:', error)
      const detail = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
      const errorMessage = detail || `Failed to open new worktree at ${worktreePath}`
      showError(errorMessage, 'Worktree Creation Error')
    }
  }, [openProjectPath, showError])

  useEffect(() => {
    setSelectedAgent(undefined)
  }, [settings.default_cli_agent])

  const handleBackToWelcome = () => {
    setCurrentProject(null)
    setActiveTab('chat') // Reset to chat tab when going back to welcome
  }

  const toggleChat = React.useCallback(() => {
    if (currentProject) {
      setActiveTab(prev => prev === 'chat' ? 'code' : 'chat')
    }
  }, [currentProject])

  const copyProjectPath = async () => {
    if (!currentProject) return
    
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(currentProject.path)
        showSuccess('Project path copied to clipboard', 'Copied')
      } else {
        // Fallback for older browsers or unsecure contexts
        const textArea = document.createElement('textarea')
        textArea.value = currentProject.path
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        showSuccess('Project path copied to clipboard', 'Copied')
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error)
      showSuccess('Failed to copy to clipboard', 'Error')
    }
  }

  // Global listener: catch session completions even when viewing a different project
  useEffect(() => {
    const unlisten = listen<{ session_id: string; content: string; finished: boolean }>('cli-stream', (event) => {
      if (!event.payload.finished) return
      const sid = event.payload.session_id
      for (const [path, sessions] of projectSessionsRef.current) {
        if (sessions.has(sid)) {
          sessions.delete(sid)
          if (sessions.size === 0) {
            projectSessionsRef.current.delete(path)
            setExecutingProjectPaths(prev => {
              const next = new Set(prev)
              next.delete(path)
              return next
            })
          }
          break
        }
      }
    })
    return () => { unlisten.then(fn => fn()) }
  }, [])

  // Compute recent projects limited to 5 and within last 30 days
  const recentProjectsForWelcome = React.useMemo(() => {
    const show = settings?.show_welcome_recent_projects ?? false
    if (!show) return [] as RecentProject[]
    const nowSec = Math.floor(Date.now() / 1000)
    const thirtyDaysSec = 30 * 24 * 60 * 60
    const cutoff = nowSec - thirtyDaysSec
    return (allRecentProjects || [])
      .filter(p => (p.last_accessed ?? 0) >= cutoff)
      .sort((a,b) => (b.last_accessed ?? 0) - (a.last_accessed ?? 0))
      .slice(0, 5)
  }, [allRecentProjects, settings?.show_welcome_recent_projects])

  // Resolve user home directory for path shortening
  useEffect(() => {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke<string>('get_user_home_directory').then(setHomeDir).catch(() => {})
    }).catch(() => {})
  }, [])

  // Suggest creating AGENTS.md when missing
  useEffect(() => {
    const run = async () => {
      if (!currentProject) return
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const base = currentProject.path
        const agents = await invoke<any>('get_file_info', { filePath: `${base}/AGENTS.md` }).catch(() => null)
        const claude = await invoke<any>('get_file_info', { filePath: `${base}/CLAUDE.md` }).catch(() => null)
        const gemini = await invoke<any>('get_file_info', { filePath: `${base}/GEMINI.md` }).catch(() => null)
        const shouldSuggest = settings.suggest_create_agents_md ?? true
        if (!agents && !claude && !gemini && shouldSuggest) {
          showToast({
            title: 'No AGENTS.md found',
            message: 'This project has no AGENTS.md, CLAUDE.md, or GEMINI.md. Want us to craft one tailored to your codebase?',
            type: 'info',
            duration: 0, // persistent — let the user close manually
            actionLabel: 'Generate',
            onAction: () => {
              setActiveTab('chat')
              setPendingChatPrompt(
                `Analyze this project at ${base} and create an AGENTS.md file in the project root. ` +
                `Inspect the directory structure, detect the language(s), framework(s), package manager (package.json, Cargo.toml, pyproject.toml, etc.), ` +
                `test runner, and existing conventions. Then write a comprehensive AGENTS.md that includes:\n\n` +
                `1. Project overview — what the project does, its architecture layers\n` +
                `2. Tech stack — languages, frameworks, build tools, and package manager detected\n` +
                `3. Coding conventions — naming, file organization, import style observed in the codebase\n` +
                `4. Development workflow — how to build, test, and run the project\n` +
                `5. TDD expectations — test-first approach, where tests live, how to run them\n` +
                `6. Git practices — commit style, branch naming, PR expectations\n` +
                `7. Architecture boundaries — which directories hold models, services, commands, etc.\n\n` +
                `Make the file specific to THIS project, not a generic template. Reference actual directories and files you find. Write it to ${base}/AGENTS.md.`
              )
            }
          })
        }
      } catch {}
    }
    run()
  }, [currentProject, settings.suggest_create_agents_md])

  const shortPath = (p: string) => {
    if (!homeDir) return p
    return p.startsWith(homeDir) ? `~${p.slice(homeDir.length)}` : p
  }

  // Listen for global shortcut and menu events
  useEffect(() => {
    const unlistenSettings = listen('shortcut://open-settings', () => {
      setIsSettingsOpen(true)
    })
    const unlistenMenuSettings = listen('menu://open-settings', () => {
      setSettingsInitialTab(undefined)
      setIsSettingsOpen(true)
    })
    const unlistenMenuShortcuts = listen('menu://open-shortcuts', () => {
      setSettingsInitialTab('shortcuts')
      setIsSettingsOpen(true)
    })

    const unlistenChat = listen('shortcut://toggle-chat', () => {
      toggleChat()
    })

    const unlistenCopyPath = listen('shortcut://copy-project-path', () => {
      copyProjectPath()
    })

    // Chat history shortcut is handled by ChatHistoryManager internally

    // Menu event listeners
    const unlistenMenuNewProject = listen<MenuEventPayload<'menu://new-project'>>('menu://new-project', () => {
      setIsProjectChooserOpen(true)
    })

    const unlistenMenuCloneProject = listen<MenuEventPayload<'menu://clone-project'>>('menu://clone-project', () => {
      setIsCloneModalOpen(true)
    })

    const unlistenMenuOpenProject = listen<MenuEventPayload<'menu://open-project'>>('menu://open-project', async (event) => {
      try {
        // Handle opening project from menu
        
        if (event.payload && typeof event.payload === 'string') {
          const projectPath = event.payload
          // Query backend for updated recents and set the first (MRU) as current including git info
          const recents = await invoke<RecentProject[]>('list_recent_projects')
          if (recents && recents.length > 0) {
            setCurrentProject(recents[0])
            setActiveTab('chat') // Start with chat tab
            if (projectsRefreshRef.current?.refresh) {
              projectsRefreshRef.current.refresh()
            }
          }
          
          showSuccess('Git project opened successfully!', 'Project Opened')
        } else {
          // Just refresh if no path (user cancelled)
          projectsRefreshRef.current?.refresh()
        }
      } catch (error) {
        console.error('❌ Failed to handle menu project opening:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to open project from menu'
        showError(errorMessage, 'Menu Error')
      }
    })

    const unlistenMenuCloseProject = listen<MenuEventPayload<'menu://close-project'>>('menu://close-project', () => {
      setCurrentProject(null)
    })

    const unlistenMenuDeleteProject = listen<MenuEventPayload<'menu://delete-project'>>('menu://delete-project', () => {
      if (currentProject) {
        // TODO: Implement delete project confirmation dialog
      }
    })
    const unlistenMenuAbout = listen('menu://open-about', () => {
      setIsAboutOpen(true)
    })

    // Tray icon event listeners
    const unlistenTraySettings = listen('tray://open-settings', () => {
      setSettingsInitialTab(undefined)
      setIsSettingsOpen(true)
    })
    const unlistenTrayUpdates = listen('tray://check-updates', () => {
      showToast({ title: 'Check for Updates', message: 'You are running the latest version.', type: 'info' })
    })

    // Check for CLI project path on startup
    const checkCliProject = async () => {
      try {
        const cliPath = await invoke<string | null>('get_cli_project_path')
        if (cliPath) {
          
          // Open the project via backend to get full project info
          const opened = await invoke<RecentProject>('open_existing_project', { 
            project_path: cliPath, 
            projectPath: cliPath 
          })
          
          setCurrentProject(opened)
          setActiveTab('chat') // Start with chat tab
          
          // Refresh projects list
          if (projectsRefreshRef.current?.refresh) {
            projectsRefreshRef.current.refresh()
          }
          
          // Clear the CLI path so it doesn't reload on refresh
          await invoke('clear_cli_project_path')
          
          showSuccess('Project opened from CLI!', 'Commander CLI')
        }
      } catch (error) {
        console.error('❌ Failed to process CLI project:', error)
        const errorMessage = error instanceof Error ? error.message : 'Failed to open project from CLI'
        showError(errorMessage, 'CLI Error')
      }
    }

    // Check for CLI project on startup
    checkCliProject()

    return () => {
      unlistenSettings.then(fn => fn())
      unlistenChat.then(fn => fn())
      unlistenCopyPath.then(fn => fn())
      unlistenMenuSettings.then(fn => fn())
      unlistenMenuShortcuts.then(fn => fn())
      unlistenMenuNewProject.then(fn => fn())
      unlistenMenuCloneProject.then(fn => fn())
      unlistenMenuOpenProject.then(fn => fn())
      unlistenMenuCloseProject.then(fn => fn())
      unlistenMenuDeleteProject.then(fn => fn())
      unlistenMenuAbout.then(fn => fn())
      unlistenTraySettings.then(fn => fn())
      unlistenTrayUpdates.then(fn => fn())
    }
  }, [activeTab, currentProject, toggleChat])

  // Auto-sync docs on launch if enabled
  useEffect(() => {
    if (settings.docs_auto_sync) {
      invoke('sync_autohand_docs').catch(() => {})
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize a phrase on first load
  useEffect(() => {
    if (!welcomePhrase) setWelcomePhrase(pickRandomPhrase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Change phrase whenever we land on the welcome screen
  useEffect(() => {
    if (!currentProject) {
      setWelcomePhrase(prev => pickRandomPhrase(prev))
    }
  }, [currentProject])

  // Show onboarding modal when settings load and user hasn't completed it, or when forced on start
  useEffect(() => {
    if (!isLoading && (settings.has_completed_onboarding === false || settings.show_onboarding_on_start === true)) {
      setIsOnboardingOpen(true)
    }
  }, [isLoading, settings.has_completed_onboarding, settings.show_onboarding_on_start])

  return (
    <SidebarWidthProvider>
      <SidebarProvider>
        <SidebarAutoCollapseManager
          activeTab={activeTab}
          enabled={Boolean(settings.code_settings?.auto_collapse_sidebar)}
          projectActive={Boolean(currentProject)}
          chatHistoryOpen={chatSidebarOpen}
        />
        <AppSidebar
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          onRefreshProjects={projectsRefreshRef}
          onProjectSelect={handleProjectSelect}
          currentProject={currentProject}
          onHomeClick={handleBackToWelcome}
          onAddProjectClick={() => setIsProjectChooserOpen(true)}
          onProjectDeleted={handleProjectDeleted}
          executingProjectPaths={executingProjectPaths}
          onProjectBranchSelect={handleProjectBranchSelect}
          onProjectWorktreeSelect={handleProjectWorktreeSelect}
          onProjectBranchCreated={handleProjectBranchCreated}
          onProjectWorktreeCreated={handleProjectWorktreeCreated}
          onDocSelect={(slug) => setActiveDocSlug(slug)}
        />
        <SidebarInset className="flex flex-col h-screen">
        {/* Title bar drag area — just enough for macOS traffic-light clearance */}
        <div
          className="h-2 w-full drag-area"
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        ></div>

        <header
          className="flex min-h-10 min-w-0 shrink-0 items-center overflow-hidden border-b w-full drag-fallback"
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        >
          <div className="flex min-w-0 items-center gap-3 px-3 py-1.5 w-full overflow-hidden">
            <SidebarTrigger className="no-drag" />
            <Separator orientation="vertical" className="h-6" />
            {currentProject ? (
              <ProjectIdentityHeader
                project={currentProject}
                homeDir={homeDir}
                onCopyPath={copyProjectPath}
                activeTab={activeTab}
                onTabChange={setActiveTab}
              />
            ) : (
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">Welcome</p>
                <p className="text-xs text-muted-foreground">Open a project to start working.</p>
              </div>
            )}
          </div>
        </header>
        <div className="flex-1 flex flex-col min-h-0">
          {activeDocSlug ? (
            <DocsViewer slug={activeDocSlug} onBack={() => setActiveDocSlug(null)} />
          ) : currentProject ? (
            <ProjectView
              key={projectContextKey ?? undefined}
              project={currentProject}
              selectedAgent={selectedAgent}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onExecutingChange={handleExecutingChange}
              pendingChatPrompt={pendingChatPrompt}
              onPendingChatPromptConsumed={() => setPendingChatPrompt(null)}
              loadedSession={loadedSession}
              onLoadedSessionConsumed={() => setLoadedSession(null)}
            />
          ) : (
            <ScrollArea className="flex-1">
            <div className="flex flex-col items-center p-4 pb-10">
            <div className="max-w-5xl w-full space-y-6">
              <div className="text-center space-y-2 pt-4">
                <h1 className="text-4xl font-bold tracking-tight">Welcome to Commander</h1>
                <p className="text-lg text-muted-foreground">
                  {welcomePhrase || 'Command any AI coding CLI agent from one screen'}
                </p>
              </div>

              <DashboardView
                timeSavedMultiplier={settings?.time_saved_multiplier ?? 5}
                days={dashboardDays}
                onDaysChange={setDashboardDays}
              />

              {(settings?.show_welcome_recent_projects ?? false) && (
                <div className="pt-2" data-testid="welcome-recents">
                  <h3 className="text-xs font-medium text-muted-foreground mb-2" data-testid="welcome-recents-title">Recent</h3>
                  {recentProjectsForWelcome.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No projects opened in the last 30 days</p>
                  ) : (
                    <ul className="space-y-1">
                      {recentProjectsForWelcome.map((proj) => (
                        <li key={proj.path}>
                          <button
                            className="w-full flex items-center justify-between gap-4 px-2 py-1.5 rounded-md hover:bg-neutral-900/60 transition-colors"
                            onClick={() => handleProjectSelect(proj)}
                            title={proj.path}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Folder className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm font-medium truncate">{proj.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground truncate max-w-[50%] text-right">{shortPath(proj.path)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            </div>
            </ScrollArea>
          )}
        </div>
        {currentProject && (
          <ChatHistoryManager
            projectPath={currentProject.path}
            onLoadSession={(messages, sessionId) => {
              setLoadedSession({ messages, sessionId })
              setActiveTab('chat')
            }}
            onNewChat={() => {
              setLoadedSession(null)
            }}
            onSidebarOverride={setChatSidebarOpen}
          />
        )}
      </SidebarInset>
      
      {isSettingsOpen && (
        <SettingsModal
          isOpen={true}
          onClose={() => setIsSettingsOpen(false)}
          initialTab={settingsInitialTab}
          workingDir={currentProject?.path ?? null}
        />
      )}
      
      <ProjectChooserModal
        isOpen={isProjectChooserOpen}
        onClose={() => setIsProjectChooserOpen(false)}
        onNewProject={() => setIsNewProjectModalOpen(true)}
        onOpenProject={handleOpenProject}
        onCloneProject={() => setIsCloneModalOpen(true)}
      />

      <CloneRepositoryModal
        isOpen={isCloneModalOpen}
        onClose={() => setIsCloneModalOpen(false)}
        onSuccess={handleCloneSuccess}
      />
      
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onSuccess={handleNewProjectSuccess}
      />
      
      <AboutDialog isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      <OnboardingModal
        isOpen={isOnboardingOpen}
        onComplete={() => setIsOnboardingOpen(false)}
      />
      
      <AIAgentStatusBar onChatToggle={toggleChat} showChatButton={!!currentProject} />
      </SidebarProvider>
    </SidebarWidthProvider>
  )
}

function AuthGate() {
  const { status } = useAuth()

  if (status !== 'authenticated') {
    return <LoginScreen />
  }

  return <AppContent />
}

function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SettingsProvider>
          <AuthGate />
        </SettingsProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

export default App
