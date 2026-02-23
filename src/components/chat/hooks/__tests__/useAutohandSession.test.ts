import { describe, it, expect } from 'vitest'

describe('autohand session types', () => {
  it('should define message payload shape', () => {
    const payload = {
      session_id: 'sess-1',
      content: 'Hello',
      finished: false,
    }
    expect(payload.session_id).toBe('sess-1')
    expect(payload.finished).toBe(false)
  })

  it('should define tool event payload shape', () => {
    const payload = {
      session_id: 'sess-1',
      event: {
        tool_id: 'tool-1',
        tool_name: 'read_file',
        phase: 'start' as const,
        args: { path: 'src/main.rs' },
        output: null,
        success: null,
        duration_ms: null,
      },
    }
    expect(payload.event.tool_name).toBe('read_file')
    expect(payload.event.phase).toBe('start')
  })

  it('should define permission request payload shape', () => {
    const payload = {
      session_id: 'sess-1',
      request: {
        request_id: 'req-1',
        tool_name: 'write_file',
        description: 'Write to src/app.ts',
        file_path: 'src/app.ts',
        is_destructive: false,
      },
    }
    expect(payload.request.tool_name).toBe('write_file')
    expect(payload.request.is_destructive).toBe(false)
  })
})
