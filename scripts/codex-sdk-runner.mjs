#!/usr/bin/env node
import fs from 'fs'
import { fileURLToPath } from 'url'
import { runCodex, readStdin } from './codex-sdk-core.mjs'
export { runCodex } from './codex-sdk-core.mjs'

async function main() {
  const stdin = await readStdin()
  const argInput = process.argv[2]
  const rawInput = stdin && stdin.trim().length > 0 ? stdin : argInput

  if (!rawInput) {
    throw new Error('Missing input payload for Codex SDK runner')
  }

  const payload = JSON.parse(rawInput)
  await runCodex(payload)
}

// Check if this script is being run directly
// Use fs.realpathSync to resolve symlinks (like /var -> /private/var on macOS)
const scriptPath = process.argv[1] ? fs.realpathSync(process.argv[1]) : null
const currentPath = import.meta.url ? fs.realpathSync(fileURLToPath(import.meta.url)) : null
const isMainModule = scriptPath && currentPath && scriptPath === currentPath

if (isMainModule) {
  main().catch((err) => {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(JSON.stringify({ error: message }) + '\n')
    process.exit(1)
  })
}
