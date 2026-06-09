import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')

function readProjectFile(path: string) {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('Tailwind styling stack compatibility', () => {
  it('keeps Commander on the Tailwind 3-compatible shadcn styling stack', () => {
    const packageJson = JSON.parse(readProjectFile('package.json'))
    const postcssConfig = readProjectFile('postcss.config.js')
    const indexCss = readProjectFile('src/index.css')

    expect(packageJson.devDependencies.tailwindcss).toMatch(/^\^3\./)
    expect(packageJson.devDependencies).not.toHaveProperty('@tailwindcss/postcss')
    expect(postcssConfig).toContain('tailwindcss')
    expect(postcssConfig).not.toContain('@tailwindcss/postcss')
    expect(indexCss).not.toContain('@config')
  })
})
