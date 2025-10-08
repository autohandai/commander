import { describe, expect, it, vi, beforeEach } from 'vitest'

const writes: Array<any> = []
const errors: Array<any> = []

vi.mock('@openai/codex-sdk', () => {
  const runStreamed = vi.fn(async () => ({
    events: (async function* () {
      yield { type: 'item.started', item: { type: 'agent_message', text: '' } }
      yield {
        type: 'item.completed',
        item: { type: 'agent_message', text: 'Hello from Codex' },
      }
    })(),
  }))

  const startThread = vi.fn(() => ({ runStreamed }))

  return {
    Codex: vi.fn(() => ({ startThread })),
    __runStreamed: runStreamed,
    __startThread: startThread,
  }
})

const codexModule: any = await import('@openai/codex-sdk')
const { Codex, __startThread, __runStreamed } = codexModule
const { runCodex } = await import('../../../scripts/codex-sdk-core.mjs')

describe('codex sdk runner', () => {
  beforeEach(() => {
    writes.length = 0
    errors.length = 0
    vi.clearAllMocks()
    process.env.CODEX_SDK_DIST_PATH = ''
  })

  it('streams events to the provided writer', async () => {
    await runCodex(
      {
        sessionId: 'sess-1',
        prompt: 'hello',
        workingDirectory: '/tmp/demo',
        sandboxMode: 'workspace-write',
        model: 'o4'
      },
      {
        write: async (msg: string) => writes.push(JSON.parse(msg)),
        writeError: async (msg: string) => errors.push(JSON.parse(msg)),
      }
    )

    expect(Codex).toHaveBeenCalledWith({ workingDirectory: '/tmp/demo' })
    expect(__startThread).toHaveBeenCalledWith({
      model: 'o4',
      sandboxMode: 'workspace-write',
      workingDirectory: '/tmp/demo',
      skipGitRepoCheck: true,
    })

    expect(__runStreamed).toHaveBeenCalledWith('hello')
    expect(writes).toEqual([
      { sessionId: 'sess-1', content: JSON.stringify({ type: 'item.started', item: { type: 'agent_message', text: '' } }), finished: false },
      { sessionId: 'sess-1', content: JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Hello from Codex' } }), finished: false },
      { sessionId: 'sess-1', content: '', finished: true }
    ])
    expect(errors).toEqual([])
  })

  it('reports errors through writeError channel', async () => {
    __runStreamed.mockImplementationOnce(async () => {
      throw new Error('boom')
    })

    await runCodex(
      {
        sessionId: 'sess-2',
        prompt: 'broken',
      },
      {
        write: async (msg: string) => writes.push(JSON.parse(msg)),
        writeError: async (msg: string) => errors.push(JSON.parse(msg)),
      }
    )

    expect(errors).toEqual([
      { sessionId: 'sess-2', error: 'boom', finished: true }
    ])
  })
})
