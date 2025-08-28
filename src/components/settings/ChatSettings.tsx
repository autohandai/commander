import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import type { ChatSettingsProps } from "@/types/settings"

export function ChatSettings({
  tempFileMentionsEnabled,
  onFileMentionsChange
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
            <h4 className="text-sm font-medium">Chat Interface</h4>
            <div className="p-4 border rounded-lg bg-muted/10">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-scroll">Auto-scroll to Messages</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically scroll to new messages in chat.
                    </p>
                  </div>
                  <Switch
                    id="auto-scroll"
                    checked={true}
                    disabled={true}
                    aria-label="Coming soon"
                  />
                </div>
                
                <div className="flex items-center justify-between opacity-50">
                  <div className="space-y-0.5">
                    <Label htmlFor="message-history">Message History</Label>
                    <p className="text-xs text-muted-foreground">
                      Number of previous messages to keep in memory.
                    </p>
                  </div>
                  <div className="w-20">
                    <Input
                      id="message-history"
                      type="number"
                      value="50"
                      disabled={true}
                      className="text-center"
                    />
                  </div>
                </div>
                
                <div className="text-xs text-muted-foreground italic">
                  Additional chat settings coming soon...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}