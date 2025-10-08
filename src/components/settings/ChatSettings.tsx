import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { DEFAULT_CLI_AGENT_OPTIONS } from "@/components/chat/agents"
import type { ChatSettingsProps } from "@/types/settings"

export function ChatSettings({
  tempFileMentionsEnabled,
  onFileMentionsChange,
  tempChatSendShortcut = 'mod+enter',
  onChatSendShortcutChange,
  tempMaxChatHistory = 15,
  onMaxChatHistoryChange,
  tempDefaultCliAgent,
  onDefaultCliAgentChange,
}: ChatSettingsProps) {
  const handleDefaultAgentChange = (value: string) => {
    onDefaultCliAgentChange?.(value)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Chat Settings</h3>
        <div className="space-y-6">
          <div className="space-y-4">
            <h4 className="text-sm font-medium">File Mentions</h4>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="file-mentions">Enable File Mentions</Label>
                <p className="text-xs text-muted-foreground">
                  Allow mentioning files with @ in chat messages (e.g., @src/components/App.tsx).
                  Files are listed from the currently selected project directory.
                </p>
              </div>
              <Switch
                id="file-mentions"
                checked={tempFileMentionsEnabled}
                onCheckedChange={onFileMentionsChange}
              />
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">
              <h5 className="text-sm font-medium mb-2">How it works:</h5>
              <div className="text-xs text-muted-foreground space-y-2">
                <p>• Type <kbd className="px-1.5 py-0.5 bg-background rounded">@</kbd> in chat to see files from the currently selected project</p>
                <p>• Files are filtered to show only code files (.ts, .tsx, .js, .py, .rs, .md, etc.)</p>
                <p>• Select files to include their paths in your message to AI agents</p>
                <p>• Example: "Please review @src/App.tsx for performance issues"</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Default Agent</h4>
            <div className="p-4 border rounded-lg bg-muted/10 space-y-3">
              <div className="space-y-0.5">
                <Label htmlFor="default-cli-agent">Default CLI agent</Label>
                <p className="text-xs text-muted-foreground">
                  The selected agent handles messages that do not specify a <code>/agent</code> prefix.
                </p>
              </div>
              <Select value={tempDefaultCliAgent} onValueChange={handleDefaultAgentChange}>
                <SelectTrigger id="default-cli-agent" aria-label="Default CLI agent" className="w-64">
                  <SelectValue placeholder="Select an agent" />
                </SelectTrigger>
                <SelectContent>
                  {DEFAULT_CLI_AGENT_OPTIONS.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">Send Shortcut</h4>
            <div className="p-4 border rounded-lg bg-muted/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Keybinding for sending messages</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose whether Enter sends or selects autocomplete (Ctrl/Cmd+Enter always sends).
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="chat-send-shortcut"
                    value="mod+enter"
                    checked={tempChatSendShortcut === 'mod+enter'}
                    onChange={() => onChatSendShortcutChange?.('mod+enter')}
                  />
                  <span className="text-sm">Ctrl/Cmd+Enter sends (Enter selects)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="chat-send-shortcut"
                    value="enter"
                    checked={tempChatSendShortcut === 'enter'}
                    onChange={() => onChatSendShortcutChange?.('enter')}
                  />
                  <span className="text-sm">Enter sends (Tab selects)</span>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-sm font-medium">History Retention</h4>
            <div className="p-4 border rounded-lg bg-muted/10 space-y-3">
              <div className="space-y-0.5">
                <Label htmlFor="max-history">Maximum messages kept in chat</Label>
                <p className="text-xs text-muted-foreground">
                  Controls how many recent messages remain visible per conversation. Older messages are automatically compacted once this limit is reached.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="max-history"
                  type="number"
                  min={5}
                  max={200}
                  value={tempMaxChatHistory}
                  onChange={(event) => {
                    const next = Number(event.target.value)
                    if (Number.isNaN(next)) return
                    onMaxChatHistoryChange?.(Math.max(5, Math.min(200, Math.floor(next))))
                  }}
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">
                  Recommended: 15 messages
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
