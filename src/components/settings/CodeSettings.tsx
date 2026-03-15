import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/settings-context";
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";

export function CodeSettings() {
  const { settings, updateSettings } = useSettings();
  const [tempAutoCollapse, setTempAutoCollapse] = useState(settings.code_settings.auto_collapse_sidebar);
  const [tempShowExplorer, setTempShowExplorer] = useState(
    settings.code_settings.show_file_explorer ?? true
  );
  const [isSaving, setIsSaving] = useState(false);

  // Sync temp values when settings change from external sources
  useEffect(() => {
    setTempAutoCollapse(settings.code_settings.auto_collapse_sidebar);
    setTempShowExplorer(settings.code_settings.show_file_explorer ?? true);
  }, [
    settings.code_settings.auto_collapse_sidebar,
    settings.code_settings.show_file_explorer,
  ]);

  const hasChanges = tempAutoCollapse !== settings.code_settings.auto_collapse_sidebar ||
                    tempShowExplorer !== (settings.code_settings.show_file_explorer ?? true);

  const handleSave = async () => {
    if (!hasChanges) return;

    setIsSaving(true);
    try {
      await updateSettings({
        code_settings: {
          theme: settings.code_settings.theme,
          font_size: settings.code_settings.font_size,
          auto_collapse_sidebar: tempAutoCollapse,
          show_file_explorer: tempShowExplorer,
        }
      });
    } catch (error) {
      console.error('Failed to save code settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setTempAutoCollapse(settings.code_settings.auto_collapse_sidebar);
    setTempShowExplorer(settings.code_settings.show_file_explorer ?? true);
  };
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Code</h2>
        <p className="text-sm text-muted-foreground">Configure code viewer behavior.</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 p-4">
          <div>
            <Label htmlFor="auto-collapse-sidebar">Auto-collapse app sidebar</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Hide the project sidebar whenever the Code tab is active. It reappears in Chat and History views.
            </p>
          </div>
          <Switch
            id="auto-collapse-sidebar"
            checked={tempAutoCollapse}
            onCheckedChange={setTempAutoCollapse}
            aria-label="Auto-collapse app sidebar"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4 rounded-md border border-border/60 p-4">
          <div>
            <Label htmlFor="show-file-explorer">Show File Explorer</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Display the file explorer panel in the Code view. Disable to focus on the editor.
            </p>
          </div>
          <Switch
            id="show-file-explorer"
            checked={tempShowExplorer}
            onCheckedChange={setTempShowExplorer}
            aria-label="Show File Explorer"
          />
        </div>
      </div>

      {hasChanges && (
        <div className="flex gap-2 pt-4 border-t">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
          <Button variant="outline" onClick={handleDiscard}>
            Discard Changes
          </Button>
        </div>
      )}
    </div>
  );
}
