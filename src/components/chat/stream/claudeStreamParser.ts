export class ClaudeStreamParser {
  private buf = ''
  private headerPrinted = false
  private metaPrinted = false
  private workingHeaderPrinted = false
  private agent: string
  private model: string | null = null
  private textBlocks: Map<number, string> = new Map()
  private toolCalls: Map<string, { name: string; description?: string; input?: any; partial?: string; emitted?: boolean }> = new Map()

  constructor(agent: string = 'claude') {
    this.agent = agent
  }

  // Feed a chunk of text that may contain zero or more concatenated JSON objects
  // Returns a transcript delta to append to the message content
  feed(chunk: string): string {
    let delta = ''
    if (chunk) this.buf += chunk

    // Extract full JSON objects by brace matching
    let start = -1
    let depth = 0
    let inStr = false
    let esc = false
    const out: string[] = []
    for (let i = 0; i < this.buf.length; i++) {
      const c = this.buf[i]
      if (inStr) {
        if (esc) { esc = false; continue }
        if (c === '\\') { esc = true; continue }
        if (c === '"') inStr = false
        continue
      }
      if (c === '"') { inStr = true; continue }
      if (c === '{') {
        if (depth === 0) start = i
        depth++
      } else if (c === '}') {
        depth--
        if (depth === 0 && start >= 0) {
          out.push(this.buf.slice(start, i + 1))
          start = -1
        }
      }
    }
    // Remove consumed prefix
    if (out.length) {
      const last = out[out.length - 1]
      const endIndex = this.buf.indexOf(last) + last.length
      this.buf = this.buf.slice(endIndex)
    }

    for (const s of out) {
      try {
        const obj = JSON.parse(s)
        delta += this.handleEvent(obj)
      } catch {
        const stripped = s
          .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
          .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
          .trim()

        if (!stripped.startsWith('{') || !stripped.endsWith('}')) {
          continue
        }

        try {
          const parsed = JSON.parse(stripped)
          delta += this.handleEvent(parsed)
        } catch {
          // ignore malformed fragments silently
        }
      }
    }

    return delta
  }

  private ensureHeader(): string {
    if (this.headerPrinted) return ''
    this.headerPrinted = true
    return `Agent: ${this.agent} | Command: stream-json\n` + '--------\n'
  }

  private ensureMeta(): string {
    if (this.metaPrinted) return ''
    this.metaPrinted = true
    const model = this.model ? `model: ${this.model}\n` : ''
    return model ? model + '--------\n' : ''
  }

  private ensureWorkingHeader(): string {
    if (this.workingHeaderPrinted) return ''
    this.workingHeaderPrinted = true
    return 'Working\n'
  }

  private ensureTranscriptHeaders(): string {
    let d = ''
    d += this.ensureHeader()
    d += this.ensureMeta()
    d += this.ensureWorkingHeader()
    return d
  }

  private formatToolUse(name: string, input: any, description?: string): string {
    const labelParts: string[] = []
    if (input && typeof input === 'object') {
      const known = input.command ?? input.cmd ?? input.code ?? input.path ?? input.query ?? input.message ?? null
      if (typeof known === 'string' && known.trim()) labelParts.push(known.trim())
      if ((!known || !labelParts.length) && input.args && Array.isArray(input.args)) {
        const joined = input.args.join(' ').trim()
        if (joined) labelParts.push(joined)
      }
      if ((!known || !labelParts.length) && input.input) {
        if (typeof input.input === 'string') labelParts.push(input.input.trim())
        else labelParts.push(JSON.stringify(input.input))
      }
    } else if (typeof input === 'string' && input.trim()) {
      labelParts.push(input.trim())
    }
    if (description && description.trim()) {
      labelParts.push(`— ${description.trim()}`)
    } else if (input && typeof input === 'object' && typeof input.description === 'string' && input.description.trim()) {
      labelParts.push(`— ${input.description.trim()}`)
    }
    const label = labelParts.join(' ')
    const suffix = label ? `: ${label}` : ''
    return `• ${name}${suffix}\n`
  }

  private extractToolResult(ev: any, fallbackName?: string): string | null {
    const content = ev?.content
    let text = ''
    if (Array.isArray(content)) {
      text = content
        .map((item) => {
          if (!item) return ''
          if (typeof item === 'string') return item
          if (typeof item.text === 'string') return item.text
          if (typeof item.data === 'string') return item.data
          if (Array.isArray(item.content)) return item.content.join(' ')
          return ''
        })
        .filter(Boolean)
        .join(' ')
    } else if (typeof content === 'string') {
      text = content
    } else if (typeof ev?.result === 'string') {
      text = ev.result
    }
    text = text.trim()
    if (!text && ev?.is_error && typeof ev?.error === 'string') {
      text = ev.error.trim()
    }
    if (!text) return null
    const prefix = fallbackName ? `${fallbackName}Output` : 'ToolOutput'
    return `• ${prefix}: ${text}\n`
  }

  private safeParse<T = any>(src: string | undefined | null): T | null {
    if (!src) return null
    try {
      return JSON.parse(src) as T
    } catch {
      return null
    }
  }

  private handleEvent(ev: any): string {
    let d = ''
    if (ev?.type === 'system') {
      if (ev.model) this.model = ev.model
      d += this.ensureHeader()
      d += this.ensureMeta()
      return d
    }
    if (ev?.type === 'message_start') {
      if (ev.message?.model) this.model = ev.message.model
      return this.ensureTranscriptHeaders()
    }
    if (ev?.type === 'content_block_start') {
      const blockType = ev?.content_block?.type
      const index = typeof ev?.index === 'number' ? ev.index : 0
      if (blockType === 'text' || blockType === 'thinking' || blockType === 'assistant_response') {
        this.textBlocks.set(index, '')
      }
      if (blockType === 'tool_use') {
        const id = ev?.content_block?.id || `idx:${index}`
        const name = ev?.content_block?.name || 'Tool'
        const description = ev?.content_block?.input?.description
        const input = ev?.content_block?.input
        const state = this.toolCalls.get(id) || { name }
        state.name = name
        state.description = description
        if (input && Object.keys(input).length) {
          state.input = input
        }
        this.toolCalls.set(id, state)
        if (state.input && !state.emitted) {
          state.emitted = true
          this.toolCalls.set(id, state)
          return this.ensureTranscriptHeaders() + this.formatToolUse(name, state.input, state.description)
        }
      }
      return ''
    }
    if (ev?.type === 'content_block_delta') {
      const index = typeof ev?.index === 'number' ? ev.index : 0
      if (this.textBlocks.has(index)) {
        const prev = this.textBlocks.get(index) || ''
        const addition = typeof ev?.delta?.text === 'string'
          ? ev.delta.text
          : typeof ev?.delta?.partial_json === 'string'
            ? ev.delta.partial_json
            : ''
        if (addition) this.textBlocks.set(index, prev + addition)
      } else if (ev?.delta?.partial_json && ev?.id) {
        const call = this.toolCalls.get(ev.id) || { name: 'Tool' }
        const prev = call.partial || ''
        call.partial = prev + ev.delta.partial_json
        this.toolCalls.set(ev.id, call)
      }
      return ''
    }
    if (ev?.type === 'content_block_stop') {
      const index = typeof ev?.index === 'number' ? ev.index : 0
      if (this.textBlocks.has(index)) {
        const text = (this.textBlocks.get(index) || '').trim()
        this.textBlocks.delete(index)
        if (text) d += this.ensureTranscriptHeaders() + `• ${text}\n`
        return d
      }
      return ''
    }
    if (ev?.type === 'tool_call_delta') {
      const id = ev?.id || ev?.tool_use_id
      if (!id) return ''
      const call = this.toolCalls.get(id) || { name: 'Tool' }
      const partial = ev?.delta?.partial_json
      if (partial) call.partial = (call.partial || '') + partial
      this.toolCalls.set(id, call)
      return ''
    }
    if (ev?.type === 'tool_call_stop') {
      const id = ev?.id || ev?.tool_use_id
      if (!id) return ''
      const call = this.toolCalls.get(id)
      if (!call) return ''
      if (!call.input && ev?.result?.input) call.input = ev.result.input
      if (!call.input && call.partial) {
        const parsed = this.safeParse(call.partial)
        if (parsed) call.input = parsed
      }
      if (call.emitted) {
        this.toolCalls.set(id, call)
        return ''
      }
      call.emitted = true
      this.toolCalls.set(id, call)
      return this.ensureTranscriptHeaders() + this.formatToolUse(call.name, call.input, call.description)
    }
    if (ev?.type === 'tool_result') {
      const id = ev?.tool_use_id || ev?.id
      const call = id ? this.toolCalls.get(id) : null
      const name = call?.name
      const bullet = this.extractToolResult(ev, name)
      if (!bullet) return ''
      if (call) this.toolCalls.delete(id!)
      return this.ensureTranscriptHeaders() + bullet
    }
    if (ev?.type === 'message_delta' || ev?.type === 'message_stop') {
      return ''
    }
    if (ev?.type === 'assistant' && ev?.message?.content) {
      d += this.ensureTranscriptHeaders()
      for (const part of ev.message.content) {
        if (part.type === 'text' && typeof part.text === 'string') {
          const lines = part.text.split(/\n+/).map((s: string) => s.trim()).filter(Boolean)
          for (const line of lines) d += `• ${line}\n`
        } else if (part.type === 'tool_use') {
          const name = part.name || 'Tool'
          const cmd = part.input?.command || ''
          const desc = part.input?.description ? ` — ${part.input.description}` : ''
          const label = cmd ? `${cmd}${desc}` : (desc ? desc.slice(3) : '')
          d += `• ${name}: ${label}\n`
        }
      }
      return d
    }
    if (ev?.type === 'user' && ev?.message?.content) {
      d += this.ensureTranscriptHeaders()
      for (const part of ev.message.content) {
        if (part.type === 'tool_result') {
          const out = typeof part.content === 'string' ? part.content.trim() : ''
          if (out) d += `• BashOutput: ${out}\n`
        }
      }
      return d
    }
    if (ev?.type === 'result') {
      // Append a summary answer section
      const res = typeof ev.result === 'string' ? ev.result : ''
      if (res) {
        d += '--------\n'
        d += 'Answer\n'
        d += res + '\n'
      }
      return d
    }
    return ''
  }
}
