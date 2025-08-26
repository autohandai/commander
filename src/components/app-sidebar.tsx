import * as React from "react"
import { Clock } from "lucide-react"

import { SearchForm } from "@/components/search-form"
import { NavUser } from "@/components/NavUser"
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

// Mock recent projects data
const recentProjects = [
  {
    title: "Project Alpha",
    url: "#",
  },
  {
    title: "Web Dashboard",
    url: "#",
  },
  {
    title: "Mobile App",
    url: "#",
  },
  {
    title: "API Gateway",
    url: "#",
  },
  {
    title: "Data Pipeline",
    url: "#",
  },
]

// Mock user data
const userData = {
  name: "John Doe",
  email: "john@example.com",
  avatar: "/avatars/john-doe.jpg",
}

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  isSettingsOpen?: boolean
  setIsSettingsOpen?: (open: boolean) => void
}

export function AppSidebar({ isSettingsOpen, setIsSettingsOpen, ...props }: AppSidebarProps) {
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
    <Sidebar variant="sidebar" className="flex flex-col" {...props}>
      {/* Sidebar title bar drag area - matching the main content */}
      <div 
        className="h-10 w-full drag-area" 
        data-tauri-drag-region
        onMouseDown={handleDragStart}
      ></div>
      
      <SidebarHeader className="px-4">
        <SearchForm />
      </SidebarHeader>
      
      <SidebarContent className="flex-1">
        <SidebarGroup>
          <SidebarGroupLabel>Recent Projects</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentProjects.map((project) => (
                <SidebarMenuItem key={project.title}>
                  <SidebarMenuButton asChild>
                    <a href={project.url}>
                      <Clock className="size-4" />
                      <span>{project.title}</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter>
        <NavUser 
          user={userData} 
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
        />
      </SidebarFooter>
      
      <SidebarRail />
    </Sidebar>
  )
}