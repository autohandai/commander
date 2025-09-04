import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { ChatSettingsProps } from "@/types/settings"

export function ChatSettings({
  tempFileMentionsEnabled,
  onFileMentionsChange,
  tempChatSendShortcut = 'mod+enter',
  onChatSendShortcutChange,
}: ChatSettingsProps) {
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
        </div>
      </div>
    </div>
  )
}
