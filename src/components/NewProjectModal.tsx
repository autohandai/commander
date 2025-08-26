import { useState } from 'react';
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
  onSuccess: () => void;
}

export function NewProjectModal({ isOpen, onClose, onSuccess }: NewProjectModalProps) {
  const [projectName, setProjectName] = useState('');
  const [projectPath, setProjectPath] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const { showError, showSuccess } = useToast();

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      showError('Please enter a project name');
      return;
    }

    setIsCreating(true);
    try {
      // Get default projects folder if path is not set
      let targetPath = projectPath;
      if (!targetPath) {
        targetPath = await invoke<string>('get_default_projects_folder');
      }
      
      const fullPath = `${targetPath}/${projectName}`;
      
      // Create the directory
      await invoke('ensure_directory_exists', { path: fullPath });
      
      // Initialize as git repository
      // This is a simple new project - just create the folder
      showSuccess('Project created successfully!', 'Project Created');
      onSuccess();
      onClose();
      resetForm();
    } catch (error: any) {
      showError(error.toString() || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setProjectName('');
    setProjectPath('');
  };

  const handleClose = () => {
    if (!isCreating) {
      resetForm();
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="w-[85vw] max-w-[1400px] h-[90vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Create a new project folder in your local workspace
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex-1 px-6 py-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="my-awesome-project"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={isCreating}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="project-path">Project Location (optional)</Label>
            <Input
              id="project-path"
              placeholder="Leave empty to use default projects folder"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              If left empty, the project will be created in your default projects folder
            </p>
          </div>
        </div>
        
        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreateProject} disabled={isCreating || !projectName.trim()}>
            {isCreating ? 'Creating...' : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}