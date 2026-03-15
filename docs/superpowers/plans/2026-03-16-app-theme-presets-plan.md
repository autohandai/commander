# App Theme Presets Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full theming system with 12 built-in presets, independent light/dark theme selection, per-theme color/font/contrast customization, and custom theme file persistence.

**Architecture:** Hybrid — presets defined in TypeScript for instant preview, Rust handles file I/O for `~/.commander/themes/` custom themes. A theme engine converts 3 hex colors → ~35 HSL-component CSS variables. Settings context applies the active theme and swaps on OS mode changes.

**Tech Stack:** TypeScript, React, Tauri v2 (Rust), serde, CSS custom properties (HSL-component format), shadcn/ui components.

**Spec:** `docs/superpowers/specs/2026-03-16-app-theme-presets-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|---|---|
| `src/lib/app-themes.ts` | `AppTheme` type, 12 preset definitions, `THEME_PRESETS` registry, `THEME_OPTIONS` for dropdowns |
| `src/lib/app-theme-engine.ts` | `resolveTheme()` hex→HSL engine, `applyAppTheme()` CSS variable setter |
| `src-tauri/src/models/theme.rs` | `AppTheme` Rust struct (serde) |
| `src-tauri/src/services/theme_service.rs` | File I/O for `~/.commander/themes/`, validation |
| `src-tauri/src/commands/theme_commands.rs` | 5 Tauri commands |
| `src/lib/__tests__/app-themes.test.ts` | Preset validation tests |
| `src/lib/__tests__/app-theme-engine.test.ts` | Resolution engine tests |
| `src-tauri/src/tests/services/theme_service.rs` | Rust service tests |

### Modified Files

| File | Change |
|---|---|
| `src-tauri/src/models/project.rs` | Add `light_theme_id`, `dark_theme_id` to `AppSettings` |
| `src-tauri/src/models/mod.rs` | Add `pub mod theme` |
| `src-tauri/src/services/mod.rs` | Add `pub mod theme_service` |
| `src-tauri/src/commands/mod.rs` | Add `pub mod theme_commands` + re-export |
| `src-tauri/src/lib.rs` | Register 5 new commands in `invoke_handler!` |
| `src-tauri/src/tests/services/mod.rs` | Add `pub mod theme_service` |
| `src-tauri/Cargo.toml` | _Deferred_ — `window-vibrancy` not needed for initial implementation. Vibrancy command uses CSS-based approach initially; native `NSVisualEffectView` integration is a follow-up task. |
| `src/types/settings.ts` | Add theme fields to `AppSettings`, expand `AppearanceSettingsProps` |
| `src/contexts/settings-context.tsx` | Add `light_theme_id`/`dark_theme_id` to context AppSettings, add `useLayoutEffect` to resolve+apply active theme, listen for OS mode swaps |
| `src/components/settings/AppearanceSettings.tsx` | Add dual light/dark theme panels with preset dropdowns, color pickers, font inputs, contrast slider |
| `src/components/SettingsModal.tsx` | Wire new theme state pairs, pass props to AppearanceSettings |
| `src-tauri/tauri.conf.json` | Window dimensions 1400×860 |
| `src/index.css` | No structural changes — existing `:root`/`.dark` blocks remain as fallbacks |

---

## Chunk 1: Frontend Theme Engine

### Task 1: AppTheme Type and Preset Definitions

**Files:**
- Create: `src/lib/app-themes.ts`
- Test: `src/lib/__tests__/app-themes.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/app-themes.test.ts
import { describe, it, expect } from 'vitest'
import { THEME_PRESETS, THEME_OPTIONS, type AppTheme } from '../app-themes'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

describe('THEME_PRESETS', () => {
  it('contains exactly 12 presets', () => {
    expect(Object.keys(THEME_PRESETS)).toHaveLength(12)
  })

  it('every preset has a unique id matching its key', () => {
    for (const [key, preset] of Object.entries(THEME_PRESETS)) {
      expect(preset.id).toBe(key)
    }
  })

  it('every preset has valid hex colors', () => {
    for (const [, preset] of Object.entries(THEME_PRESETS)) {
      expect(preset.colors.accent).toMatch(HEX_RE)
      expect(preset.colors.background).toMatch(HEX_RE)
      expect(preset.colors.foreground).toMatch(HEX_RE)
    }
  })

  it('every preset has type "light" or "dark"', () => {
    for (const [, preset] of Object.entries(THEME_PRESETS)) {
      expect(['light', 'dark']).toContain(preset.type)
    }
  })

  it('has 6 dark and 6 light presets', () => {
    const dark = Object.values(THEME_PRESETS).filter(p => p.type === 'dark')
    const light = Object.values(THEME_PRESETS).filter(p => p.type === 'light')
    expect(dark).toHaveLength(6)
    expect(light).toHaveLength(6)
  })

  it('all built-in presets have builtIn: true', () => {
    for (const preset of Object.values(THEME_PRESETS)) {
      expect(preset.builtIn).toBe(true)
    }
  })

  it('has commander and commander-dark defaults', () => {
    expect(THEME_PRESETS['commander']).toBeDefined()
    expect(THEME_PRESETS['commander'].type).toBe('light')
    expect(THEME_PRESETS['commander-dark']).toBeDefined()
    expect(THEME_PRESETS['commander-dark'].type).toBe('dark')
  })

  it('contrast values are between 0 and 100', () => {
    for (const preset of Object.values(THEME_PRESETS)) {
      expect(preset.contrast).toBeGreaterThanOrEqual(0)
      expect(preset.contrast).toBeLessThanOrEqual(100)
    }
  })
})

describe('THEME_OPTIONS', () => {
  it('has entries for all presets', () => {
    expect(THEME_OPTIONS).toHaveLength(12)
  })

  it('each option has value and label', () => {
    for (const opt of THEME_OPTIONS) {
      expect(opt.value).toBeTruthy()
      expect(opt.label).toBeTruthy()
      expect(THEME_PRESETS[opt.value]).toBeDefined()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/lib/__tests__/app-themes.test.ts --dir src/`
Expected: FAIL — module `../app-themes` not found

- [ ] **Step 3: Implement preset definitions**

```typescript
// src/lib/app-themes.ts

export interface AppTheme {
  id: string
  name: string
  type: 'light' | 'dark'
  builtIn: boolean
  colors: {
    accent: string
    background: string
    foreground: string
  }
  fonts: {
    ui: string
    code: string
  }
  translucentSidebar: boolean
  contrast: number
}

const DEFAULT_FONTS = {
  ui: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  code: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, monospace',
}

function preset(
  id: string,
  name: string,
  type: 'light' | 'dark',
  accent: string,
  background: string,
  foreground: string,
  contrast: number = 50,
): AppTheme {
  return {
    id, name, type, builtIn: true,
    colors: { accent, background, foreground },
    fonts: { ...DEFAULT_FONTS },
    translucentSidebar: false,
    contrast,
  }
}

export const THEME_PRESETS: Record<string, AppTheme> = {
  // Light
  'commander':         preset('commander',         'Commander',         'light', '#1A1A2E', '#FFFFFF', '#0A0A0F', 50),
  'github-light':      preset('github-light',      'GitHub Light',      'light', '#0969DA', '#FFFFFF', '#1F2328', 50),
  'solarized-light':   preset('solarized-light',   'Solarized Light',   'light', '#268BD2', '#FDF6E3', '#657B83', 45),
  'catppuccin-latte':  preset('catppuccin-latte',  'Catppuccin Latte',  'light', '#8839EF', '#EFF1F5', '#4C4F69', 50),
  'one-light':         preset('one-light',         'One Light',         'light', '#4078F2', '#FAFAFA', '#383A42', 50),
  'nord-light':        preset('nord-light',        'Nord Light',        'light', '#5E81AC', '#ECEFF4', '#2E3440', 45),
  // Dark
  'commander-dark':    preset('commander-dark',    'Commander Dark',    'dark', '#3B82F6', '#0A0A0F', '#FAFAFA', 50),
  'dracula':           preset('dracula',           'Dracula',           'dark', '#BD93F9', '#282A36', '#F8F8F2', 55),
  'one-dark':          preset('one-dark',          'One Dark',          'dark', '#61AFEF', '#282C34', '#ABB2BF', 50),
  'tokyo-night':       preset('tokyo-night',       'Tokyo Night',       'dark', '#7AA2F7', '#1A1B26', '#C0CAF5', 50),
  'catppuccin-mocha':  preset('catppuccin-mocha',  'Catppuccin Mocha',  'dark', '#CBA6F7', '#1E1E2E', '#CDD6F4', 50),
  'nord':              preset('nord',              'Nord',              'dark', '#88C0D0', '#2E3440', '#ECEFF4', 45),
}

export const THEME_OPTIONS = Object.values(THEME_PRESETS).map(p => ({
  value: p.id,
  label: p.name,
  type: p.type,
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/lib/__tests__/app-themes.test.ts --dir src/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-themes.ts src/lib/__tests__/app-themes.test.ts
git commit -m "feat(themes): add AppTheme type and 12 built-in preset definitions"
```

---

### Task 2: Theme Resolution Engine

**Files:**
- Create: `src/lib/app-theme-engine.ts`
- Test: `src/lib/__tests__/app-theme-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/__tests__/app-theme-engine.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { resolveTheme, applyAppTheme } from '../app-theme-engine'
import { THEME_PRESETS } from '../app-themes'

// HSL-component format: "H S% L%" (no hsl() wrapper)
const HSL_COMPONENT_RE = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/

describe('resolveTheme', () => {
  it('returns an object with all required CSS variable keys', () => {
    const vars = resolveTheme(THEME_PRESETS['dracula'])
    const requiredKeys = [
      '--background', '--foreground',
      '--card', '--card-foreground',
      '--popover', '--popover-foreground',
      '--primary', '--primary-foreground',
      '--secondary', '--secondary-foreground',
      '--muted', '--muted-foreground',
      '--accent', '--accent-foreground',
      '--destructive', '--destructive-foreground',
      '--success', '--success-foreground',
      '--warning', '--warning-foreground',
      '--link',
      '--border', '--input', '--ring',
      '--sidebar-background', '--sidebar-foreground',
      '--sidebar-primary', '--sidebar-primary-foreground',
      '--sidebar-accent', '--sidebar-accent-foreground',
      '--sidebar-border', '--sidebar-ring',
      '--sidebar-active', '--sidebar-active-foreground',
      '--scrollbar-thumb', '--scrollbar-thumb-active', '--scrollbar-track',
    ]
    for (const key of requiredKeys) {
      expect(vars).toHaveProperty(key)
    }
  })

  it('outputs HSL-component format strings (not hex)', () => {
    const vars = resolveTheme(THEME_PRESETS['dracula'])
    for (const [key, value] of Object.entries(vars)) {
      expect(value, `${key} should be HSL-component format`).toMatch(HSL_COMPONENT_RE)
    }
  })

  it('produces different values for light vs dark themes', () => {
    const lightVars = resolveTheme(THEME_PRESETS['commander'])
    const darkVars = resolveTheme(THEME_PRESETS['commander-dark'])
    expect(lightVars['--background']).not.toBe(darkVars['--background'])
  })

  it('works for all 12 built-in presets without throwing', () => {
    for (const preset of Object.values(THEME_PRESETS)) {
      expect(() => resolveTheme(preset)).not.toThrow()
    }
  })

  it('higher contrast pushes muted-foreground further from background', () => {
    const lowContrast = { ...THEME_PRESETS['dracula'], contrast: 20 }
    const highContrast = { ...THEME_PRESETS['dracula'], contrast: 80 }
    const lowVars = resolveTheme(lowContrast)
    const highVars = resolveTheme(highContrast)
    // Parse lightness from muted-foreground
    const lowL = parseFloat(lowVars['--muted-foreground'].split(' ')[2])
    const highL = parseFloat(highVars['--muted-foreground'].split(' ')[2])
    // For dark theme, higher contrast = higher lightness for muted fg
    expect(highL).toBeGreaterThan(lowL)
  })
})

describe('applyAppTheme', () => {
  beforeEach(() => {
    // Reset all CSS vars
    const root = document.documentElement
    root.removeAttribute('style')
    root.classList.remove('dark', 'force-light')
  })

  it('sets CSS variables on document.documentElement', () => {
    const theme = THEME_PRESETS['dracula']
    const vars = resolveTheme(theme)
    applyAppTheme(vars, theme.fonts, theme.type)
    const root = document.documentElement
    expect(root.style.getPropertyValue('--background')).toBeTruthy()
    expect(root.style.getPropertyValue('--foreground')).toBeTruthy()
  })

  it('adds .dark class for dark themes', () => {
    const theme = THEME_PRESETS['dracula']
    const vars = resolveTheme(theme)
    applyAppTheme(vars, theme.fonts, theme.type)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes .dark class for light themes', () => {
    document.documentElement.classList.add('dark')
    const theme = THEME_PRESETS['commander']
    const vars = resolveTheme(theme)
    applyAppTheme(vars, theme.fonts, theme.type)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('sets --code-font CSS variable', () => {
    const theme = THEME_PRESETS['dracula']
    const vars = resolveTheme(theme)
    applyAppTheme(vars, theme.fonts, theme.type)
    expect(document.documentElement.style.getPropertyValue('--code-font')).toBe(theme.fonts.code)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/lib/__tests__/app-theme-engine.test.ts --dir src/`
Expected: FAIL — module `../app-theme-engine` not found

- [ ] **Step 3: Implement the theme resolution engine**

```typescript
// src/lib/app-theme-engine.ts
import type { AppTheme } from './app-themes'

// ── Hex → HSL conversion ──

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return [h * 360, s * 100, l * 100]
}

function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return rgbToHsl(r, g, b)
}

function hslToString(h: number, s: number, l: number): string {
  return `${Math.round(h * 10) / 10} ${Math.round(s * 10) / 10}% ${Math.round(l * 10) / 10}%`
}

// ── Lightness shift helpers ──

function shiftLightness(hsl: [number, number, number], delta: number): [number, number, number] {
  return [hsl[0], hsl[1], Math.max(0, Math.min(100, hsl[2] + delta))]
}

function mixLightness(
  a: [number, number, number],
  b: [number, number, number],
  t: number, // 0 = all a, 1 = all b
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function reduceSaturation(hsl: [number, number, number], factor: number): [number, number, number] {
  return [hsl[0], hsl[1] * factor, hsl[2]]
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

// ── Main resolver ──

export function resolveTheme(theme: AppTheme): Record<string, string> {
  const isDark = theme.type === 'dark'
  const contrastFactor = theme.contrast / 100 // 0-1

  const bg = hexToHsl(theme.colors.background)
  const fg = hexToHsl(theme.colors.foreground)
  const accent = hexToHsl(theme.colors.accent)

  // Direction: dark themes shift layers UP in lightness, light themes shift DOWN
  const dir = isDark ? 1 : -1

  // Scale shifts by contrast (higher contrast = more separation)
  const s = (base: number) => base * (0.5 + contrastFactor * 0.5)

  // Surface layers
  const card = shiftLightness(bg, dir * s(2))
  const popover = shiftLightness(bg, dir * s(2))
  const sidebarBg = shiftLightness(bg, dir * s(4))
  const muted = shiftLightness(bg, dir * s(6))
  const secondary = shiftLightness(bg, dir * s(6))
  const accentBg = shiftLightness(bg, dir * s(6))

  // Borders — midpoint biased 70% toward bg
  const border = mixLightness(bg, fg, 0.15 + contrastFactor * 0.1)
  const input = mixLightness(bg, fg, 0.18 + contrastFactor * 0.1)

  // Text layers
  const mutedFg = reduceSaturation(mixLightness(fg, bg, 0.35 - contrastFactor * 0.15), 0.6)

  // Accent derivatives
  const accentLum = luminance(theme.colors.accent)
  const primaryFg = accentLum > 0.4
    ? [bg[0], bg[1], isDark ? 10 : 95] as [number, number, number]
    : [0, 0, isDark ? 98 : 98] as [number, number, number]
  const ring = [accent[0], accent[1] * 0.7, accent[2]] as [number, number, number]
  const link = shiftLightness(accent, isDark ? 10 : -10)
  const sidebarActive = mixLightness(accent, bg, 0.75)

  // Semantic colors — adapt lightness to background
  const semanticL = isDark ? 45 + contrastFactor * 15 : 40 - contrastFactor * 10
  const destructive: [number, number, number] = [0, 72, semanticL]
  const success: [number, number, number] = [142, 70, semanticL]
  const warning: [number, number, number] = [38, 92, semanticL + 5]
  const semanticFg: [number, number, number] = [0, 0, 98]

  // Scrollbar
  const scrollThumb = mixLightness(fg, bg, 0.7)
  const scrollThumbActive = mixLightness(fg, bg, 0.5)
  const scrollTrack = shiftLightness(bg, dir * 2)

  const v = (hsl: [number, number, number]) => hslToString(...hsl)

  return {
    '--background': v(bg),
    '--foreground': v(fg),
    '--card': v(card),
    '--card-foreground': v(fg),
    '--popover': v(popover),
    '--popover-foreground': v(fg),
    '--primary': v(accent),
    '--primary-foreground': v(primaryFg),
    '--secondary': v(secondary),
    '--secondary-foreground': v(fg),
    '--muted': v(muted),
    '--muted-foreground': v(mutedFg),
    '--accent': v(accentBg),
    '--accent-foreground': v(fg),
    '--destructive': v(destructive),
    '--destructive-foreground': v(semanticFg),
    '--success': v(success),
    '--success-foreground': v(semanticFg),
    '--warning': v(warning),
    '--warning-foreground': v(semanticFg),
    '--link': v(link),
    '--border': v(border),
    '--input': v(input),
    '--ring': v(ring),
    '--sidebar-background': v(sidebarBg),
    '--sidebar-foreground': v(shiftLightness(fg, isDark ? -5 : 5)),
    '--sidebar-primary': v(accent),
    '--sidebar-primary-foreground': v(primaryFg),
    '--sidebar-accent': v(shiftLightness(bg, dir * s(6))),
    '--sidebar-accent-foreground': v(fg),
    '--sidebar-border': v(border),
    '--sidebar-ring': v(ring),
    '--sidebar-active': v(sidebarActive),
    '--sidebar-active-foreground': v(fg),
    '--scrollbar-thumb': v(scrollThumb),
    '--scrollbar-thumb-active': v(scrollThumbActive),
    '--scrollbar-track': v(scrollTrack),
  }
}

// ── Apply to DOM ──

export function applyAppTheme(
  vars: Record<string, string>,
  fonts: AppTheme['fonts'],
  type: 'light' | 'dark',
): void {
  const root = document.documentElement

  // Set all CSS variables
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }

  // Set font variables
  document.body.style.fontFamily = fonts.ui
  root.style.setProperty('--code-font', fonts.code)

  // Toggle dark class
  if (type === 'dark') {
    root.classList.add('dark')
    root.classList.remove('force-light')
  } else {
    root.classList.remove('dark')
    root.classList.remove('force-light')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/lib/__tests__/app-theme-engine.test.ts --dir src/`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/app-theme-engine.ts src/lib/__tests__/app-theme-engine.test.ts
git commit -m "feat(themes): add theme resolution engine with hex→HSL conversion"
```

---

## Chunk 2: Rust Backend

### Task 3: Theme Model (Rust)

**Files:**
- Create: `src-tauri/src/models/theme.rs`
- Modify: `src-tauri/src/models/mod.rs`

- [ ] **Step 1: Create the theme model**

```rust
// src-tauri/src/models/theme.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeColors {
    pub accent: String,
    pub background: String,
    pub foreground: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeFonts {
    #[serde(default = "default_ui_font")]
    pub ui: String,
    #[serde(default = "default_code_font")]
    pub code: String,
}

fn default_ui_font() -> String {
    "-apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, sans-serif".to_string()
}

fn default_code_font() -> String {
    "ui-monospace, \"SFMono-Regular\", \"SF Mono\", Menlo, monospace".to_string()
}

impl Default for ThemeFonts {
    fn default() -> Self {
        Self {
            ui: default_ui_font(),
            code: default_code_font(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppTheme {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub theme_type: String, // "light" | "dark"
    #[serde(default)]
    pub built_in: bool,
    pub colors: ThemeColors,
    #[serde(default)]
    pub fonts: ThemeFonts,
    #[serde(default)]
    pub translucent_sidebar: bool,
    #[serde(default = "default_contrast")]
    pub contrast: u8,
}

fn default_contrast() -> u8 {
    50
}
```

- [ ] **Step 2: Register module in mod.rs**

Add to `src-tauri/src/models/mod.rs` after line 14 (`pub mod docs;`):
```rust
pub mod theme;
```

- [ ] **Step 3: Verify compilation**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check`
Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/models/theme.rs src-tauri/src/models/mod.rs
git commit -m "feat(themes): add AppTheme Rust model with serde support"
```

---

### Task 4: Theme Service (Rust File I/O)

**Files:**
- Create: `src-tauri/src/services/theme_service.rs`
- Create: `src-tauri/src/tests/services/theme_service.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Modify: `src-tauri/src/tests/services/mod.rs`

- [ ] **Step 1: Write the failing tests**

```rust
// src-tauri/src/tests/services/theme_service.rs
#[cfg(test)]
mod tests {
    use crate::models::theme::AppTheme;
    use crate::services::theme_service;
    use tempfile::TempDir;

    fn sample_theme() -> AppTheme {
        AppTheme {
            id: "my-custom".to_string(),
            name: "My Custom".to_string(),
            theme_type: "dark".to_string(),
            built_in: false,
            colors: crate::models::theme::ThemeColors {
                accent: "#BD93F9".to_string(),
                background: "#282A36".to_string(),
                foreground: "#F8F8F2".to_string(),
            },
            fonts: Default::default(),
            translucent_sidebar: false,
            contrast: 50,
        }
    }

    #[test]
    fn save_and_list_custom_theme() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        theme_service::save_custom_theme_to_dir(&dir, &sample_theme()).unwrap();

        let themes = theme_service::list_custom_themes_from_dir(&dir).unwrap();
        assert_eq!(themes.len(), 1);
        assert_eq!(themes[0].id, "my-custom");
        assert_eq!(themes[0].name, "My Custom");
    }

    #[test]
    fn delete_custom_theme() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        theme_service::save_custom_theme_to_dir(&dir, &sample_theme()).unwrap();
        theme_service::delete_custom_theme_from_dir(&dir, "my-custom").unwrap();

        let themes = theme_service::list_custom_themes_from_dir(&dir).unwrap();
        assert_eq!(themes.len(), 0);
    }

    #[test]
    fn delete_nonexistent_theme_returns_error() {
        let tmp = TempDir::new().unwrap();
        let dir = tmp.path().to_path_buf();

        let result = theme_service::delete_custom_theme_from_dir(&dir, "nope");
        assert!(result.is_err());
    }

    #[test]
    fn import_valid_theme_file() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("import-me.json");
        let theme = sample_theme();
        let json = serde_json::to_string_pretty(&theme).unwrap();
        std::fs::write(&file_path, json).unwrap();

        let imported = theme_service::import_theme_from_path(file_path.to_str().unwrap()).unwrap();
        assert_eq!(imported.id, "my-custom");
        assert!(!imported.built_in); // always false on import
    }

    #[test]
    fn import_malformed_json_returns_error() {
        let tmp = TempDir::new().unwrap();
        let file_path = tmp.path().join("bad.json");
        std::fs::write(&file_path, "{ not valid json }").unwrap();

        let result = theme_service::import_theme_from_path(file_path.to_str().unwrap());
        assert!(result.is_err());
    }

    #[test]
    fn validate_theme_id_rejects_invalid_chars() {
        assert!(theme_service::validate_theme_id("good-id-123").is_ok());
        assert!(theme_service::validate_theme_id("Bad Id!").is_err());
        assert!(theme_service::validate_theme_id("").is_err());
    }

    #[test]
    fn validate_hex_color() {
        assert!(theme_service::validate_hex_color("#AABBCC").is_ok());
        assert!(theme_service::validate_hex_color("#abc").is_err());
        assert!(theme_service::validate_hex_color("not-hex").is_err());
    }
}
```

- [ ] **Step 2: Register test module**

Add to `src-tauri/src/tests/services/mod.rs`:
```rust
pub mod theme_service;
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test tests::services::theme_service`
Expected: FAIL — module not found

- [ ] **Step 4: Implement the theme service**

```rust
// src-tauri/src/services/theme_service.rs
use std::fs;
use std::path::PathBuf;

use crate::models::theme::AppTheme;

const BUILTIN_IDS: &[&str] = &[
    "commander", "commander-dark",
    "dracula", "one-dark", "tokyo-night", "catppuccin-mocha", "nord",
    "github-light", "solarized-light", "catppuccin-latte", "one-light", "nord-light",
];

/// Regex: only lowercase alphanumeric and hyphens, 1-64 chars
pub fn validate_theme_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 64 {
        return Err("Theme ID must be 1-64 characters".to_string());
    }
    if !id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-') {
        return Err("Theme ID must contain only lowercase letters, digits, and hyphens".to_string());
    }
    Ok(())
}

pub fn validate_hex_color(hex: &str) -> Result<(), String> {
    if hex.len() != 7 || !hex.starts_with('#') {
        return Err(format!("Invalid hex color: {}", hex));
    }
    if !hex[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("Invalid hex color: {}", hex));
    }
    Ok(())
}

fn validate_theme(theme: &AppTheme) -> Result<(), String> {
    validate_theme_id(&theme.id)?;
    validate_hex_color(&theme.colors.accent)?;
    validate_hex_color(&theme.colors.background)?;
    validate_hex_color(&theme.colors.foreground)?;
    if theme.contrast > 100 {
        return Err("Contrast must be 0-100".to_string());
    }
    Ok(())
}

fn themes_dir() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "Could not determine user home directory".to_string())?;
    let dir = home.join(".commander").join("themes");
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create themes directory: {}", e))?;
    }
    Ok(dir)
}

pub fn list_custom_themes_from_dir(dir: &PathBuf) -> Result<Vec<AppTheme>, String> {
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut themes = Vec::new();
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read themes directory: {}", e))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("json") {
            let content = fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
            if let Ok(mut theme) = serde_json::from_str::<AppTheme>(&content) {
                theme.built_in = false;
                themes.push(theme);
            }
        }
    }
    Ok(themes)
}

pub fn save_custom_theme_to_dir(dir: &PathBuf, theme: &AppTheme) -> Result<(), String> {
    validate_theme(theme)?;
    if BUILTIN_IDS.contains(&theme.id.as_str()) {
        return Err(format!("Cannot overwrite built-in theme: {}", theme.id));
    }
    if !dir.exists() {
        fs::create_dir_all(dir)
            .map_err(|e| format!("Failed to create themes directory: {}", e))?;
    }
    let path = dir.join(format!("{}.json", theme.id));
    let json = serde_json::to_string_pretty(theme)
        .map_err(|e| format!("Failed to serialize theme: {}", e))?;
    fs::write(&path, json)
        .map_err(|e| format!("Failed to write theme file: {}", e))?;
    Ok(())
}

pub fn delete_custom_theme_from_dir(dir: &PathBuf, theme_id: &str) -> Result<(), String> {
    let path = dir.join(format!("{}.json", theme_id));
    if !path.exists() {
        return Err(format!("Theme not found: {}", theme_id));
    }
    fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete theme: {}", e))?;
    Ok(())
}

pub fn import_theme_from_path(path: &str) -> Result<AppTheme, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read theme file: {}", e))?;
    let mut theme: AppTheme = serde_json::from_str(&content)
        .map_err(|e| format!("Invalid theme JSON: {}", e))?;
    theme.built_in = false;
    validate_theme(&theme)?;
    Ok(theme)
}

// Public API using default themes_dir()
pub fn list_custom_themes() -> Result<Vec<AppTheme>, String> {
    list_custom_themes_from_dir(&themes_dir()?)
}

pub fn save_custom_theme(theme: &AppTheme) -> Result<(), String> {
    save_custom_theme_to_dir(&themes_dir()?, theme)
}

pub fn delete_custom_theme(theme_id: &str) -> Result<(), String> {
    delete_custom_theme_from_dir(&themes_dir()?, theme_id)
}
```

- [ ] **Step 5: Register service module**

Add to `src-tauri/src/services/mod.rs` after line 17 (`pub mod docs_service;`):
```rust
pub mod theme_service;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test tests::services::theme_service`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/services/theme_service.rs src-tauri/src/services/mod.rs src-tauri/src/tests/services/theme_service.rs src-tauri/src/tests/services/mod.rs
git commit -m "feat(themes): add Rust theme service with file I/O and validation"
```

---

### Task 5: Theme Commands + AppSettings Update

**Files:**
- Create: `src-tauri/src/commands/theme_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/models/project.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add theme ID fields to AppSettings**

In `src-tauri/src/models/project.rs`, add after the `show_onboarding_on_start` field (line 82):

```rust
    #[serde(default = "default_light_theme_id")]
    /// Active light theme preset ID
    pub light_theme_id: String,
    #[serde(default = "default_dark_theme_id")]
    /// Active dark theme preset ID
    pub dark_theme_id: String,
```

Add default functions after `default_show_onboarding_on_start` (line 160):

```rust
fn default_light_theme_id() -> String { "commander".to_string() }
fn default_dark_theme_id() -> String { "commander-dark".to_string() }
```

Update `impl Default for AppSettings` to include:

```rust
            light_theme_id: default_light_theme_id(),
            dark_theme_id: default_dark_theme_id(),
```

- [ ] **Step 2: Create theme commands**

```rust
// src-tauri/src/commands/theme_commands.rs
use crate::models::theme::AppTheme;
use crate::services::theme_service;

#[tauri::command]
pub async fn list_custom_themes() -> Result<Vec<AppTheme>, String> {
    theme_service::list_custom_themes()
}

#[tauri::command]
pub async fn save_custom_theme(theme: AppTheme) -> Result<(), String> {
    theme_service::save_custom_theme(&theme)
}

#[tauri::command]
pub async fn delete_custom_theme(theme_id: String) -> Result<(), String> {
    theme_service::delete_custom_theme(&theme_id)
}

#[tauri::command]
pub async fn import_theme(path: String) -> Result<AppTheme, String> {
    theme_service::import_theme_from_path(&path)
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn set_sidebar_vibrancy(
    enabled: bool,
    window: tauri::Window,
) -> Result<(), String> {
    use tauri::Emitter;
    // Emit event so frontend can adjust sidebar background opacity
    window.emit("sidebar-vibrancy-changed", enabled)
        .map_err(|e| format!("Failed to emit vibrancy event: {}", e))?;
    // Note: actual NSVisualEffectView integration requires window-vibrancy crate
    // For now, we toggle via CSS — full native vibrancy is a follow-up
    Ok(())
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn set_sidebar_vibrancy(
    _enabled: bool,
    _window: tauri::Window,
) -> Result<(), String> {
    Ok(()) // No-op on non-macOS
}
```

- [ ] **Step 3: Register commands in mod.rs**

Add to `src-tauri/src/commands/mod.rs` after `pub mod docs_commands;` (line 18):

```rust
pub mod theme_commands;
```

Add after `pub use docs_commands::*;` (line 37):

```rust
pub use theme_commands::*;
```

- [ ] **Step 4: Register commands in lib.rs**

Add these 5 commands to the `invoke_handler!` in `src-tauri/src/lib.rs`, before the closing `])` (before line 380):

```rust
            list_custom_themes,
            save_custom_theme,
            delete_custom_theme,
            import_theme,
            set_sidebar_vibrancy,
```

- [ ] **Step 5: Verify compilation**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check`
Expected: compiles without errors

- [ ] **Step 6: Run full test suite to check no regressions**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: ALL existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/commands/theme_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/models/project.rs src-tauri/src/lib.rs
git commit -m "feat(themes): add Tauri commands and light/dark theme ID settings"
```

---

## Chunk 3: Frontend Integration

### Task 6: Update TypeScript Types

**Files:**
- Modify: `src/types/settings.ts`

- [ ] **Step 1: Add theme fields to AppSettings interface**

In `src/types/settings.ts`, add to `AppSettings` interface after `chat_history_style` (line 41):

```typescript
  light_theme_id?: string;
  dark_theme_id?: string;
```

- [ ] **Step 2: Expand AppearanceSettingsProps**

In `src/types/settings.ts`, add to `AppearanceSettingsProps` interface after `onChatHistoryStyleChange` (line 206):

```typescript
  // Theme preset controls
  tempLightThemeId?: string;
  onLightThemeIdChange?: (id: string) => void;
  tempDarkThemeId?: string;
  onDarkThemeIdChange?: (id: string) => void;
  tempLightThemeOverrides?: Partial<import('@/lib/app-themes').AppTheme>;
  onLightThemeOverrideChange?: (key: string, value: unknown) => void;
  tempDarkThemeOverrides?: Partial<import('@/lib/app-themes').AppTheme>;
  onDarkThemeOverrideChange?: (key: string, value: unknown) => void;
  customThemes?: import('@/lib/app-themes').AppTheme[];
  onSaveCustomTheme?: (theme: import('@/lib/app-themes').AppTheme) => Promise<void>;
  onDeleteCustomTheme?: (id: string) => Promise<void>;
  onImportTheme?: () => Promise<void>;
  onCopyTheme?: (theme: import('@/lib/app-themes').AppTheme) => void;
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx tsc --noEmit`
Expected: No type errors (or only pre-existing ones)

- [ ] **Step 4: Commit**

```bash
git add src/types/settings.ts
git commit -m "feat(themes): add theme fields to TypeScript settings types"
```

---

### Task 7: Settings Context — Theme Application

**Files:**
- Modify: `src/contexts/settings-context.tsx`

- [ ] **Step 1: Add imports**

Add at the top of `src/contexts/settings-context.tsx` (after line 3):

```typescript
import { THEME_PRESETS } from '@/lib/app-themes'
import { resolveTheme, applyAppTheme } from '@/lib/app-theme-engine'
```

- [ ] **Step 2: Add theme fields to context's AppSettings interface and defaults**

In the local `AppSettings` interface (around line 23-43), add:

```typescript
  light_theme_id?: string;
  dark_theme_id?: string;
```

Also update the `defaultSettings` constant (the object passed to `useState<AppSettings>()`) to include:

```typescript
  light_theme_id: 'commander',
  dark_theme_id: 'commander-dark',
```

This ensures the fallback when settings fail to load still applies the correct default themes.

- [ ] **Step 3: Remove existing dark-class useEffect (conflict prevention)**

The existing `useEffect` (lines 135-163 of `settings-context.tsx`) adds/removes `.dark` and `.force-light` classes based on `ui_theme`. The new `applyAppTheme()` also manages these classes. Having both would cause a race condition where the `useEffect` (runs after paint) overrides the `useLayoutEffect` (runs before paint).

**Remove the entire useEffect block** that starts with `const applyTheme = (theme: string | undefined) => {` (lines 135-163). The new `useLayoutEffect` below replaces it entirely — it calls `applyAppTheme()` which handles dark/force-light class management.

Also remove the `set_window_theme` useEffect (lines 166-172) — the new effect will call it.

- [ ] **Step 4: Add theme application effect**

After the existing `applyDashboardPalette` useLayoutEffect (around line 190), add a new useLayoutEffect:

```typescript
  // Apply app theme based on active mode (light_theme_id / dark_theme_id)
  // This REPLACES the old useEffect that toggled .dark/.force-light classes,
  // and also handles the native window theme that was in a separate useEffect.
  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    const mode = settings.ui_theme || 'auto';
    const lightId = settings.light_theme_id || 'commander';
    const darkId = settings.dark_theme_id || 'commander-dark';

    const applyActiveTheme = () => {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = mode === 'dark' || (mode === 'auto' && prefersDark);
      const themeId = isDark ? darkId : lightId;
      const theme = THEME_PRESETS[themeId] || THEME_PRESETS[isDark ? 'commander-dark' : 'commander'];
      const vars = resolveTheme(theme);
      applyAppTheme(vars, theme.fonts, theme.type);

      // Also inform native window about theme
      import('@tauri-apps/api/core').then(({ invoke }) => {
        invoke('set_window_theme', { theme: mode }).catch(() => {});
      }).catch(() => {});
    };

    applyActiveTheme();

    if (mode === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyActiveTheme();
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, [settings.ui_theme, settings.light_theme_id, settings.dark_theme_id]);
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Run existing settings tests**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run src/contexts/__tests__/ --dir src/`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/contexts/settings-context.tsx
git commit -m "feat(themes): apply active theme via settings context"
```

---

### Task 8: AppearanceSettings UI — Theme Panels

**Files:**
- Modify: `src/components/settings/AppearanceSettings.tsx`

- [ ] **Step 1: Add theme panel imports and props**

At the top of `AppearanceSettings.tsx`, add:

```typescript
import { THEME_PRESETS, THEME_OPTIONS } from '@/lib/app-themes'
import { resolveTheme, applyAppTheme } from '@/lib/app-theme-engine'
```

Update the destructured props to include the new theme props from `AppearanceSettingsProps`.

- [ ] **Step 2: Add ThemePanel helper component and dual panels**

Add a `ThemePanel` internal component and render two instances (light + dark) at the top of the component's return JSX, before the existing "App Theme" mode selector section.

```tsx
// Inside AppearanceSettings, before the return statement:

const isMacOS = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)

function ThemePanel({
  label,
  type,
  themeId,
  onThemeIdChange,
  overrides,
  onOverrideChange,
}: {
  label: string
  type: 'light' | 'dark'
  themeId?: string
  onThemeIdChange?: (id: string) => void
  overrides?: Partial<AppTheme>
  onOverrideChange?: (key: string, value: unknown) => void
}) {
  const filteredOptions = THEME_OPTIONS.filter(o => o.type === type)
  const baseTheme = THEME_PRESETS[themeId || (type === 'dark' ? 'commander-dark' : 'commander')]
  const currentColors = overrides?.colors || baseTheme?.colors || { accent: '#000000', background: '#FFFFFF', foreground: '#000000' }
  const currentFonts = overrides?.fonts || baseTheme?.fonts || { ui: '', code: '' }
  const currentContrast = overrides?.contrast ?? baseTheme?.contrast ?? 50

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{label}</h4>

      {/* Preset dropdown */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Preset</Label>
        <Select value={themeId || ''} onValueChange={v => onThemeIdChange?.(v)}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select preset..." />
          </SelectTrigger>
          <SelectContent>
            {filteredOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full border border-black/10 dark:border-white/10"
                    style={{ backgroundColor: THEME_PRESETS[opt.value]?.colors.accent }}
                  />
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Color inputs */}
      {(['accent', 'background', 'foreground'] as const).map(colorKey => (
        <div key={colorKey} className="space-y-1">
          <Label className="text-xs text-muted-foreground capitalize">{colorKey}</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={currentColors[colorKey]}
              onChange={e => onOverrideChange?.(`colors.${colorKey}`, e.target.value)}
              className="h-8 w-8 rounded border border-input cursor-pointer"
            />
            <Input
              className="h-8 font-mono text-xs"
              value={currentColors[colorKey]}
              onChange={e => onOverrideChange?.(`colors.${colorKey}`, e.target.value)}
              placeholder="#000000"
            />
          </div>
        </div>
      ))}

      {/* Font inputs */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">UI Font</Label>
        <Input
          className="h-8 text-xs"
          value={currentFonts.ui}
          onChange={e => onOverrideChange?.('fonts.ui', e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Code Font</Label>
        <Input
          className="h-8 text-xs font-mono"
          value={currentFonts.code}
          onChange={e => onOverrideChange?.('fonts.code', e.target.value)}
        />
      </div>

      {/* Contrast slider */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Contrast: {currentContrast}</Label>
        <input
          type="range"
          min={0}
          max={100}
          value={currentContrast}
          onChange={e => onOverrideChange?.('contrast', Number(e.target.value))}
          className="w-full"
        />
      </div>

      {/* Translucent sidebar (macOS only) */}
      {isMacOS && (
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground">Translucent Sidebar</Label>
          <Switch
            checked={overrides?.translucentSidebar ?? baseTheme?.translucentSidebar ?? false}
            onCheckedChange={v => onOverrideChange?.('translucentSidebar', v)}
          />
        </div>
      )}
    </div>
  )
}

// In the return JSX, at the top before existing "App Theme" section:
{/* Theme Presets */}
<div className="space-y-4">
  <h3 className="text-sm font-semibold">Theme Presets</h3>
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
    <ThemePanel
      label="Light Theme"
      type="light"
      themeId={tempLightThemeId}
      onThemeIdChange={onLightThemeIdChange}
      overrides={tempLightThemeOverrides}
      onOverrideChange={onLightThemeOverrideChange}
    />
    <ThemePanel
      label="Dark Theme"
      type="dark"
      themeId={tempDarkThemeId}
      onThemeIdChange={onDarkThemeIdChange}
      overrides={tempDarkThemeOverrides}
      onOverrideChange={onDarkThemeOverrideChange}
    />
  </div>
</div>
<Separator />
```

Import `Switch` from `@/components/ui/switch` if not already imported. Import `Separator` from `@/components/ui/separator`.

- [ ] **Step 3: Add live preview effect**

Inside the component, add a `useEffect` that runs `resolveTheme()` + `applyAppTheme()` when any temp theme override changes:

```typescript
useEffect(() => {
  // Determine which theme is currently active based on mode
  const isDark = tempUiTheme === 'dark' ||
    (tempUiTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const activeId = isDark ? tempDarkThemeId : tempLightThemeId
  const baseTheme = THEME_PRESETS[activeId || (isDark ? 'commander-dark' : 'commander')]
  if (!baseTheme) return

  // Merge overrides
  const overrides = isDark ? tempDarkThemeOverrides : tempLightThemeOverrides
  const theme = overrides ? { ...baseTheme, ...overrides } : baseTheme

  const vars = resolveTheme(theme)
  applyAppTheme(vars, theme.fonts, theme.type)
}, [tempLightThemeId, tempDarkThemeId, tempLightThemeOverrides, tempDarkThemeOverrides, tempUiTheme])
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/AppearanceSettings.tsx
git commit -m "feat(themes): add dual light/dark theme panels to AppearanceSettings"
```

---

### Task 9: SettingsModal Wiring

**Files:**
- Modify: `src/components/SettingsModal.tsx`

- [ ] **Step 1: Add state pairs for theme IDs, overrides, and custom themes**

In SettingsModal, after the existing `tempUiTheme` state (around line 114), add:

```typescript
import type { AppTheme } from '@/lib/app-themes'

const [lightThemeId, setLightThemeId] = useState('commander')
const [tempLightThemeId, setTempLightThemeId] = useState('commander')
const [darkThemeId, setDarkThemeId] = useState('commander-dark')
const [tempDarkThemeId, setTempDarkThemeId] = useState('commander-dark')
const [tempLightThemeOverrides, setTempLightThemeOverrides] = useState<Partial<AppTheme> | undefined>()
const [tempDarkThemeOverrides, setTempDarkThemeOverrides] = useState<Partial<AppTheme> | undefined>()
const [customThemes, setCustomThemes] = useState<AppTheme[]>([])
```

Add override change handlers:

```typescript
const handleLightThemeOverrideChange = (key: string, value: unknown) => {
  setTempLightThemeOverrides(prev => {
    const next = { ...prev } as Record<string, unknown>
    // Handle nested keys like "colors.accent"
    const parts = key.split('.')
    if (parts.length === 2) {
      const [group, field] = parts
      next[group] = { ...(next[group] as Record<string, unknown> || {}), [field]: value }
    } else {
      next[key] = value
    }
    return next as Partial<AppTheme>
  })
}

const handleDarkThemeOverrideChange = (key: string, value: unknown) => {
  setTempDarkThemeOverrides(prev => {
    const next = { ...prev } as Record<string, unknown>
    const parts = key.split('.')
    if (parts.length === 2) {
      const [group, field] = parts
      next[group] = { ...(next[group] as Record<string, unknown> || {}), [field]: value }
    } else {
      next[key] = value
    }
    return next as Partial<AppTheme>
  })
}
```

Add custom theme CRUD handlers:

```typescript
const handleSaveCustomTheme = async (theme: AppTheme) => {
  await invoke('save_custom_theme', { theme })
  const themes = await invoke<AppTheme[]>('list_custom_themes')
  setCustomThemes(themes)
}

const handleDeleteCustomTheme = async (id: string) => {
  await invoke('delete_custom_theme', { themeId: id })
  const themes = await invoke<AppTheme[]>('list_custom_themes')
  setCustomThemes(themes)
}

const handleImportTheme = async () => {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const path = await open({ filters: [{ name: 'JSON', extensions: ['json'] }] })
  if (path) {
    await invoke('import_theme', { path })
    const themes = await invoke<AppTheme[]>('list_custom_themes')
    setCustomThemes(themes)
  }
}

const handleCopyTheme = (theme: AppTheme) => {
  navigator.clipboard.writeText(JSON.stringify(theme, null, 2))
}
```

- [ ] **Step 2: Load custom themes and initialize IDs from settings**

In the settings load handler (where `tempUiTheme` is set from `appSettings`), add:

```typescript
const lightId = appSettings.light_theme_id || 'commander'
const darkId = appSettings.dark_theme_id || 'commander-dark'
setLightThemeId(lightId)
setTempLightThemeId(lightId)
setDarkThemeId(darkId)
setTempDarkThemeId(darkId)

// Load custom themes from ~/.commander/themes/
try {
  const themes = await invoke<AppTheme[]>('list_custom_themes')
  setCustomThemes(themes)
} catch (e) {
  console.error('Failed to load custom themes:', e)
}
```

When preset dropdown changes, clear overrides:

```typescript
// Reset overrides when switching presets
const handleLightThemeIdChange = (id: string) => {
  setTempLightThemeId(id)
  setTempLightThemeOverrides(undefined)
}
const handleDarkThemeIdChange = (id: string) => {
  setTempDarkThemeId(id)
  setTempDarkThemeOverrides(undefined)
}
```

- [ ] **Step 3: Add auto-save effect for theme IDs**

Following the pattern of the existing `tempUiTheme` auto-save effect, add:

```typescript
useEffect(() => {
  const saveThemeIds = async () => {
    if (!settingsHydrated) return
    if (tempLightThemeId === lightThemeId && tempDarkThemeId === darkThemeId) return
    try {
      await updateAppSettings({
        light_theme_id: tempLightThemeId,
        dark_theme_id: tempDarkThemeId,
      })
      setLightThemeId(tempLightThemeId)
      setDarkThemeId(tempDarkThemeId)
    } catch (e) {
      console.error('Failed to auto-save theme IDs:', e)
    }
  }
  saveThemeIds()
}, [tempLightThemeId, tempDarkThemeId, settingsHydrated])
```

- [ ] **Step 4: Pass new props to AppearanceSettings**

In the `{activeTab === 'appearance' && <AppearanceSettings ... />}` block, add:

```typescript
    tempLightThemeId={tempLightThemeId}
    onLightThemeIdChange={handleLightThemeIdChange}
    tempDarkThemeId={tempDarkThemeId}
    onDarkThemeIdChange={handleDarkThemeIdChange}
    tempLightThemeOverrides={tempLightThemeOverrides}
    onLightThemeOverrideChange={handleLightThemeOverrideChange}
    tempDarkThemeOverrides={tempDarkThemeOverrides}
    onDarkThemeOverrideChange={handleDarkThemeOverrideChange}
    customThemes={customThemes}
    onSaveCustomTheme={handleSaveCustomTheme}
    onDeleteCustomTheme={handleDeleteCustomTheme}
    onImportTheme={handleImportTheme}
    onCopyTheme={handleCopyTheme}
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsModal.tsx
git commit -m "feat(themes): wire theme state in SettingsModal"
```

---

## Chunk 4: Window Dimensions + Final Verification

### Task 10: Update Window Dimensions

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update window dimensions**

In `src-tauri/tauri.conf.json`, update the window configuration:
- Change `width` from `1280` to `1400`
- Change `height` from `800` to `860`
- Verify `center: true` is present

- [ ] **Step 2: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: update default window dimensions to 1400x860"
```

---

### Task 11: Full Verification

- [ ] **Step 1: Run all Rust tests**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo test`
Expected: ALL tests pass (existing + new theme tests)

- [ ] **Step 2: Run all frontend tests**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx vitest run --dir src/`
Expected: ALL tests pass (existing + new theme tests)

- [ ] **Step 3: Verify Rust compilation**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/src-tauri && cargo check`
Expected: No errors

- [ ] **Step 4: Verify Vite build**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && npx vite build`
Expected: Build succeeds

- [ ] **Step 5: Manual verification checklist**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander && bun tauri dev`

Verify:
1. App opens at 1400×860, centered
2. Settings → Appearance → Light Theme dropdown shows 6 light presets
3. Settings → Appearance → Dark Theme dropdown shows 6 dark presets
4. Selecting "Dracula" dark preset changes app colors immediately (live preview)
5. Selecting "GitHub Light" light preset changes app colors when in light mode
6. Mode selector (Auto/Light/Dark) switches between light and dark themes
7. Existing dashboard, sidebar, scrollbars look correct in all presets
8. Switching back to Commander/Commander Dark restores original appearance
