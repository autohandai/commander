import { pathToFileURL } from 'url'
import fs from 'fs'

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
    if (process.env.DEBUG_CodexSDK === '1') {
      console.error('[codex-sdk-core] error:', message)
      if (error && error.stack) {
        console.error(error.stack)
      }
    }
    const payload = JSON.stringify({ sessionId, error: message, finished: true })
    if (io.writeError) {
      await io.writeError(payload)
    } else {
      await io.write(payload)
    }
  }
}

export async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk)
  }
  if (!chunks.length) return ''
  return Buffer.concat(chunks.map((c) => (typeof c === 'string' ? Buffer.from(c) : c))).toString('utf8')
}

export const defaultIO = {
  write: async (msg) => {
    process.stdout.write(msg + '\n')
  },
  writeError: async (msg) => {
    process.stderr.write(msg + '\n')
  },
}
