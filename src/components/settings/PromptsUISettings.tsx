import { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Eye, AlertCircle } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { PromptsDataTable } from './prompts/data-table';
import { createColumns, PromptTableData, PromptActions } from './prompts/columns';

interface PromptTemplate {
  name: string;
  description: string;
  content: string;
  category: string;
  variables: string[];
  created_at: number;
  updated_at: number;
}

interface PromptCategory {
  name: string;
  description: string;
  enabled: boolean;
}

interface PromptsConfig {
  categories: Record<string, PromptCategory>;
  prompts: Record<string, Record<string, PromptTemplate>>;
  version: number;
  updated_at: number;
}

export function PromptsUISettings() {
  const [config, setConfig] = useState<PromptsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [showViewDialog, setShowViewDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  // Current prompt states
  const [currentPrompt, setCurrentPrompt] = useState<PromptTableData | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(null);
  const [isNewPrompt, setIsNewPrompt] = useState(false);

  // Preview states
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

  // Load prompts configuration
  const loadPromptsConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const promptsConfig = await invoke<PromptsConfig>('load_prompts');
      setConfig(promptsConfig);
    } catch (error) {
      console.error('Failed to load prompts config:', error);
      setError('Failed to load prompts configuration');
    } finally {
      setLoading(false);
    }
  };

  // Save prompts configuration
  const savePromptsConfig = async (updatedConfig: PromptsConfig) => {
    try {
      setSaving(true);
      setError(null);
      await invoke('save_prompts', { prompts: updatedConfig });
      setConfig(updatedConfig);
    } catch (error) {
      console.error('Failed to save prompts config:', error);
      setError('Failed to save prompts configuration');
      throw error;
    } finally {
      setSaving(false);
    }
  };

  // Extract variable placeholders from prompt content
  const extractVariables = (content: string): string[] => {
    const variables: string[] = [];
    const regex = /\{\{(\w+)\}\}/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }
    
    return variables;
  };

  // Convert nested prompts structure to flat table data
  const tableData: PromptTableData[] = useMemo(() => {
    if (!config) return [];

    const data: PromptTableData[] = [];
    
    Object.entries(config.prompts).forEach(([categoryKey, categoryPrompts]) => {
      const category = config.categories[categoryKey];
      if (!category) return;

      Object.entries(categoryPrompts).forEach(([promptKey, prompt]) => {
        data.push({
          id: `${categoryKey}.${promptKey}`,
          name: prompt.name,
          description: prompt.description,
          content: prompt.content,
          category: categoryKey,
          categoryName: category.name,
          variables: prompt.variables,
          created_at: prompt.created_at,
          updated_at: prompt.updated_at,
        });
      });
    });

    return data.sort((a, b) => b.updated_at - a.updated_at);
  }, [config]);

  // Convert categories for filter dropdown
  const categories = useMemo(() => {
    if (!config) return [];
    
    return Object.entries(config.categories).map(([key, category]) => ({
      id: key,
      name: category.name,
    }));
  }, [config]);

  // Action handlers for the data table
  const actions: PromptActions = {
    onView: (prompt: PromptTableData) => {
      setCurrentPrompt(prompt);
      // Initialize preview variables with empty values
      const initialVariables: Record<string, string> = {};
      prompt.variables.forEach(variable => {
        initialVariables[variable] = '';
      });
      setPreviewVariables(initialVariables);
      setShowViewDialog(true);
    },

    onEdit: (prompt: PromptTableData) => {
      setCurrentPrompt(prompt);
      setEditingPrompt({
        name: prompt.name,
        description: prompt.description,
        content: prompt.content,
        category: prompt.category,
        variables: prompt.variables,
        created_at: prompt.created_at,
        updated_at: prompt.updated_at,
      });
      setIsNewPrompt(false);
      setShowEditDialog(true);
    },

    onDelete: (prompt: PromptTableData) => {
      setCurrentPrompt(prompt);
      setShowDeleteDialog(true);
    },
  };

  // Handle creating new prompt
  const handleAddNew = () => {
    const defaultCategory = categories.length > 0 ? categories[0].id : 'general';
    
    setEditingPrompt({
      name: '',
      description: '',
      content: '',
      category: defaultCategory,
      variables: [],
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    });
    setCurrentPrompt(null);
    setIsNewPrompt(true);
    setShowEditDialog(true);
  };

  // Save prompt changes
  const savePromptChanges = async () => {
    if (!editingPrompt || !config) return;

    try {
      const updatedConfig = { ...config };
      const categoryKey = editingPrompt.category;
      
      if (!updatedConfig.prompts[categoryKey]) {
        updatedConfig.prompts[categoryKey] = {};
      }

      const promptKey = isNewPrompt 
        ? editingPrompt.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')
        : currentPrompt?.id.split('.')[1] || '';

      // Extract variables from content
      const variables = extractVariables(editingPrompt.content);
      const updatedPrompt = {
        ...editingPrompt,
        variables,
        updated_at: Math.floor(Date.now() / 1000),
      };

      updatedConfig.prompts[categoryKey][promptKey] = updatedPrompt;
      updatedConfig.updated_at = Math.floor(Date.now() / 1000);

      await savePromptsConfig(updatedConfig);
      setEditingPrompt(null);
      setShowEditDialog(false);
    } catch (error) {
      // Error is already handled in savePromptsConfig
    }
  };

  // Delete a prompt
  const deletePrompt = async () => {
    if (!currentPrompt || !config) return;

    try {
      const [categoryKey, promptKey] = currentPrompt.id.split('.');
      const updatedConfig = { ...config };
      
      if (updatedConfig.prompts[categoryKey]) {
        delete updatedConfig.prompts[categoryKey][promptKey];
        updatedConfig.updated_at = Math.floor(Date.now() / 1000);
        await savePromptsConfig(updatedConfig);
      }
      
      setShowDeleteDialog(false);
      setCurrentPrompt(null);
    } catch (error) {
      // Error is already handled in savePromptsConfig
    }
  };

  // Render prompt with variables replaced
  const renderPromptPreview = (content: string, variables: Record<string, string>): string => {
    let rendered = content;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `[${key}]`);
    }
    return rendered;
  };

  useEffect(() => {
    loadPromptsConfig();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading prompts...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Prompt Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage your AI prompts and templates. Create, edit, and organize prompts for different use cases.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {tableData.length} prompt{tableData.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <PromptsDataTable
        columns={createColumns(actions)}
        data={tableData}
        onAddNew={handleAddNew}
        categories={categories}
      />

      {/* View Dialog */}
      <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              View Prompt: {currentPrompt?.name}
            </DialogTitle>
            <DialogDescription>
              Preview and test the prompt with variable substitution
            </DialogDescription>
          </DialogHeader>
          
          {currentPrompt && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Category:</strong> {currentPrompt.categoryName}
                </div>
                <div>
                  <strong>Updated:</strong> {new Date(currentPrompt.updated_at * 1000).toLocaleString()}
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <p className="text-sm text-muted-foreground mt-1">{currentPrompt.description}</p>
              </div>

              {currentPrompt.variables.length > 0 && (
                <div className="space-y-3">
                  <Label>Variables</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {currentPrompt.variables.map((variable) => (
                      <div key={variable}>
                        <Label htmlFor={variable} className="text-xs">{variable}</Label>
                        <Input
                          id={variable}
                          value={previewVariables[variable] || ''}
                          onChange={(e) => setPreviewVariables(prev => ({
                            ...prev,
                            [variable]: e.target.value
                          }))}
                          placeholder={`Enter ${variable}...`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Preview</Label>
                <Card>
                  <CardContent className="p-4">
                    <pre className="whitespace-pre-wrap text-sm font-mono">
                      {renderPromptPreview(currentPrompt.content, previewVariables)}
                    </pre>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-2">
                <Label>Original Template</Label>
                <Card>
                  <CardContent className="p-4">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-muted-foreground">
                      {currentPrompt.content}
                    </pre>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setEditingPrompt(null);
          setCurrentPrompt(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isNewPrompt ? 'Create New Prompt' : 'Edit Prompt'}
            </DialogTitle>
            <DialogDescription>
              {isNewPrompt 
                ? 'Create a new prompt template with variables and content'
                : 'Modify the prompt template, description, and content'
              }
            </DialogDescription>
          </DialogHeader>
          
          {editingPrompt && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={editingPrompt.name}
                    onChange={(e) => setEditingPrompt(prev => prev ? {
                      ...prev,
                      name: e.target.value
                    } : null)}
                    placeholder="Enter prompt name..."
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    value={editingPrompt.category}
                    onChange={(e) => setEditingPrompt(prev => prev ? {
                      ...prev,
                      category: e.target.value
                    } : null)}
                    className="w-full h-10 border border-input rounded-md px-3 text-sm"
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={editingPrompt.description}
                  onChange={(e) => setEditingPrompt(prev => prev ? {
                    ...prev,
                    description: e.target.value
                  } : null)}
                  placeholder="Enter prompt description..."
                />
              </div>

              <div>
                <Label htmlFor="content">Content</Label>
                <Textarea
                  id="content"
                  value={editingPrompt.content}
                  onChange={(e) => setEditingPrompt(prev => prev ? {
                    ...prev,
                    content: e.target.value
                  } : null)}
                  placeholder="Enter prompt content... Use {{variable_name}} for variables"
                  className="min-h-[200px] font-mono text-sm"
                />
              </div>

              {extractVariables(editingPrompt.content).length > 0 && (
                <div>
                  <Label>Detected Variables</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {extractVariables(editingPrompt.content).map((variable) => (
                      <Badge key={variable} variant="secondary">
                        {variable}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEditDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={savePromptChanges}
              disabled={saving || !editingPrompt?.name || !editingPrompt?.content}
            >
              {saving ? 'Saving...' : isNewPrompt ? 'Create Prompt' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Prompt</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{currentPrompt?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deletePrompt}
              disabled={saving}
            >
              {saving ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}