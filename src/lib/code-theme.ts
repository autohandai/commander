export type PrismThemeName = 'github' | 'dracula';

// Resolve effective code theme from app UI theme and code preference
export function resolvePrismTheme(
  codeTheme: string | undefined,
  uiTheme?: string,
  systemPrefersDark?: boolean,
  rootHasDarkClass?: boolean
): PrismThemeName {
  const specified = (codeTheme || 'github').toLowerCase();
  if (specified === 'dracula' || specified === 'github') {
    return specified as PrismThemeName;
  }

  // Auto logic: match the effective UI theme
  const isAuto = specified === 'auto' || specified === 'system';
  if (!isAuto) {
    // Unknown theme strings fallback sensibly to github
    return 'github';
  }

  const ui = (uiTheme || 'auto').toLowerCase();
  const prefersDark =
    typeof systemPrefersDark === 'boolean'
      ? systemPrefersDark
      : typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;

  const hasDarkClass =
    typeof rootHasDarkClass === 'boolean'
      ? rootHasDarkClass
      : typeof document !== 'undefined' &&
        document.documentElement.classList.contains('dark');

  const isDark = ui === 'dark' || (ui === 'auto' && (prefersDark || hasDarkClass));
  return isDark ? 'dracula' : 'github';
}

