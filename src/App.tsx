import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger, SidebarInset, useSidebar } from "@/components/ui/sidebar"
import { SidebarWidthProvider } from "@/contexts/sidebar-width-context"
import { Separator } from "@/components/ui/separator"
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { GitBranch, Plus, Copy, Code, MessageCircle, FolderOpen, Folder, History as HistoryIcon } from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import React, { useState, useEffect, useRef } from "react"
import { SettingsModal } from "@/components/SettingsModal"
import { CloneRepositoryModal } from "@/components/CloneRepositoryModal"
import { NewProjectModal } from "@/components/NewProjectModal"
import { AboutDialog } from "@/components/AboutDialog"
import { ToastProvider, useToast } from "@/components/ToastProvider"
import { SettingsProvider } from "@/contexts/settings-context"
import { AIAgentStatusBar } from "@/components/AIAgentStatusBar"
import { ChatInterface } from "@/components/ChatInterface"
import { CodeView } from "@/components/CodeView"
import { HistoryView } from "@/components/HistoryView"
import { Button } from "@/components/ui/button"
import { useRecentProjects, RecentProject } from "@/hooks/use-recent-projects"
import { useSettings } from "@/contexts/settings-context"
import type { MenuEventPayload } from "@/types/menu"


interface ProjectViewProps {
  project: RecentProject
  selectedAgent?: string
  onAgentChange: (agent: string | undefined) => void
  activeTab: string
  onTabChange: (tab: string) => void
}

function ProjectView({ project, selectedAgent, activeTab, onTabChange }: ProjectViewProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0 min-w-0">
        <div className="px-4 pt-4">
          <TabsList className="grid max-w-[600px] mx-auto grid-cols-3">
            <TabsTrigger value="chat" className="flex items-center justify-center gap-2">
              <MessageCircle className="h-4 w-4" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="code" className="flex items-center justify-center gap-2">
              <Code className="h-4 w-4" />
              Code
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center justify-center gap-2">
              <HistoryIcon className="h-4 w-4" />
              History
            </TabsTrigger>
          </TabsList>
        </div>
        
        <TabsContent value="chat" className="flex-1 m-0 min-h-0 min-w-0" forceMount>
          <ChatInterface
            isOpen={true}
            onToggle={() => {}} // Not needed in tab mode
            selectedAgent={selectedAgent}
            project={project}
          />
        </TabsContent>
        
        <TabsContent value="code" className="flex-1 m-0 min-h-0 min-w-0" forceMount>
          <CodeView project={project} />
        </TabsContent>
        
        <TabsContent value="history" className="flex-1 m-0 h-full min-w-0" forceMount>
          <HistoryView project={project} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SidebarAutoCollapseManager({ activeTab, enabled, projectActive }: { activeTab: string; enabled: boolean; projectActive: boolean }) {
  const { setOpen } = useSidebar()

  useEffect(() => {
    setOpen((currentOpen) => {
      if (!enabled || !projectActive) {
        return true
      }
      if (activeTab === 'code') {
        return false
      }
      return true
    })
  }, [activeTab, enabled, projectActive, setOpen])

  return null
}

function AppContent() {
  const { settings } = useSettings()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<import('@/types/settings').SettingsTab | undefined>(undefined)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [currentProject, setCurrentProject] = useState<RecentProject | null>(null)
  const [activeTab, setActiveTab] = useState<string>('chat')
  const [selectedAgent, setSelectedAgent] = useState<string | undefined>(undefined)
  const [welcomePhrase, setWelcomePhrase] = useState<string>("")
  const { showSuccess, showError } = useToast()
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
      console.log('Drag prevented - clicked on no-drag element');
      return;
    }
    
    console.log('Attempting to start drag...');
    try {
      await invoke('start_drag');
      console.log('Drag started successfully');
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
      console.log('📂 Opening git project selection dialog...')
      const selectedPath = await invoke('select_git_project_folder') as string | null
      
      if (selectedPath) {
        console.log('📁 Git project selected:', selectedPath)
        
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

  const handleProjectSelect = (project: RecentProject) => {
    setActiveTab('chat') // Default to chat tab when project is selected
    // Ensure backend marks it active and updates recents and use returned project info
    invoke<RecentProject>('open_existing_project', { project_path: project.path, projectPath: project.path })
      .then(setCurrentProject)
      .catch(console.error)
  }

  useEffect(() => {
    setSelectedAgent(undefined)
  }, [settings.default_cli_agent])

  const handleBackToWelcome = () => {
    setCurrentProject(null)
    setActiveTab('chat') // Reset to chat tab when going back to welcome
  }

  const toggleChat = () => {
    if (currentProject) {
      setActiveTab(activeTab === 'chat' ? 'code' : 'chat')
    }
  }

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

  // Generate breadcrumb segments from project path
  const getBreadcrumbSegments = (path: string) => {
    const segments = path.split('/').filter(Boolean)
    return segments.map((segment, index) => ({
      name: segment,
      path: '/' + segments.slice(0, index + 1).join('/')
    }))
  }

  // Compute recent projects limited to 5 and within last 30 days
  const recentProjectsForWelcome = React.useMemo(() => {
    const show = settings?.show_welcome_recent_projects ?? true
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

  const shortPath = (p: string) => {
    if (!homeDir) return p
    return p.startsWith(homeDir) ? `~${p.slice(homeDir.length)}` : p
  }

  // Listen for global shortcut and menu events
  useEffect(() => {
    console.log('🚀 Frontend initializing event listeners...')
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

    // Menu event listeners
    const unlistenMenuNewProject = listen<MenuEventPayload<'menu://new-project'>>('menu://new-project', () => {
      setIsNewProjectModalOpen(true)
    })

    const unlistenMenuCloneProject = listen<MenuEventPayload<'menu://clone-project'>>('menu://clone-project', () => {
      setIsCloneModalOpen(true)
    })

    const unlistenMenuOpenProject = listen<MenuEventPayload<'menu://open-project'>>('menu://open-project', async (event) => {
      try {
        // Handle opening project from menu
        console.log('Opening project from menu:', event.payload)
        
        if (event.payload && typeof event.payload === 'string') {
          const projectPath = event.payload
          console.log('📁 Project opened via menu:', projectPath)
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
        console.log('Delete project requested:', currentProject.name)
      }
    })
    const unlistenMenuAbout = listen('menu://open-about', () => {
      setIsAboutOpen(true)
    })

    // Check for CLI project path on startup
    const checkCliProject = async () => {
      try {
        const cliPath = await invoke<string | null>('get_cli_project_path')
        if (cliPath) {
          console.log('📂 CLI project found:', cliPath)
          
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

    // Dummy event listener for cleanup (not used anymore)  
    const unlistenOpenProject = Promise.resolve(() => {})
    
    // Check for CLI project on startup
    checkCliProject()

    return () => {
      unlistenSettings.then(fn => fn())
      unlistenChat.then(fn => fn())
      unlistenMenuSettings.then(fn => fn())
      unlistenMenuShortcuts.then(fn => fn())
      unlistenMenuNewProject.then(fn => fn())
      unlistenMenuCloneProject.then(fn => fn())
      unlistenMenuOpenProject.then(fn => fn())
      unlistenMenuCloseProject.then(fn => fn())
      unlistenMenuDeleteProject.then(fn => fn())
      unlistenMenuAbout.then(fn => fn())
      unlistenOpenProject.then(fn => fn())
    }
  }, [activeTab, currentProject, toggleChat])

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

  return (
    <SidebarWidthProvider>
      <SidebarProvider>
        <SidebarAutoCollapseManager
          activeTab={activeTab}
          enabled={Boolean(settings.code_settings?.auto_collapse_sidebar)}
          projectActive={Boolean(currentProject)}
        />
        <AppSidebar 
          isSettingsOpen={isSettingsOpen} 
          setIsSettingsOpen={setIsSettingsOpen}
          onRefreshProjects={projectsRefreshRef}
          onProjectSelect={handleProjectSelect}
          currentProject={currentProject}
          onHomeClick={handleBackToWelcome}
        />
        <SidebarInset className="flex flex-col h-screen">
        {/* Title bar drag area */}
        <div 
          className="h-6 w-full drag-area" 
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        ></div>
        
        <header 
          className="flex h-10 shrink-0 items-center gap-2 border-b w-full drag-fallback" 
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2 px-2 w-full">
            <SidebarTrigger className="no-drag" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {currentProject ? (
                  <>
                    {getBreadcrumbSegments(currentProject.path).map((segment, index, array) => (
                      <React.Fragment key={segment.path}>
                        <BreadcrumbItem>
                          {index === array.length - 1 ? (
                            <BreadcrumbPage>{segment.name}</BreadcrumbPage>
                          ) : (
                            <span className="text-muted-foreground">{segment.name}</span>
                          )}
                        </BreadcrumbItem>
                        {index < array.length - 1 && <BreadcrumbSeparator />}
                      </React.Fragment>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={copyProjectPath}
                      className="h-6 w-6 p-0 ml-2 no-drag"
                      title="Copy project path"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <BreadcrumbItem>
                    <BreadcrumbPage>Welcome</BreadcrumbPage>
                  </BreadcrumbItem>
                )}
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex-1" data-tauri-drag-region></div>
          </div>
        </header>
        <div className="flex-1 flex flex-col min-h-0">
          {currentProject ? (
            <ProjectView 
              project={currentProject} 
              selectedAgent={selectedAgent}
              onAgentChange={setSelectedAgent}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-4 pb-10">
            <div className="max-w-2xl w-full space-y-8">
              <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold tracking-tight">Welcome to Commander</h1>
                <p className="text-lg text-muted-foreground">
                  {welcomePhrase || 'Command any AI coding CLI agent from one screen'}
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">

                <button 
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="group relative flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900 transition-all duration-200 min-w-[200px]"
                >
                  <div className="p-3 rounded-lg bg-neutral-800 group-hover:bg-neutral-700 transition-colors">
                    <Plus className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">New Project</p>
                    <p className="text-xs text-muted-foreground">Start from scratch a local git repo</p>
                  </div>
                </button>

                

                <button 
                  onClick={handleOpenProject}
                  className="group relative flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900 transition-all duration-200 min-w-[200px]"
                >
                  <div className="p-3 rounded-lg bg-neutral-800 group-hover:bg-neutral-700 transition-colors">
                    <FolderOpen className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">Open Project</p>
                    <p className="text-xs text-muted-foreground">Open existing git repository</p>
                  </div>
                </button>

                <button 
                  onClick={() => setIsCloneModalOpen(true)}
                  className="group relative flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900 transition-all duration-200 min-w-[200px]"
                >
                  <div className="p-3 rounded-lg bg-neutral-800 group-hover:bg-neutral-700 transition-colors">
                    <GitBranch className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">Clone</p>
                    <p className="text-xs text-muted-foreground">Clone from GitHub, GitLab, Bitbucket, etc.</p>
                  </div>
                </button>
              </div>

              {(settings?.show_welcome_recent_projects ?? true) && (
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
          )}
        </div>
      </SidebarInset>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsInitialTab}
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
      
      <AIAgentStatusBar onChatToggle={toggleChat} showChatButton={!!currentProject} />
      </SidebarProvider>
    </SidebarWidthProvider>
  )
}

function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AppContent />
      </SettingsProvider>
    </ToastProvider>
  )
}

export default App
