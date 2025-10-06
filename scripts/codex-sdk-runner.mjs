#!/usr/bin/env node
import fs from 'fs'
import { pathToFileURL, fileURLToPath } from 'url'

export async function runCodex(options = {}, io = defaultIO) {
  const {
    sessionId,
    prompt = '',
    workingDirectory,
    sandboxMode,
    model,
    skipGitRepoCheck,
  } = options

  let CodexModule
  const distPath = process.env.CODEX_SDK_DIST_PATH
  if (distPath && fs.existsSync(distPath)) {
    CodexModule = await import(pathToFileURL(distPath).href)
  } else {
    CodexModule = await import('@openai/codex-sdk')
  }
  const { Codex } = CodexModule

  const codexOptions = workingDirectory ? { workingDirectory } : {}
  const codex = new Codex(codexOptions)

  const threadOptions = {
    ...(model ? { model } : {}),
    ...(sandboxMode ? { sandboxMode } : {}),
    ...(workingDirectory ? { workingDirectory } : {}),
    skipGitRepoCheck: skipGitRepoCheck !== false,
  }

  const thread = codex.startThread(threadOptions)

  try {
    const { events } = await thread.runStreamed(prompt)
    for await (const event of events) {
      await io.write(
        JSON.stringify({
          sessionId,
          content: JSON.stringify(event),
          finished: false,
        })
      )
    }

    await io.write(
      JSON.stringify({
        sessionId,
        content: '',
        finished: true,
      })
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const payload = JSON.stringify({ sessionId, error: message, finished: true })
    if (io.writeError) {
      await io.writeError(payload)
    } else {
      await io.write(payload)
    }
  }
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  if (!chunks.length) return ''
  return Buffer.concat(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c))).toString('utf8')
}

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

const defaultIO = {
  write: async (msg) => {
    process.stdout.write(msg + '\n')
  },
  writeError: async (msg) => {
    process.stderr.write(msg + '\n')
  },
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
