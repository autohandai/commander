import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/contexts/settings-context";
import { useState, useEffect } from "react";
import { Switch } from "@/components/ui/switch";

export function CodeSettings() {
  const { settings, updateSettings } = useSettings();
  const [tempTheme, setTempTheme] = useState(settings.code_settings.theme);
  const [tempFontSize, setTempFontSize] = useState(settings.code_settings.font_size);
  const [tempAutoCollapse, setTempAutoCollapse] = useState(settings.code_settings.auto_collapse_sidebar);
  const [isSaving, setIsSaving] = useState(false);

  // Sync temp values when settings change from external sources
  useEffect(() => {
    setTempTheme(settings.code_settings.theme);
    setTempFontSize(settings.code_settings.font_size);
    setTempAutoCollapse(settings.code_settings.auto_collapse_sidebar);
  }, [settings.code_settings.theme, settings.code_settings.font_size, settings.code_settings.auto_collapse_sidebar]);
  
  const hasChanges = tempTheme !== settings.code_settings.theme || 
                    tempFontSize !== settings.code_settings.font_size ||
                    tempAutoCollapse !== settings.code_settings.auto_collapse_sidebar;

  const handleSave = async () => {
    if (!hasChanges) return;
    
    setIsSaving(true);
    try {
      await updateSettings({
        code_settings: {
          theme: tempTheme,
          font_size: tempFontSize,
          auto_collapse_sidebar: tempAutoCollapse,
        }
      });
    } catch (error) {
      console.error('Failed to save code settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDiscard = () => {
    setTempTheme(settings.code_settings.theme);
    setTempFontSize(settings.code_settings.font_size);
    setTempAutoCollapse(settings.code_settings.auto_collapse_sidebar);
  };
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Code</h2>
        <p className="text-sm text-muted-foreground">Customize code viewer appearance.</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Theme</Label>
          <Select value={tempTheme} onValueChange={setTempTheme}>
            <SelectTrigger>
              <SelectValue placeholder="Select a theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (match UI)</SelectItem>
              <SelectItem value="github">GitHub (light)</SelectItem>
              <SelectItem value="dracula">Dracula (dark)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="font-size">Font Size (px)</Label>
          <Input
            id="font-size"
            type="number"
            min={10}
            max={24}
            value={tempFontSize}
            onChange={(e) => setTempFontSize(Number(e.target.value) || 14)}
          />
        </div>
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
