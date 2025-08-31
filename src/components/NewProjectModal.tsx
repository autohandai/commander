import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { invoke } from '@tauri-apps/api/core';
import { useToast } from '@/components/ToastProvider';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectPath: string) => void;
}

export function NewProjectModal({ isOpen, onClose, onSuccess }: NewProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [defaultProjectsFolder, setDefaultProjectsFolder] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [nameConflict, setNameConflict] = useState(false);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const { showError, showSuccess } = useToast();

  // Load default projects folder on mount
  useEffect(() => {
    const loadProjectsFolder = async () => {
      try {
        // First try to load saved projects folder
        const savedFolder = await invoke<string | null>('load_projects_folder');
        
        let folder: string;
        if (savedFolder) {
          folder = savedFolder;
        } else {
          // Fall back to default projects folder
          folder = await invoke<string>('get_default_projects_folder');
        }
        
        setDefaultProjectsFolder(folder);
      } catch (error) {
        console.error('Failed to load projects folder:', error);
      }
    }
    
    if (isOpen) {
      loadProjectsFolder();
    }
  }, [isOpen]);

  // Check for name conflicts when project name changes
  useEffect(() => {
    const checkConflict = async () => {
      if (!projectName.trim() || !defaultProjectsFolder) {
        setNameConflict(false);
        return;
      }

      setCheckingConflict(true);
      try {
        const conflict = await invoke<boolean>('check_project_name_conflict', {
          projectsFolder: defaultProjectsFolder,
          projectName: projectName.trim()
        });
        setNameConflict(conflict);
      } catch (error) {
        console.error('Failed to check name conflict:', error);
        setNameConflict(false);
      } finally {
        setCheckingConflict(false);
      }
    };

    const timeoutId = setTimeout(checkConflict, 300); // Debounce
    return () => clearTimeout(timeoutId);
  }, [projectName, defaultProjectsFolder]);

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      showError('Please enter a project name');
      return;
    }

    if (nameConflict) {
      showError('A project with this name already exists');
      return;
    }

    setIsCreating(true);
    try {
      const projectPath = await invoke<string>('create_new_project_with_git', {
        projectsFolder: defaultProjectsFolder,
        projectName: projectName.trim()
      });
      
      showSuccess('Project created successfully with git repository and README!', 'Project Created');
      onSuccess(projectPath);
      onClose();
      resetForm();
    } catch (error: any) {
      showError(error.toString() || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  // Cmd+Enter shortcut to create
  const handleKeyDown: React.KeyboardEventHandler = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      // Allow Ctrl+Enter on non-mac keyboards as well
      e.preventDefault()
      if (!isCreating && projectName.trim() && !nameConflict) {
        handleCreateProject()
      }
    }
  }

  const resetForm = () => {
    setProjectName('');
    setNameConflict(false);
  };

  const handleClose = () => {
    if (!isCreating) {
      resetForm();
      onClose();
    }
  };

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px] max-h-[600px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Create a new project folder with git repository and README
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name *</Label>
            <Input
              id="project-name"
              placeholder="my-awesome-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isCreating}
              className={nameConflict ? 'border-destructive' : ''}
            />
            {nameConflict && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4" />
                A project with this name already exists
              </div>
            )}
            {checkingConflict && (
              <p className="text-xs text-muted-foreground">Checking availability...</p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label>Project Location</Label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm text-muted-foreground font-mono">
              {defaultProjectsFolder ? `${defaultProjectsFolder}/${projectName.trim() || 'project-name'}` : 'Loading...'}
            </div>
            <p className="text-xs text-muted-foreground">
              Project will be created in your default projects folder
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button 
              onClick={handleCreateProject} 
              disabled={isCreating || !projectName.trim() || nameConflict}
            >
              {isCreating ? 'Creating...' : 'Create Project'}
            </Button>
            <span className="hidden sm:flex items-center text-[10px] leading-none text-muted-foreground gap-1 opacity-70">
              <span>Shortcut</span>
              <span>•</span>
              <kbd className="px-1 py-0 rounded border bg-muted">{isMac ? 'Cmd' : 'Ctrl'}</kbd>
              <span>+</span>
              <kbd className="px-1 py-0 rounded border bg-muted">Enter</kbd>
            </span>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
