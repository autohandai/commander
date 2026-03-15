import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Trash2, Plus } from 'lucide-react'
import { useAutohandHooks, type HookDefinition } from '@/hooks/useAutohandHooks'

interface HooksPanelProps {
  workingDir: string | null
}

const HOOK_EVENTS = [
  'session-start',
  'session-end',
  'pre-tool',
  'post-tool',
  'file-modified',
  'pre-prompt',
  'post-response',
] as const
type HookEvent = (typeof HOOK_EVENTS)[number]

export function HooksPanel({ workingDir }: HooksPanelProps) {
  const { hooks, loading, error, saveHook, deleteHook, toggleHook } = useAutohandHooks(workingDir)
  const [showAdd, setShowAdd] = useState(false)
  const [newEvent, setNewEvent] = useState<HookEvent>('post-tool')
  const [newCommand, setNewCommand] = useState('')
  const [newPattern, setNewPattern] = useState('')

  const handleAdd = async () => {
    if (!newCommand.trim()) return
    const hook: HookDefinition = {
      id: `hook-${Date.now()}`,
      event: newEvent,
      command: newCommand.trim(),
      pattern: newPattern.trim() || undefined,
      enabled: true,
      description: undefined,
    }
    await saveHook(hook)
    setNewCommand('')
    setNewPattern('')
    setShowAdd(false)
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading hooks...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Lifecycle Hooks</h3>
        <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Hook
        </Button>
      </div>

      {showAdd && (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Event</Label>
              <select
                className="w-full rounded-md border bg-background px-2 py-1 text-sm"
                value={newEvent}
                onChange={(e) => setNewEvent(e.target.value as HookEvent)}
              >
                {HOOK_EVENTS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Pattern (optional)</Label>
              <Input
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                placeholder="*.ts"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Command</Label>
            <Input
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="/path/to/hook-script.sh"
              className="h-8 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAdd} disabled={!newCommand.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      {hooks.length === 0 && !showAdd && (
        <p className="text-sm text-muted-foreground">
          No hooks configured. Hooks run scripts at key lifecycle events (pre-tool, post-tool, file-modified, etc.).
        </p>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="space-y-2">
        {hooks.map((hook) => (
          <div
            key={hook.id}
            className="flex items-center justify-between rounded-md border px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <Switch
                checked={hook.enabled}
                onCheckedChange={(checked) => toggleHook(hook.id, checked)}
              />
              <div>
                <p className="text-sm font-mono">
                  <span className="text-primary">{hook.event}</span>
                  {hook.pattern && (
                    <span className="text-muted-foreground"> ({hook.pattern})</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground truncate max-w-[300px]">
                  {hook.command}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => deleteHook(hook.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
