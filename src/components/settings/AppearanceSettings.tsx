import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { PALETTE_OPTIONS, getDashboardPalettePreview } from "@/lib/dashboard-palettes"
import type { AppearanceSettingsProps } from "@/types/settings"

function DashboardPalettePreview({
  paletteKey,
  testId,
}: {
  paletteKey: string
  testId: string
}) {
  const preview = getDashboardPalettePreview(paletteKey)

  return (
    <span className="flex items-center gap-1.5" data-testid={testId}>
      {preview.map((color, index) => (
        <span
          key={`${paletteKey}-${index}`}
          className="h-2.5 w-2.5 rounded-full border border-black/10 dark:border-white/10"
          style={{ backgroundColor: color }}
          data-palette-swatch="true"
        />
      ))}
    </span>
  )
}

export function AppearanceSettings({
  tempUiTheme = 'auto',
  onUiThemeChange,
  tempDashboardColorPalette = 'default',
  onDashboardColorPaletteChange,
  tempShowDashboardActivity = true,
  onShowDashboardActivityChange,
  tempDashboardChartType = 'scatter',
  onDashboardChartTypeChange,
  tempCodeTheme = 'github',
  onCodeThemeChange,
  tempCodeFontSize = 14,
  onCodeFontSizeChange,
  tempChatHistoryStyle,
  onChatHistoryStyleChange,
}: AppearanceSettingsProps) {
  const selectedPalette = PALETTE_OPTIONS.find((option) => option.value === tempDashboardColorPalette) ?? PALETTE_OPTIONS[0]

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Appearance</h3>

        <div className="space-y-4">
          {/* App Theme */}
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select value={tempUiTheme} onValueChange={(v) => onUiThemeChange?.(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select theme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (System)</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Code Viewer */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Code Viewer</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Syntax Theme</Label>
                <Select value={tempCodeTheme} onValueChange={(v) => onCodeThemeChange?.(v)}>
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
                <Label htmlFor="code-font-size">Font Size (px)</Label>
                <Input
                  id="code-font-size"
                  type="number"
                  min={10}
                  max={24}
                  value={tempCodeFontSize}
                  onChange={(e) => onCodeFontSizeChange?.(Number(e.target.value) || 14)}
                />
              </div>
            </div>
          </div>

          {/* Dashboard */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium">Dashboard</h4>
            <div className="space-y-2">
              <Label htmlFor="dashboard-palette">Chart Color Palette</Label>
              <Select value={tempDashboardColorPalette} onValueChange={(v) => onDashboardColorPaletteChange?.(v)}>
                <SelectTrigger aria-label="Chart Color Palette" className="h-11">
                  <div className="flex min-w-0 items-center gap-3">
                    <DashboardPalettePreview
                      paletteKey={selectedPalette.value}
                      testId={`dashboard-palette-trigger-preview-${selectedPalette.value}`}
                    />
                    <SelectValue placeholder="Select palette" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {PALETTE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <div className="flex items-center gap-3">
                        <DashboardPalettePreview
                          paletteKey={opt.value}
                          testId={`dashboard-palette-option-preview-${opt.value}`}
                        />
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Color scheme for agent data in dashboard charts.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dashboard-chart-type">Chart Type</Label>
              <Select value={tempDashboardChartType} onValueChange={(v) => onDashboardChartTypeChange?.(v as 'scatter' | 'knowledge-base')}>
                <SelectTrigger aria-label="Chart Type">
                  <SelectValue placeholder="Select chart type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scatter">Activity Matrix</SelectItem>
                  <SelectItem value="knowledge-base">Knowledge Base</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose between the dot matrix view and the force-directed knowledge base network.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dashboard-activity-toggle">Show Dashboard Activity</Label>
                <p className="text-xs text-muted-foreground">
                  Show or hide activity charts and metrics on the dashboard.
                </p>
              </div>
              <Switch
                id="dashboard-activity-toggle"
                checked={tempShowDashboardActivity}
                onCheckedChange={(val) => onShowDashboardActivityChange?.(val)}
              />
            </div>
          </div>

          {/* Chat History */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Chat History Style</Label>
            <p className="text-xs text-muted-foreground">How the chat session picker appears when you press &#x2318;&#x21E7;H</p>
            <Select value={tempChatHistoryStyle ?? 'palette'} onValueChange={(v) => onChatHistoryStyleChange?.(v as 'palette' | 'sidebar' | 'strip')}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="palette">Command Palette</SelectItem>
                <SelectItem value="sidebar">Sidebar Panel</SelectItem>
                <SelectItem value="strip">Recent Strip</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}
