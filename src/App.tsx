import { AppSidebar } from "@/components/app-sidebar"
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { 
  Breadcrumb, 
  BreadcrumbItem, 
  BreadcrumbLink, 
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator 
} from "@/components/ui/breadcrumb"
import { 
  Home, 
  FolderOpen, 
  FileText, 
  Star, 
  Clock, 
  HardDrive,
  Cloud,
  Tags,
  Settings
} from "lucide-react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useState, useEffect } from "react"
import { SettingsModal } from "@/components/SettingsModal"

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

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
    <SidebarProvider>
      <AppSidebar 
        isSettingsOpen={isSettingsOpen} 
        setIsSettingsOpen={setIsSettingsOpen} 
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
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#" className="no-drag">
                    Documents
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Projects</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="flex-1" data-tauri-drag-region></div>
          </div>
        </header>
        <div className="flex-1 p-4">
          <div className="grid gap-4">
            <div className="rounded-lg border p-4">
              <h2 className="text-lg font-semibold mb-2">Welcome to Commander</h2>
              <p className="text-sm text-muted-foreground">
                You're in control of any AI code agents installed in your machine.
              </p>
            </div>
            
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">Quick Access</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent">
                  <FolderOpen className="h-8 w-8" />
                  <span className="text-xs">Documents</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent">
                  <FileText className="h-8 w-8" />
                  <span className="text-xs">Recent</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent">
                  <Star className="h-8 w-8" />
                  <span className="text-xs">Favorites</span>
                </button>
                <button className="flex flex-col items-center gap-2 p-4 rounded-lg border hover:bg-accent">
                  <Cloud className="h-8 w-8" />
                  <span className="text-xs">Cloud</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
      
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
    </SidebarProvider>
  )
}

export default App