# Design: App Theme Presets System

## Overview

Add a full theming system to Commander with 10 built-in developer-popular presets (5 dark, 5 light), independent light/dark theme selection, per-theme customization (colors, fonts, translucent sidebar, contrast), and custom theme persistence via `~/.commander/themes/` JSON files.

## Architecture

**Hybrid approach:** Built-in presets defined in TypeScript (instant preview, no IPC). Rust handles file I/O for custom themes and native vibrancy API. Contrast calculation and CSS variable application happen in the frontend.

## Theme Data Model

```typescript
interface AppTheme {
  id: string               // "dracula", "my-custom-dark", etc.
  name: string             // Display name: "Dracula"
  type: 'light' | 'dark'   // Which mode this theme targets
  builtIn: boolean         // true for shipped presets, false for user-created
  colors: {
    accent: string         // hex, e.g. "#BD93F9"
    background: string     // "#282A36"
    foreground: string     // "#F8F8F2"
  }
  fonts: {
    ui: string             // e.g. "Inter", "-apple-system, BlinkMacSystemFont"
    code: string           // e.g. "JetBrains Mono", "ui-monospace, SFMono-Regular"
  }
  translucentSidebar: boolean
  contrast: number         // 0-100, default ~50
}
```

The 3 user colors (accent, background, foreground) are hex inputs. Everything else (~35 CSS variables) is derived by `resolveTheme()`.

### Settings Persistence

`app_settings` stores:
- `light_theme_id: string` — ID of active light theme (default: `"commander"`)
- `dark_theme_id: string` — ID of active dark theme (default: `"commander-dark"`)
- `ui_theme: string` — Mode selector: `"auto"` | `"light"` | `"dark"` (unchanged from current)

The existing `ui_theme` field controls which mode is active (auto follows OS, or forced light/dark). The new `light_theme_id` and `dark_theme_id` fields control which theme is used for each mode. When mode is `"auto"`, the app listens to `prefers-color-scheme` and swaps between the two theme IDs accordingly.

Actual theme data lives in preset definitions (built-in) or `~/.commander/themes/<id>.json` (custom).

### Rust AppSettings Updates

New fields in `AppSettings` struct with backward-compatible defaults:

```rust
#[serde(default = "default_light_theme")]
pub light_theme_id: String,  // default: "commander"

#[serde(default = "default_dark_theme")]
pub dark_theme_id: String,   // default: "commander-dark"
```

This ensures existing settings files without these fields load correctly.

## Built-in Presets

### Dark Presets

| ID | Name | Accent | Background | Foreground | Contrast |
|---|---|---|---|---|---|
| `commander-dark` | Commander Dark | `#3B82F6` | `#0A0A0F` | `#FAFAFA` | 50 |
| `dracula` | Dracula | `#BD93F9` | `#282A36` | `#F8F8F2` | 55 |
| `one-dark` | One Dark | `#61AFEF` | `#282C34` | `#ABB2BF` | 50 |
| `tokyo-night` | Tokyo Night | `#7AA2F7` | `#1A1B26` | `#C0CAF5` | 50 |
| `catppuccin-mocha` | Catppuccin Mocha | `#CBA6F7` | `#1E1E2E` | `#CDD6F4` | 50 |
| `nord` | Nord | `#88C0D0` | `#2E3440` | `#ECEFF4` | 45 |

### Light Presets

| ID | Name | Accent | Background | Foreground | Contrast |
|---|---|---|---|---|---|
| `commander` | Commander | `#1A1A2E` | `#FFFFFF` | `#0A0A0F` | 50 |
| `github-light` | GitHub Light | `#0969DA` | `#FFFFFF` | `#1F2328` | 50 |
| `solarized-light` | Solarized Light | `#268BD2` | `#FDF6E3` | `#657B83` | 45 |
| `catppuccin-latte` | Catppuccin Latte | `#8839EF` | `#EFF1F5` | `#4C4F69` | 50 |
| `one-light` | One Light | `#4078F2` | `#FAFAFA` | `#383A42` | 50 |
| `nord-light` | Nord Light | `#5E81AC` | `#ECEFF4` | `#2E3440` | 45 |

The `commander` and `commander-dark` defaults reproduce the current app appearance so existing users see no change.

All presets use default fonts:
- UI: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- Code: `ui-monospace, "SFMono-Regular", "SF Mono", Menlo, monospace`
- Translucent sidebar: `false`

## Theme Resolution Engine

`resolveTheme(theme: AppTheme) -> Record<string, string>` converts 3 hex color inputs into HSL-component format strings (e.g. `"240 10% 3.9%"`) matching the existing CSS variable format consumed by `hsl(var(--variable))` in Tailwind/shadcn.

### Internal Processing

1. Parse hex inputs to HSL
2. Derive all variables in HSL space
3. Output each as `"H S% L%"` string (no `hsl()` wrapper — matches existing format in `index.css`)

### Complete CSS Variable Map

All 35 variables produced by `resolveTheme()`:

#### Surface layers — offset backgrounds using contrast (0-100)

Dark themes shift layers lighter; light themes shift layers darker.

| Variable | Derivation |
|---|---|
| `--background` | Input background (direct conversion) |
| `--card` | Background shifted +/-1-3% lightness |
| `--card-foreground` | Input foreground |
| `--popover` | Background shifted +/-1-3% lightness |
| `--popover-foreground` | Input foreground |
| `--sidebar-background` | Background shifted +/-2-6% lightness |
| `--sidebar-foreground` | Foreground at 90% opacity equivalent |
| `--sidebar-accent` | Background shifted +/-4-8% lightness |
| `--sidebar-accent-foreground` | Input foreground |
| `--sidebar-border` | Same as `--border` |
| `--sidebar-ring` | Same as `--ring` |
| `--sidebar-active` | Accent at 15-25% lightness mix with background |
| `--sidebar-active-foreground` | Input foreground |
| `--muted` | Background shifted +/-4-8% lightness |
| `--muted-foreground` | Foreground reduced saturation, moved 30-40% toward background |
| `--secondary` | Background shifted +/-4-8% lightness |
| `--secondary-foreground` | Input foreground |
| `--accent` | Background shifted +/-4-8% lightness (same as muted) |
| `--accent-foreground` | Input foreground |

#### Borders

| Variable | Derivation |
|---|---|
| `--border` | Midpoint bg↔fg, biased 70% toward background. Contrast scales opacity. |
| `--input` | Same algorithm as `--border`, slightly more visible |

#### Text layers — contrast adjusts foreground

| Variable | Derivation |
|---|---|
| `--foreground` | Input foreground |

At contrast >70, foreground pushed further from background for WCAG AA/AAA.

#### Accent derivatives

| Variable | Derivation |
|---|---|
| `--primary` | Accent color (direct) |
| `--primary-foreground` | White or background depending on accent luminance |
| `--ring` | Accent at 50% opacity equivalent |
| `--link` | Accent lightened 10% for dark themes, darkened 10% for light |
| `--sidebar-primary` | Accent color (same as primary) |
| `--sidebar-primary-foreground` | Same as primary-foreground |

#### Semantic colors — lightness adapts to background darkness

| Variable | Derivation |
|---|---|
| `--destructive` | Red hue, lightness adapted to background |
| `--destructive-foreground` | White or near-white |
| `--success` | Green hue, lightness adapted |
| `--success-foreground` | White or near-white |
| `--warning` | Amber hue, lightness adapted |
| `--warning-foreground` | White or near-white |

#### Scrollbar

| Variable | Derivation |
|---|---|
| `--scrollbar-thumb` | Foreground at 30% mix with background |
| `--scrollbar-thumb-active` | Foreground at 50% mix with background |
| `--scrollbar-track` | Background shifted +/-2% lightness |

#### Unchanged

- `--radius` — not theme-dependent, stays `0.5rem`
- `--dashboard-*` variables — controlled by separate dashboard palette system, not touched

### Application

`applyAppTheme(vars: Record<string, string>, fonts: AppTheme['fonts'])`:

1. Sets each CSS variable on `document.documentElement.style` (e.g. `style.setProperty('--background', '240 10% 3.9%')`)
2. Sets `document.body.style.fontFamily` to `fonts.ui`
3. Sets `--code-font` CSS variable to `fonts.code`
4. Adds/removes `.dark` class based on `theme.type` (for any Tailwind `dark:` utilities)
5. Removes `.force-light` class (runtime theme overrides the media query fallback)

**Live preview:** Color/contrast changes run `resolveTheme()` + `applyAppTheme()` immediately. Persist only on explicit Save.

## Rust Backend (File I/O + Vibrancy)

### Commands

```rust
#[tauri::command]
fn list_custom_themes() -> Result<Vec<AppTheme>, String>

#[tauri::command]
fn save_custom_theme(theme: AppTheme) -> Result<(), String>

#[tauri::command]
fn delete_custom_theme(theme_id: String) -> Result<(), String>

#[tauri::command]
fn import_theme(path: String) -> Result<AppTheme, String>

#[tauri::command]
fn set_sidebar_vibrancy(enabled: bool, window: tauri::Window) -> Result<(), String>
```

Active theme selection stored in `app_settings`: `light_theme_id` and `dark_theme_id` fields.

Theme files stored in `~/.commander/themes/<id>.json`.

### Validation

- `save_custom_theme`: Validates theme ID is non-empty, contains only `[a-z0-9-]`, doesn't collide with built-in preset IDs. Validates hex colors are valid 6-digit hex. Contrast clamped to 0-100.
- `import_theme`: Reads JSON, validates schema, assigns `builtIn: false`, generates unique ID if collision detected (appends `-1`, `-2`, etc.).
- Theme ID max length: 64 characters.

### Sidebar Vibrancy (macOS)

`set_sidebar_vibrancy` uses Tauri's `window-vibrancy` crate:

- **Material:** `NSVisualEffectView` with `.sidebar` material (matches Finder/Xcode sidebar appearance)
- **Scope:** Applied to the entire window. The sidebar gets its translucent look via `--sidebar-background` set to a semi-transparent HSL value (e.g., with alpha channel). Non-sidebar areas use opaque `--background` which visually blocks the vibrancy effect.
- **Non-macOS:** `set_sidebar_vibrancy` returns `Ok(())` as a no-op. The toggle is hidden in the UI on non-macOS platforms (detected via `navigator.platform` or Tauri's `os` plugin).

## Appearance Settings UI

Dual light/dark theme panels in `AppearanceSettings.tsx`:

```
Mode: Auto (System) / Light / Dark
  Controls which theme is active based on OS preference

Light Theme
  Preset: [dropdown] [Copy] [Import]
  Accent / Background / Foreground — hex input + color swatch
  UI Font / Code Font — text inputs
  Translucent sidebar — toggle (macOS only)
  Contrast — slider 0-100

Dark Theme
  (same controls)

(existing sections: Code Viewer, Dashboard, Chat History Style)
```

- Selecting a preset populates all fields. Manual changes override preset (label becomes "Custom").
- Copy exports current theme as JSON to clipboard.
- Import opens file dialog for `.json` theme file.
- All changes apply live as preview. Unsaved changes prompt on navigation.

### Updated AppearanceSettingsProps

```typescript
export interface AppearanceSettingsProps {
  // Existing props (unchanged)
  tempUiTheme?: string;
  onUiThemeChange?: (theme: string) => void;
  tempDashboardColorPalette?: string;
  onDashboardColorPaletteChange?: (palette: string) => void;
  tempShowDashboardActivity?: boolean;
  onShowDashboardActivityChange?: (enabled: boolean) => void;
  tempDashboardChartType?: 'scatter' | 'knowledge-base';
  onDashboardChartTypeChange?: (type: 'scatter' | 'knowledge-base') => void;
  tempCodeTheme?: string;
  onCodeThemeChange?: (theme: string) => void;
  tempCodeFontSize?: number;
  onCodeFontSizeChange?: (size: number) => void;
  tempChatHistoryStyle?: 'palette' | 'sidebar' | 'strip';
  onChatHistoryStyleChange?: (style: 'palette' | 'sidebar' | 'strip') => void;

  // New theme props
  tempLightThemeId?: string;
  onLightThemeIdChange?: (id: string) => void;
  tempDarkThemeId?: string;
  onDarkThemeIdChange?: (id: string) => void;
  tempLightThemeOverrides?: Partial<AppTheme>;
  onLightThemeOverrideChange?: (key: string, value: any) => void;
  tempDarkThemeOverrides?: Partial<AppTheme>;
  onDarkThemeOverrideChange?: (key: string, value: any) => void;
  customThemes?: AppTheme[];
  onSaveCustomTheme?: (theme: AppTheme) => Promise<void>;
  onDeleteCustomTheme?: (id: string) => Promise<void>;
  onImportTheme?: () => Promise<void>;
  onCopyTheme?: (theme: AppTheme) => void;
}
```

## Default Window Dimensions

Update `tauri.conf.json`:
- Width: 1400 (from 1280)
- Height: 860 (from 800)
- Min width: 800 (unchanged)
- Min height: 600 (unchanged)
- Center: true (Tauri v2 centers on primary monitor)

## Files

### New Frontend Files

| File | Purpose |
|---|---|
| `src/lib/app-themes.ts` | 12 preset definitions (6 dark + 6 light, including 2 commander defaults), `AppTheme` type |
| `src/lib/app-theme-engine.ts` | `resolveTheme()`, `applyAppTheme()` — hex→HSL conversion, contrast scaling, all 35 CSS variables |

### New Rust Files

| File | Purpose |
|---|---|
| `src-tauri/src/commands/theme_commands.rs` | 5 Tauri commands |
| `src-tauri/src/services/theme_service.rs` | File I/O for `~/.commander/themes/`, validation |
| `src-tauri/src/models/theme.rs` | `AppTheme` struct (serde) |

### Modified Files

| File | Change |
|---|---|
| `src/components/settings/AppearanceSettings.tsx` | Dual light/dark theme panels with full controls |
| `src/contexts/settings-context.tsx` | Add `light_theme_id`, `dark_theme_id`. Resolve + apply active theme on load. Swap on OS `prefers-color-scheme` changes. |
| `src/types/settings.ts` | Add `light_theme_id`, `dark_theme_id` to `AppSettings`. Expand `AppearanceSettingsProps`. |
| `src/index.css` | Keep `:root`/`.dark` as fallbacks, overridden at runtime by `applyAppTheme()` |
| `src-tauri/tauri.conf.json` | Window: 1400x860 |
| `src-tauri/src/commands/mod.rs` | Add `pub mod theme_commands` |
| `src-tauri/src/services/mod.rs` | Add `pub mod theme_service` |
| `src-tauri/src/models/mod.rs` | Add `pub mod theme` |
| `src-tauri/src/lib.rs` | Register 5 new commands |
| `src-tauri/Cargo.toml` | Add `window-vibrancy` crate dependency |

### Test Files

| File | Purpose |
|---|---|
| `src/lib/__tests__/app-theme-engine.test.ts` | resolveTheme outputs HSL-component strings, all 35 variables present, contrast scaling, WCAG at high contrast |
| `src/lib/__tests__/app-themes.test.ts` | Validate all 12 presets: valid hex, correct type, unique IDs, commander defaults match current CSS |
| `src-tauri/src/tests/services/theme_service.rs` | File read/write/delete/import, malformed JSON, ID validation, collision handling |
