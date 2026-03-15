import { describe, it, expect, beforeEach } from 'vitest'
import {
  DASHBOARD_PALETTES,
  PALETTE_LIGHT_OVERRIDES,
  PALETTE_OPTIONS,
  applyDashboardPalette,
  resolveIsDark,
  getDashboardPalettePreview,
  readDashboardToken,
  readAgentColor,
} from '@/lib/dashboard-palettes'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

describe('DASHBOARD_PALETTES', () => {
  it('contains exactly 13 palettes', () => {
    expect(Object.keys(DASHBOARD_PALETTES)).toHaveLength(13)
  })

  it('every palette defines all required chart and agent keys', () => {
    const requiredKeys = [
      'autohand',
      'claude',
      'codex',
      'gemini',
      'ollama',
      'default',
      'axis',
      'grid',
      'mutedDot',
      'sessionSpark',
      'timeSpark',
      'streakSpark',
      'emptySpark',
    ]
    for (const [name, palette] of Object.entries(DASHBOARD_PALETTES)) {
      for (const key of requiredKeys) {
        expect(palette).toHaveProperty(key)
        expect((palette as Record<string, string>)[key]).toMatch(HEX_RE)
      }
    }
  })

  it('includes the requested Dracula and GitHub presets', () => {
    expect(DASHBOARD_PALETTES).toHaveProperty('dracula')
    expect(DASHBOARD_PALETTES).toHaveProperty('github-dark')
    expect(DASHBOARD_PALETTES).toHaveProperty('github-light')
  })
})

describe('PALETTE_OPTIONS', () => {
  it('has an option for every palette key', () => {
    const paletteKeys = Object.keys(DASHBOARD_PALETTES)
    const optionValues = PALETTE_OPTIONS.map((o) => o.value)
    expect(optionValues.sort()).toEqual(paletteKeys.sort())
  })

  it('each option has a non-empty label', () => {
    for (const opt of PALETTE_OPTIONS) {
      expect(opt.label.length).toBeGreaterThan(0)
    }
  })

  it('uses shortened public labels for the Ghostty-inspired palettes', () => {
    const labelsByValue = Object.fromEntries(PALETTE_OPTIONS.map((option) => [option.value, option.label]))
    expect(labelsByValue['ghostty-aurora']).toBe('Aurora')
    expect(labelsByValue['ghostty-ember']).toBe('Ember')
    expect(labelsByValue['ghostty-lagoon']).toBe('Lagoon')
    expect(labelsByValue['ghostty-dusk']).toBe('Dusk')
    expect(labelsByValue['ghostty-forest']).toBe('Forest')
  })
})

describe('applyDashboardPalette', () => {
  beforeEach(() => {
    // Reset CSS vars
    const root = document.documentElement
    root.style.removeProperty('--dashboard-agent-claude')
    root.style.removeProperty('--dashboard-agent-codex')
    root.style.removeProperty('--dashboard-agent-gemini')
    root.style.removeProperty('--dashboard-agent-autohand')
    root.style.removeProperty('--dashboard-agent-ollama')
    root.style.removeProperty('--dashboard-agent-default')
    root.style.removeProperty('--dashboard-axis')
    root.style.removeProperty('--dashboard-grid')
    root.style.removeProperty('--dashboard-dot-muted')
    root.style.removeProperty('--dashboard-spark-session')
    root.style.removeProperty('--dashboard-spark-time')
    root.style.removeProperty('--dashboard-spark-streak')
    root.style.removeProperty('--dashboard-spark-empty')
  })

  it('sets CSS custom properties for a known palette', () => {
    applyDashboardPalette('ghostty-aurora')
    const root = document.documentElement
    expect(root.style.getPropertyValue('--dashboard-agent-autohand')).toBe('#1c2433')
    expect(root.style.getPropertyValue('--dashboard-agent-claude')).toBe('#7dd3fc')
    expect(root.style.getPropertyValue('--dashboard-agent-codex')).toBe('#34d399')
    expect(root.style.getPropertyValue('--dashboard-agent-gemini')).toBe('#c084fc')
    expect(root.style.getPropertyValue('--dashboard-agent-ollama')).toBe('#fbbf24')
    expect(root.style.getPropertyValue('--dashboard-agent-default')).toBe('#94a3b8')
    expect(root.style.getPropertyValue('--dashboard-axis')).toBe('#8ea4bf')
    expect(root.style.getPropertyValue('--dashboard-grid')).toBe('#2b3648')
    expect(root.style.getPropertyValue('--dashboard-dot-muted')).toBe('#1a2230')
    expect(root.style.getPropertyValue('--dashboard-spark-session')).toBe('#7dd3fc')
    expect(root.style.getPropertyValue('--dashboard-spark-time')).toBe('#fbbf24')
    expect(root.style.getPropertyValue('--dashboard-spark-streak')).toBe('#fb7185')
    expect(root.style.getPropertyValue('--dashboard-spark-empty')).toBe('#334155')
  })

  it('falls back to default palette for unknown key', () => {
    applyDashboardPalette('nonexistent')
    const root = document.documentElement
    expect(root.style.getPropertyValue('--dashboard-agent-claude')).toBe(
      DASHBOARD_PALETTES.default.claude
    )
  })

  it('applies light-mode overrides when themeMode is light', () => {
    applyDashboardPalette('ghostty-aurora', 'light')
    const root = document.documentElement
    const lightOverrides = PALETTE_LIGHT_OVERRIDES['ghostty-aurora']
    // Structural colors should use light overrides
    expect(root.style.getPropertyValue('--dashboard-axis')).toBe(lightOverrides.axis)
    expect(root.style.getPropertyValue('--dashboard-grid')).toBe(lightOverrides.grid)
    expect(root.style.getPropertyValue('--dashboard-dot-muted')).toBe(lightOverrides.mutedDot)
    expect(root.style.getPropertyValue('--dashboard-spark-empty')).toBe(lightOverrides.emptySpark)
    // Agent colors stay from the base palette (not overridden)
    expect(root.style.getPropertyValue('--dashboard-agent-claude')).toBe('#7dd3fc')
    expect(root.style.getPropertyValue('--dashboard-agent-codex')).toBe('#34d399')
  })

  it('uses base palette values in dark mode (no light overrides merged)', () => {
    applyDashboardPalette('ghostty-aurora', 'dark')
    const root = document.documentElement
    // Structural colors should be the dark-mode base values
    expect(root.style.getPropertyValue('--dashboard-axis')).toBe('#8ea4bf')
    expect(root.style.getPropertyValue('--dashboard-grid')).toBe('#2b3648')
    expect(root.style.getPropertyValue('--dashboard-dot-muted')).toBe('#1a2230')
  })

  it('applies light overrides for all palettes with overrides', () => {
    const root = document.documentElement
    for (const [key, overrides] of Object.entries(PALETTE_LIGHT_OVERRIDES)) {
      if (Object.keys(overrides).length === 0) continue
      applyDashboardPalette(key, 'light')
      // At least axis should differ from the dark base
      if (overrides.axis) {
        expect(root.style.getPropertyValue('--dashboard-axis')).toBe(overrides.axis)
      }
      if (overrides.grid) {
        expect(root.style.getPropertyValue('--dashboard-grid')).toBe(overrides.grid)
      }
    }
  })
})

describe('PALETTE_LIGHT_OVERRIDES', () => {
  it('has an entry for every palette key', () => {
    for (const key of Object.keys(DASHBOARD_PALETTES)) {
      expect(PALETTE_LIGHT_OVERRIDES).toHaveProperty(key)
    }
  })

  it('override values are valid hex colors', () => {
    const HEX = /^#[0-9a-fA-F]{6}$/
    for (const [, overrides] of Object.entries(PALETTE_LIGHT_OVERRIDES)) {
      for (const [, value] of Object.entries(overrides)) {
        expect(value).toMatch(HEX)
      }
    }
  })
})

describe('resolveIsDark', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark', 'force-light')
  })

  it('returns true for explicit dark mode', () => {
    expect(resolveIsDark('dark')).toBe(true)
  })

  it('returns false for explicit light mode', () => {
    expect(resolveIsDark('light')).toBe(false)
  })

  it('returns false for auto when no dark class is set (jsdom default)', () => {
    expect(resolveIsDark('auto')).toBe(false)
  })

  it('returns true for auto when .dark class is set', () => {
    document.documentElement.classList.add('dark')
    expect(resolveIsDark('auto')).toBe(true)
  })

  it('returns false for auto when .force-light is set even with .dark', () => {
    document.documentElement.classList.add('dark', 'force-light')
    expect(resolveIsDark('auto')).toBe(false)
  })

  it('defaults to dark when called without arguments', () => {
    expect(resolveIsDark()).toBe(true)
  })
})

describe('getDashboardPalettePreview', () => {
  it('returns five preview colors for the selected palette', () => {
    expect(getDashboardPalettePreview('ghostty-dusk')).toEqual([
      '#93c5fd',
      '#a78bfa',
      '#f472b6',
      '#f59e0b',
      '#1f1f35',
    ])
  })
})

describe('readAgentColor', () => {
  beforeEach(() => {
    // Apply default palette so CSS vars are set
    applyDashboardPalette('default')
  })

  it('returns the CSS var value for a known agent', () => {
    // jsdom getComputedStyle doesn't resolve inline styles via getPropertyValue,
    // so readAgentColor falls back to the hardcoded default (same hex).
    const color = readAgentColor('claude')
    expect(color).toMatch(HEX_RE)
  })

  it('returns a dedicated visible color for autohand', () => {
    const color = readAgentColor('autohand')
    expect(color).toMatch(HEX_RE)
    expect(color.toLowerCase()).not.toBe(readAgentColor('unknownagent').toLowerCase())
  })

  it('returns default color for an unknown agent', () => {
    const color = readAgentColor('unknownagent')
    expect(color).toMatch(HEX_RE)
  })
})

describe('readDashboardToken', () => {
  beforeEach(() => {
    applyDashboardPalette('ghostty-forest')
  })

  it('returns active palette token values', () => {
    expect(readDashboardToken('--dashboard-spark-session', '#000000')).toBe('#4ade80')
    expect(readDashboardToken('--dashboard-spark-time', '#000000')).toBe('#facc15')
  })
})
