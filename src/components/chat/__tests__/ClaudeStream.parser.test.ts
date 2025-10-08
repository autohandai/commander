import { describe, it, expect } from 'vitest'
import { ClaudeStreamParser } from '@/components/chat/stream/claudeStreamParser'

const SAMPLE = `{"type":"system","subtype":"init","cwd":"/tmp","session_id":"s1","tools":["Bash"],"mcp_servers":[],"model":"claude-opus-4-1-20250805","permissionMode":"default","slash_commands":[],"apiKeySource":"none","output_style":"default","uuid":"u1"}{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"text","text":"I'll check the folders in your current directory."}]},"session_id":"s1","uuid":"a1"}{"type":"assistant","message":{"id":"m1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"echo hello","description":"say hi"}}]},"session_id":"s1","uuid":"a2"}{"type":"user","message":{"role":"user","content":[{"tool_use_id":"t1","type":"tool_result","content":"hello","is_error":false}]},"session_id":"s1","uuid":"u2"}{"type":"assistant","message":{"id":"m2","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[{"type":"text","text":"Done."}]},"session_id":"s1","uuid":"a3"}{"type":"result","subtype":"success","is_error":false,"duration_ms":100,"result":"Done.","session_id":"s1","uuid":"r1"}`

const SAMPLE_V2 = `{"type":"system","subtype":"init","cwd":"/tmp","session_id":"s99","tools":["Bash"],"mcp_servers":[],"model":"claude-opus-4-1-20250805","permissionMode":"default","slash_commands":[],"apiKeySource":"none","output_style":"default","uuid":"sys1"}{"type":"message_start","message":{"id":"msg1","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[]}}{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"I'll check how many files are in the current directory."}}{"type":"content_block_stop","index":0}{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_1","name":"Bash","input":{"command":"find . -type f | wc -l","description":"Count all files in the current directory"}}}{"type":"content_block_stop","index":1}{"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}{"type":"message_stop"}{"type":"tool_result","tool_use_id":"tool_1","content":[{"type":"output_text","text":"13"}],"is_error":false}{"type":"message_start","message":{"id":"msg2","type":"message","role":"assistant","model":"claude-opus-4-1-20250805","content":[]}}{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Completed count. Total files: 13."}}{"type":"content_block_stop","index":0}{"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"input_tokens":0,"output_tokens":0}}{"type":"message_stop"}{"type":"result","subtype":"success","is_error":false,"duration_ms":42,"result":"Completed count. Total files: 13.","session_id":"s99","uuid":"res1"}`

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

  it('parses new message_* stream events into Working bullets and outputs', () => {
    const p = new ClaudeStreamParser('claude')
    const delta = p.feed(SAMPLE_V2)
    expect(delta).toContain('Working')
    expect(delta).toContain('• I\'ll check how many files are in the current directory.')
    expect(delta).toContain('• Bash: find . -type f | wc -l — Count all files in the current directory')
    expect(delta).toContain('• BashOutput: 13')
    const more = p.feed('')
    expect(delta + more).toContain('Completed count. Total files: 13.')
  })
})
