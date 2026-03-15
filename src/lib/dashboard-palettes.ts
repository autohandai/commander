/**
 * Dashboard color palette definitions and CSS variable application.
 *
 * Each palette maps agent names and shared chart accents to CSS custom properties.
 * The active palette is applied on the document root so every dashboard chart can
 * read from one consistent source of truth.
 */

export interface DashboardPalette {
  autohand: string
  claude: string
  codex: string
  gemini: string
  ollama: string
  default: string
  axis: string
  grid: string
  mutedDot: string
  sessionSpark: string
  timeSpark: string
  streakSpark: string
  emptySpark: string
}

export const DASHBOARD_PALETTES: Record<string, DashboardPalette> = {
  default: {
    autohand: '#111827',
    claude: '#3b82f6',
    codex: '#22c55e',
    gemini: '#8b5cf6',
    ollama: '#f59e0b',
    default: '#94a3b8',
    axis: '#64748b',
    grid: '#334155',
    mutedDot: '#1e293b',
    sessionSpark: '#3b82f6',
    timeSpark: '#eab308',
    streakSpark: '#f97316',
    emptySpark: '#334155',
  },
  ocean: {
    autohand: '#0f172a',
    claude: '#0ea5e9',
    codex: '#06b6d4',
    gemini: '#6366f1',
    ollama: '#0284c7',
    default: '#64748b',
    axis: '#7dd3fc',
    grid: '#164e63',
    mutedDot: '#0f172a',
    sessionSpark: '#0ea5e9',
    timeSpark: '#22d3ee',
    streakSpark: '#38bdf8',
    emptySpark: '#1e293b',
  },
  sunset: {
    autohand: '#7c2d12',
    claude: '#f97316',
    codex: '#ef4444',
    gemini: '#ec4899',
    ollama: '#eab308',
    default: '#a8a29e',
    axis: '#fdba74',
    grid: '#7c2d12',
    mutedDot: '#431407',
    sessionSpark: '#f97316',
    timeSpark: '#f59e0b',
    streakSpark: '#ef4444',
    emptySpark: '#7c2d12',
  },
  neon: {
    autohand: '#f8fafc',
    claude: '#00d9ff',
    codex: '#39ff14',
    gemini: '#bf00ff',
    ollama: '#ff6600',
    default: '#666680',
    axis: '#94a3b8',
    grid: '#1f2937',
    mutedDot: '#111827',
    sessionSpark: '#00d9ff',
    timeSpark: '#ffdd00',
    streakSpark: '#ff6600',
    emptySpark: '#334155',
  },
  mono: {
    autohand: '#0f172a',
    claude: '#f8fafc',
    codex: '#cbd5e1',
    gemini: '#94a3b8',
    ollama: '#64748b',
    default: '#334155',
    axis: '#cbd5e1',
    grid: '#334155',
    mutedDot: '#1e293b',
    sessionSpark: '#f8fafc',
    timeSpark: '#cbd5e1',
    streakSpark: '#94a3b8',
    emptySpark: '#475569',
  },
  'ghostty-aurora': {
    autohand: '#1c2433',
    claude: '#7dd3fc',
    codex: '#34d399',
    gemini: '#c084fc',
    ollama: '#fbbf24',
    default: '#94a3b8',
    axis: '#8ea4bf',
    grid: '#2b3648',
    mutedDot: '#1a2230',
    sessionSpark: '#7dd3fc',
    timeSpark: '#fbbf24',
    streakSpark: '#fb7185',
    emptySpark: '#334155',
  },
  'ghostty-ember': {
    autohand: '#2b1d1a',
    claude: '#fda4af',
    codex: '#fb7185',
    gemini: '#fdba74',
    ollama: '#f59e0b',
    default: '#a8a29e',
    axis: '#fdba74',
    grid: '#4a251e',
    mutedDot: '#2f1712',
    sessionSpark: '#fb7185',
    timeSpark: '#f59e0b',
    streakSpark: '#ef4444',
    emptySpark: '#4b5563',
  },
  'ghostty-lagoon': {
    autohand: '#102a35',
    claude: '#38bdf8',
    codex: '#2dd4bf',
    gemini: '#818cf8',
    ollama: '#22c55e',
    default: '#94a3b8',
    axis: '#67e8f9',
    grid: '#164e63',
    mutedDot: '#0f2230',
    sessionSpark: '#38bdf8',
    timeSpark: '#22c55e',
    streakSpark: '#2dd4bf',
    emptySpark: '#334155',
  },
  'ghostty-dusk': {
    autohand: '#1f1f35',
    claude: '#93c5fd',
    codex: '#a78bfa',
    gemini: '#f472b6',
    ollama: '#f59e0b',
    default: '#94a3b8',
    axis: '#c4b5fd',
    grid: '#312e81',
    mutedDot: '#1e1b4b',
    sessionSpark: '#93c5fd',
    timeSpark: '#f59e0b',
    streakSpark: '#f472b6',
    emptySpark: '#374151',
  },
  'ghostty-forest': {
    autohand: '#17261f',
    claude: '#86efac',
    codex: '#4ade80',
    gemini: '#22c55e',
    ollama: '#facc15',
    default: '#94a3b8',
    axis: '#bbf7d0',
    grid: '#14532d',
    mutedDot: '#13261a',
    sessionSpark: '#4ade80',
    timeSpark: '#facc15',
    streakSpark: '#22c55e',
    emptySpark: '#334155',
  },
  dracula: {
    autohand: '#191a21',
    claude: '#8be9fd',
    codex: '#50fa7b',
    gemini: '#bd93f9',
    ollama: '#ffb86c',
    default: '#6272a4',
    axis: '#f8f8f2',
    grid: '#44475a',
    mutedDot: '#282a36',
    sessionSpark: '#8be9fd',
    timeSpark: '#ffb86c',
    streakSpark: '#ff79c6',
    emptySpark: '#44475a',
  },
  'github-dark': {
    autohand: '#0d1117',
    claude: '#58a6ff',
    codex: '#3fb950',
    gemini: '#a371f7',
    ollama: '#d29922',
    default: '#8b949e',
    axis: '#c9d1d9',
    grid: '#30363d',
    mutedDot: '#161b22',
    sessionSpark: '#58a6ff',
    timeSpark: '#d29922',
    streakSpark: '#f78166',
    emptySpark: '#30363d',
  },
  'github-light': {
    autohand: '#24292f',
    claude: '#0969da',
    codex: '#1a7f37',
    gemini: '#8250df',
    ollama: '#bf8700',
    default: '#6e7781',
    axis: '#57606a',
    grid: '#d0d7de',
    mutedDot: '#f6f8fa',
    sessionSpark: '#0969da',
    timeSpark: '#bf8700',
    streakSpark: '#cf222e',
    emptySpark: '#d0d7de',
  },
}

/**
 * Light-mode overrides for structural/utility colors.
 * Agent and spark colors typically work in both modes; only structural
 * colors (axis, grid, mutedDot, emptySpark) need adjustment for light backgrounds.
 */
export const PALETTE_LIGHT_OVERRIDES: Record<string, Partial<DashboardPalette>> = {
  default: {
    axis: '#475569',
    grid: '#cbd5e1',
    mutedDot: '#e2e8f0',
    emptySpark: '#cbd5e1',
  },
  ocean: {
    axis: '#0c4a6e',
    grid: '#bae6fd',
    mutedDot: '#e0f2fe',
    emptySpark: '#bae6fd',
  },
  sunset: {
    axis: '#9a3412',
    grid: '#fed7aa',
    mutedDot: '#ffedd5',
    emptySpark: '#fed7aa',
  },
  neon: {
    autohand: '#111827',
    axis: '#4b5563',
    grid: '#d1d5db',
    mutedDot: '#e5e7eb',
    emptySpark: '#d1d5db',
  },
  mono: {
    autohand: '#0f172a',
    claude: '#1e293b',
    codex: '#475569',
    gemini: '#64748b',
    ollama: '#334155',
    axis: '#334155',
    grid: '#e2e8f0',
    mutedDot: '#f1f5f9',
    emptySpark: '#cbd5e1',
  },
  'ghostty-aurora': {
    axis: '#475569',
    grid: '#bfdbfe',
    mutedDot: '#dbeafe',
    emptySpark: '#cbd5e1',
  },
  'ghostty-ember': {
    axis: '#9a3412',
    grid: '#fecaca',
    mutedDot: '#fee2e2',
    emptySpark: '#e5e7eb',
  },
  'ghostty-lagoon': {
    axis: '#155e75',
    grid: '#a5f3fc',
    mutedDot: '#cffafe',
    emptySpark: '#cbd5e1',
  },
  'ghostty-dusk': {
    axis: '#4338ca',
    grid: '#c7d2fe',
    mutedDot: '#e0e7ff',
    emptySpark: '#d1d5db',
  },
  'ghostty-forest': {
    axis: '#166534',
    grid: '#bbf7d0',
    mutedDot: '#dcfce7',
    emptySpark: '#cbd5e1',
  },
  dracula: {
    axis: '#44475a',
    grid: '#c7d2fe',
    mutedDot: '#ede9fe',
    emptySpark: '#d1d5db',
  },
  'github-dark': {
    axis: '#57606a',
    grid: '#d0d7de',
    mutedDot: '#f6f8fa',
    emptySpark: '#d0d7de',
  },
  'github-light': {
    // Already designed for light backgrounds — no overrides needed.
  },
}

export const PALETTE_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'sunset', label: 'Sunset' },
  { value: 'neon', label: 'Neon' },
  { value: 'mono', label: 'Monochrome' },
  { value: 'ghostty-aurora', label: 'Aurora' },
  { value: 'ghostty-ember', label: 'Ember' },
  { value: 'ghostty-lagoon', label: 'Lagoon' },
  { value: 'ghostty-dusk', label: 'Dusk' },
  { value: 'ghostty-forest', label: 'Forest' },
  { value: 'dracula', label: 'Dracula' },
  { value: 'github-dark', label: 'GitHub Dark' },
  { value: 'github-light', label: 'GitHub Light' },
] as const

const AGENT_PREVIEW_ORDER = ['claude', 'codex', 'gemini', 'ollama', 'autohand'] as const

export function getDashboardPalettePreview(key: string): string[] {
  const palette = DASHBOARD_PALETTES[key] ?? DASHBOARD_PALETTES.default
  return AGENT_PREVIEW_ORDER.map((agent) => palette[agent])
}

/**
 * Detect whether the app is currently in dark mode.
 * Checks the `.dark` class first, then falls back to the OS media query
 * (unless `.force-light` is set).
 */
function detectDarkMode(): boolean {
  if (typeof window === 'undefined') return true
  const root = document.documentElement
  if (root.classList.contains('force-light')) return false
  if (root.classList.contains('dark')) return true
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
}

/**
 * Resolve the effective dark/light boolean from a theme mode string.
 * When mode is 'auto' (or omitted), falls back to DOM / media-query detection.
 * Default without arguments is 'dark' for backward-compatibility (existing callers
 * that don't pass a mode keep the same behavior).
 */
export function resolveIsDark(mode: 'light' | 'dark' | 'auto' = 'dark'): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return detectDarkMode()
}

/**
 * Apply a dashboard color palette by setting CSS custom properties on document root.
 * Falls back to 'default' palette if key is unknown.
 *
 * @param key      - palette name (e.g. 'ocean', 'dracula')
 * @param themeMode - 'dark' | 'light' | 'auto'; determines whether light-mode
 *                    overrides are merged. Defaults to 'dark' for backward compat.
 */
export function applyDashboardPalette(
  key: string,
  themeMode: 'light' | 'dark' | 'auto' = 'dark',
): void {
  const base = DASHBOARD_PALETTES[key] ?? DASHBOARD_PALETTES.default
  const isDark = resolveIsDark(themeMode)

  // Merge light-mode overrides when not in dark mode
  const lightOverrides = !isDark
    ? (PALETTE_LIGHT_OVERRIDES[key] ?? {})
    : {}

  const palette = { ...base, ...lightOverrides }

  const root = document.documentElement
  root.style.setProperty('--dashboard-agent-autohand', palette.autohand)
  root.style.setProperty('--dashboard-agent-claude', palette.claude)
  root.style.setProperty('--dashboard-agent-codex', palette.codex)
  root.style.setProperty('--dashboard-agent-gemini', palette.gemini)
  root.style.setProperty('--dashboard-agent-ollama', palette.ollama)
  root.style.setProperty('--dashboard-agent-default', palette.default)
  root.style.setProperty('--dashboard-axis', palette.axis)
  root.style.setProperty('--dashboard-grid', palette.grid)
  root.style.setProperty('--dashboard-dot-muted', palette.mutedDot)
  root.style.setProperty('--dashboard-spark-session', palette.sessionSpark)
  root.style.setProperty('--dashboard-spark-time', palette.timeSpark)
  root.style.setProperty('--dashboard-spark-streak', palette.streakSpark)
  root.style.setProperty('--dashboard-spark-empty', palette.emptySpark)
}

export function readDashboardToken(token: string, fallback: string): string {
  if (typeof window === 'undefined') {
    return fallback
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim()
  return value || fallback
}

/**
 * Read a dashboard agent color from the active CSS custom properties.
 * SSR-safe: returns hardcoded default when `window` is unavailable.
 */
export function readAgentColor(agent: string): string {
  const KNOWN_AGENTS = ['autohand', 'claude', 'codex', 'gemini', 'ollama'] as const
  const defaults: Record<string, string> = {
    autohand: '#111827',
    claude: '#3b82f6',
    codex: '#22c55e',
    gemini: '#8b5cf6',
    ollama: '#f59e0b',
    default: '#94a3b8',
  }

  if (typeof window === 'undefined') {
    return defaults[agent] ?? defaults.default
  }

  const varName = (KNOWN_AGENTS as readonly string[]).includes(agent)
    ? `--dashboard-agent-${agent}`
    : '--dashboard-agent-default'

  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || defaults[agent] || defaults.default
}
