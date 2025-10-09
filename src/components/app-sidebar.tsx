import * as React from "react"
import { Clock, GitBranch, Folder, FolderGit, Home } from "lucide-react"

import { SearchForm } from "@/components/search-form"
import { NavUser } from "@/components/NavUser"
import { useRecentProjects, RecentProject } from "@/hooks/use-recent-projects"
import { ResizableSidebar } from "@/components/resizable-sidebar"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

// Mock user data
const userData = {
  name: "Igor Costa",
  email: "igor@autohand.ai",
  // Use canonical GitHub avatar endpoint (handles redirects and size)
  avatar: "https://github.com/igorcosta.png?size=128",
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  isSettingsOpen?: boolean
  setIsSettingsOpen?: (open: boolean) => void
  onRefreshProjects?: React.MutableRefObject<{ refresh: () => void } | null>
  onProjectSelect?: (project: RecentProject) => void
  currentProject?: RecentProject | null
  onHomeClick?: () => void
}

export function AppSidebar({ isSettingsOpen, setIsSettingsOpen, onRefreshProjects, onProjectSelect, currentProject, onHomeClick, ...props }: AppSidebarProps) {
  const { projects, loading, error, refreshProjects } = useRecentProjects()

  // Expose refresh function to parent component via ref
  React.useEffect(() => {
    if (onRefreshProjects) {
      onRefreshProjects.current = { refresh: refreshProjects }
    }
    // Cleanup function to avoid stale references
    return () => {
      if (onRefreshProjects) {
        onRefreshProjects.current = null
      }
    }
  }, [refreshProjects, onRefreshProjects])

  const handleDragStart = async (e: React.MouseEvent) => {
    // Only trigger drag if not clicking on interactive elements
    if ((e.target as HTMLElement).closest('.no-drag')) {
      return;
    }
    
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke('start_drag');
    } catch (error) {
      console.warn('Failed to start window drag:', error);
    }
  };

  return (
    <ResizableSidebar>
      <Sidebar variant="sidebar" className="flex flex-col" data-testid="app-sidebar" {...props}>
        {/* Sidebar title bar drag area - matching the main content */}
        <div 
          className="h-7 w-full drag-area" 
          data-tauri-drag-region
          onMouseDown={handleDragStart}
        ></div>
        
        <SidebarHeader className="px-4">
          <SearchForm />
        </SidebarHeader>
        
        <SidebarContent className="flex-1">
          <SidebarGroup>
            <SidebarMenu className="mb-4">
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      if (onHomeClick) {
                        onHomeClick()
                      }
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
                      <Clock className="size-4 text-red-500" />
                      <span className="text-red-500 text-sm">Failed to load projects</span>
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
                  projects.map((project) => (
                    <SidebarMenuItem key={project.path}>
                      <SidebarMenuButton asChild>
                        <a 
                          href="#" 
                          onClick={(e) => {
                            e.preventDefault()
                            if (onProjectSelect) {
                              onProjectSelect(project)
                            }
                          }}
                          title={`${project.path}${project.git_branch ? ` (${project.git_branch})` : ''}`}
                          className={`relative ${currentProject?.path === project.path ? 'bg-primary text-primary-foreground font-medium' : ''}`}
                        >
                          {/* Active project indicator */}
                          {currentProject?.path === project.path && (
                            <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-6 bg-primary-foreground rounded-r-full"></div>
                          )}
                          {project.is_git_repo ? (
                            <FolderGit className="size-4" />
                          ) : (
                            <Folder className="size-4" />
                          )}
                          <div className="flex flex-col items-start">
                            <span className="text-sm">{project.name}</span>
                            {project.git_branch && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <GitBranch className="size-3" />
                                <span>{project.git_branch}</span>
                                {project.git_status === 'dirty' && (
                                  <span className="text-orange-500">•</span>
                                )}
                              </div>
                            )}
                          </div>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        
        <SidebarFooter>
          <NavUser 
            user={userData} 
            setIsSettingsOpen={setIsSettingsOpen}
          />
        </SidebarFooter>
        
        <SidebarRail />
      </Sidebar>
    </ResizableSidebar>
  )
}
