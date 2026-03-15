import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('shared scrollbar primitives', () => {
  it('applies the shared themed scrollbar utility to select content', () => {
    const source = readFileSync('src/components/ui/select.tsx', 'utf8')

    expect(source).toContain('theme-scrollbar')
  })

  it('applies the shared themed scrollbar utility to dropdown content', () => {
    const source = readFileSync('src/components/ui/dropdown-menu.tsx', 'utf8')

    expect(source).toContain('theme-scrollbar')
  })
})
