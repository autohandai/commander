import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { SidebarWidthProvider } from "@/contexts/sidebar-width-context"
import { Separator } from "@/components/ui/separator"
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb"
import { 
  GitBranch,
  Plus,
  Copy,
  Bot
} from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import React, { useState, useEffect, useRef } from "react"
import { SettingsModal } from "@/components/SettingsModal"
import { CloneRepositoryModal } from "@/components/CloneRepositoryModal"
import { NewProjectModal } from "@/components/NewProjectModal"
import { ToastProvider, useToast } from "@/components/ToastProvider"
import { AIAgentStatusBar } from "@/components/AIAgentStatusBar"
import { ChatInterface } from "@/components/ChatInterface"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RecentProject } from "@/hooks/use-recent-projects"

interface ProjectViewProps {
  project: RecentProject
  selectedAgent: string
  onAgentChange: (agent: string) => void
}

function ProjectView({ project, selectedAgent, onAgentChange }: ProjectViewProps) {
  return (
    <div className="flex-1 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-muted-foreground mt-2">{project.path}</p>
          </div>
          
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedAgent} onValueChange={onAgentChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select AI Agent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Claude Code CLI">Claude Code CLI</SelectItem>
                <SelectItem value="Codex">Codex</SelectItem>
                <SelectItem value="Gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">Project Type</h3>
            <div className="flex items-center gap-2">
              {project.is_git_repo ? (
                <>
                  <GitBranch className="h-4 w-4" />
                  <span>Git Repository</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Regular Folder</span>
                </>
              )}
            </div>
          </div>

          {project.git_branch && (
            <div className="p-4 rounded-lg border bg-card">
              <h3 className="font-semibold mb-2">Current Branch</h3>
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                <span>{project.git_branch}</span>
                {project.git_status === 'dirty' && (
                  <span className="text-orange-500 text-xs">• Modified</span>
                )}
              </div>
            </div>
          )}

          <div className="p-4 rounded-lg border bg-card">
            <h3 className="font-semibold mb-2">Last Accessed</h3>
            <p className="text-sm text-muted-foreground">
              {new Date(project.last_accessed * 1000).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="p-4 rounded-lg border bg-card">
          <h3 className="font-semibold mb-4">Project Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline">
              Open in File Manager
            </Button>
            <Button variant="outline">
              Open in Terminal
            </Button>
            {project.is_git_repo && (
              <>
                <Button variant="outline">
                  Git Status
                </Button>
                <Button variant="outline">
                  View Commits
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AppContent() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false)
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false)
  const [currentProject, setCurrentProject] = useState<RecentProject | null>(null)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState<string>('Claude Code CLI')
  const { showSuccess } = useToast()
  const projectsRefreshRef = useRef<{ refresh: () => void } | null>(null)

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

  const handleNewProjectSuccess = (projectPath: string) => {
    showSuccess('Project created successfully!', 'Project Created')
    // Refresh projects list to show the newly created project
    if (projectsRefreshRef.current?.refresh) {
      projectsRefreshRef.current.refresh()
    }
    
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
  }

  const handleProjectSelect = (project: RecentProject) => {
    setCurrentProject(project)
    setIsChatOpen(true) // Auto-open chat when project is selected
    // Add project to recent list
    invoke('add_project_to_recent', { project_path: project.path }).catch(console.error)
  }

  const handleBackToWelcome = () => {
    setCurrentProject(null)
    setIsChatOpen(false) // Close chat when going back to welcome
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

  // Listen for global shortcut events
  useEffect(() => {
    const unlisten = listen('shortcut://open-settings', () => {
      setIsSettingsOpen(true)
    })

    return () => {
      unlisten.then(fn => fn())
    }
  }, [])

  return (
    <SidebarWidthProvider>
      <SidebarProvider>
        <AppSidebar 
          isSettingsOpen={isSettingsOpen} 
          setIsSettingsOpen={setIsSettingsOpen}
          onRefreshProjects={projectsRefreshRef}
          onProjectSelect={handleProjectSelect}
          currentProject={currentProject}
          onHomeClick={handleBackToWelcome}
        />
        <SidebarInset>
        {/* Title bar drag area */}
        <div 
          className="h-10 w-full drag-area" 
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        ></div>
        
        <header 
          className="flex h-12 shrink-0 items-center gap-2 border-b w-full drag-fallback" 
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        >
          <div className="flex items-center gap-2 px-3 w-full">
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
{currentProject ? (
          <ProjectView 
            project={currentProject} 
            selectedAgent={selectedAgent}
            onAgentChange={setSelectedAgent}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-4 pb-10">
            <div className="max-w-2xl w-full space-y-8">
              <div className="text-center space-y-2">
                <h1 className="text-4xl font-bold tracking-tight">Welcome to Commander</h1>
                <p className="text-lg text-muted-foreground">
                  Start a new project or clone an existing repository
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button 
                  onClick={() => setIsCloneModalOpen(true)}
                  className="group relative flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900 transition-all duration-200 min-w-[200px]"
                >
                  <div className="p-3 rounded-lg bg-neutral-800 group-hover:bg-neutral-700 transition-colors">
                    <GitBranch className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">Clone Repository</p>
                    <p className="text-xs text-muted-foreground">Clone from GitHub, GitLab, etc.</p>
                  </div>
                </button>
                
                <button 
                  onClick={() => setIsNewProjectModalOpen(true)}
                  className="group relative flex flex-col items-center gap-3 px-8 py-6 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 hover:border-neutral-600 hover:bg-neutral-900 transition-all duration-200 min-w-[200px]"
                >
                  <div className="p-3 rounded-lg bg-neutral-800 group-hover:bg-neutral-700 transition-colors">
                    <Plus className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">New Project</p>
                    <p className="text-xs text-muted-foreground">Start from scratch</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </SidebarInset>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
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
      
      <AIAgentStatusBar />
      
      {/* Chat Interface - only show when a project is selected */}
      {currentProject && (
        <ChatInterface
          isOpen={isChatOpen}
          onToggle={() => setIsChatOpen(!isChatOpen)}
          selectedAgent={selectedAgent}
        />
      )}
      </SidebarProvider>
    </SidebarWidthProvider>
  )
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

export default App