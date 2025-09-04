import { describe, it, expect } from 'vitest'
import { ClaudeStreamParser } from '@/components/chat/stream/claudeStreamParser'

const SAMPLE = `{"type":"system","subtype":"init","cwd":"/tmp","session_id":"s1","tools":["Bash"],"mcp_servers":[],"model":"claude-opus-4-1-20250805","permissionMode":"default","slash_commands":[],"apiKeySource":"none","output_style":"default","uuid":"u1"}{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"text","text":"I'll check the folders in your current directory."}]},"session_id":"s1","uuid":"a1"}{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"echo hello","description":"say hi"}}]},"session_id":"s1","uuid":"a2"}{"type":"user","message":{"role":"user","content":[{"tool_use_id":"t1","type":"tool_result","content":"hello","is_error":false}]},"session_id":"s1","uuid":"u2"}{"type":"assistant","message":{"id":"m2","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"text","text":"Done."}]},"session_id":"s1","uuid":"a3"}{"type":"result","subtype":"success","is_error":false,"duration_ms":100,"result":"Done.","session_id":"s1","uuid":"r1"}`

describe('ClaudeStreamParser', () => {
  it('converts JSON stream into transcript with Working bullets and Answer', () => {
    const p = new ClaudeStreamParser('claude')
    const delta = p.feed(SAMPLE)
    expect(delta).toContain('Working')
    expect(delta).toContain("• I'll check the folders in your current directory.")
    expect(delta).toContain('• Bash: echo hello — say hi')
    expect(delta).toContain('• BashOutput: hello')
    // Final answer summary
    const more = p.feed('')
    expect(delta + more).toContain('Done.')
  })
})

