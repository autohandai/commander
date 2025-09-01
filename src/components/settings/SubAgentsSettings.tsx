import { useEffect, useMemo, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { SubAgent, SubAgentGroup } from '@/types/sub-agent'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ToastProvider'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreVertical, Eye, Pencil, Trash2 } from 'lucide-react'

type CliName = 'claude' | 'codex' | 'gemini'

export function SubAgentsSettings() {
  const { showError, showSuccess } = useToast()
  const [grouped, setGrouped] = useState<SubAgentGroup>({})
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<SubAgent | null>(null)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState<SubAgent | null>(null)
  const [viewContent, setViewContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [newCli, setNewCli] = useState<CliName>('claude')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newColor, setNewColor] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newContent, setNewContent] = useState('')

  const cliList = useMemo<CliName[]>(() => ['claude', 'codex', 'gemini'], [])

  const loadAgents = async () => {
    try {
      setLoading(true)
      const agents = await invoke<SubAgentGroup>('load_sub_agents_grouped')
      setGrouped(agents)
    } catch (e) {
      showError('Failed to load sub-agents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const startEdit = async (agent: SubAgent) => {
    try {
      setEditing(agent)
      const content = await invoke<string>('read_file_content', { filePath: agent.file_path })
      setEditContent(content)
    } catch (e) {
      showError('Failed to open agent file')
      setEditing(null)
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    try {
      setSaving(true)
      await invoke('save_sub_agent', { filePath: editing.file_path, content: editContent })
      showSuccess('Agent saved')
      setEditing(null)
      setEditContent('')
      await loadAgents()
    } catch (e) {
      showError('Failed to save agent')
    } finally {
      setSaving(false)
    }
  }

  const startView = async (agent: SubAgent) => {
    try {
      setViewing(agent)
      const content = await invoke<string>('read_file_content', { filePath: agent.file_path })
      setViewContent(content)
    } catch (e) {
      showError('Failed to open agent file')
      setViewing(null)
    }
  }

  const deleteAgent = async (agent: SubAgent) => {
    try {
      // simple confirm for now; can replace with AlertDialog if preferred
      if (!confirm(`Delete sub-agent "${agent.name}"? This cannot be undone.`)) return
      await invoke('delete_sub_agent', { filePath: agent.file_path })
      showSuccess('Sub-agent deleted')
      await loadAgents()
    } catch (e) {
      showError('Failed to delete sub-agent')
    }
  }

  const createAgent = async () => {
    if (!newName.trim()) {
      showError('Name is required')
      return
    }
    try {
      setCreating(true)
      await invoke<SubAgent>('create_sub_agent', {
        cliName: newCli,
        name: newName,
        description: newDescription || null,
        color: newColor || null,
        model: newModel || null,
        content: newContent,
      })
      showSuccess('Sub-agent created')
      setIsCreateOpen(false)
      setNewName(''); setNewDescription(''); setNewColor(''); setNewModel(''); setNewContent('')
      await loadAgents()
    } catch (e) {
      showError('Failed to create sub-agent')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Sub Agents</h2>
        <p className="text-sm text-muted-foreground">
          Manage sub-agent files used by CLI agents (Claude, Codex, Gemini).
        </p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setIsCreateOpen(true)}>New Sub-Agent</Button>
      </div>

      <Separator />

      {loading && (
        <div className="text-sm text-muted-foreground">Loading sub-agents…</div>
      )}

      {!loading && Object.keys(grouped).length === 0 && (
        <div className="text-sm text-muted-foreground">No sub-agents found.</div>
      )}

      {!loading && Object.entries(grouped).map(([cli, agents]) => (
        <div key={cli} className="space-y-2">
          <h3 className="text-sm font-medium capitalize">{cli} Agents</h3>
          <div className="grid gap-3">
            {agents.map(agent => (
              <div key={agent.file_path} className="p-3 border rounded-md bg-muted/20 flex items-start gap-3 overflow-hidden">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm break-words">{agent.name}</div>
                  <div className="text-xs text-muted-foreground whitespace-normal break-words leading-snug">
                    {agent.description}
                  </div>
                  <div className="text-xs text-muted-foreground/70 mt-1 truncate">{agent.model || 'default model'}</div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startView(agent)}>
                      <Eye className="h-4 w-4 mr-2" /> View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => startEdit(agent)}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => deleteAgent(agent)}>
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Edit Dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Edit Sub-Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>File</Label>
              <div className="text-xs text-muted-foreground break-all">{editing?.file_path}</div>
            </div>
            <div className="space-y-2">
              <Label>Content (Markdown with frontmatter)</Label>
              <Textarea rows={18} value={editContent} onChange={e => setEditContent(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Sub-Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>CLI</Label>
                <div className="flex gap-2">
                  {cliList.map(cli => (
                    <Button key={cli} type="button" variant={newCli === cli ? 'default' : 'outline'} size="sm" onClick={() => setNewCli(cli)} className="capitalize">
                      {cli}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="My sub-agent" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={newDescription} onChange={e => setNewDescription(e.target.value)} placeholder="Short description" />
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Input value={newColor} onChange={e => setNewColor(e.target.value)} placeholder="#RRGGBB or name" />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Model (optional)</Label>
                <Input value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="e.g. claude-3" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Content (Markdown)</Label>
              <Textarea rows={12} value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="# Instructions" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsCreateOpen(false)} disabled={creating}>Cancel</Button>
              <Button onClick={createAgent} disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>View Sub-Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>File</Label>
              <div className="text-xs text-muted-foreground break-all">{viewing?.file_path}</div>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <pre className="text-xs p-3 bg-muted/30 rounded-md overflow-auto max-h-[60vh] whitespace-pre-wrap break-words">
                {viewContent}
              </pre>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
