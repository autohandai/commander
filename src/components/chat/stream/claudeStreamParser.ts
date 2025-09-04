export class ClaudeStreamParser {
  private buf = ''
  private headerPrinted = false
  private metaPrinted = false
  private workingHeaderPrinted = false
  private agent: string
  private model: string | null = null

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
        // ignore badly formed fragments
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

  private handleEvent(ev: any): string {
    let d = ''
    if (ev?.type === 'system') {
      if (ev.model) this.model = ev.model
      d += this.ensureHeader()
      d += this.ensureMeta()
      return d
    }
    if (ev?.type === 'assistant' && ev?.message?.content) {
      d += this.ensureHeader()
      d += this.ensureMeta()
      d += this.ensureWorkingHeader()
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
      d += this.ensureHeader() + this.ensureMeta() + this.ensureWorkingHeader()
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

