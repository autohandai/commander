import { describe, it, expect } from 'vitest';
import { resolvePrismTheme } from '../code-theme';

describe('resolvePrismTheme', () => {
  it('respects explicit github selection', () => {
    expect(resolvePrismTheme('github', 'dark', true, true)).toBe('github');
  });

  it('respects explicit dracula selection', () => {
    expect(resolvePrismTheme('dracula', 'light', false, false)).toBe('dracula');
  });

  it('auto selects dracula when UI is dark', () => {
    expect(resolvePrismTheme('auto', 'dark', false, false)).toBe('dracula');
  });

  it('auto selects github when UI is light', () => {
    expect(resolvePrismTheme('auto', 'light', true, true)).toBe('github');
  });

  it('auto with ui auto uses system preference or dark class', () => {
    // prefers dark
    expect(resolvePrismTheme('auto', 'auto', true, false)).toBe('dracula');
    // dark class
    expect(resolvePrismTheme('auto', 'auto', false, true)).toBe('dracula');
    // neither
    expect(resolvePrismTheme('auto', 'auto', false, false)).toBe('github');
  });

  it('unknown theme falls back to github', () => {
    expect(resolvePrismTheme('unknown', 'dark', true, true)).toBe('github');
  });
});

