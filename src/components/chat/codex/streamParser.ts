import type {
  ThreadEvent,
  ResponseDeltaEvent,
  ResponseOutputTextDeltaEvent,
  ResponseCompletedEvent,
  ResponseErrorEvent,
} from './events'
import type { ThreadItem } from './items'

export class CodexStreamParser {
  private sections = {
    reasoning: [] as string[],
    messages: [] as string[],
    usage: null as { input_tokens: number; cached_input_tokens: number; output_tokens: number } | null,
    threadId: null as string | null,
  }

  feed(raw: string): string | undefined {
    const normalized = this.normalize(raw)
    if (!normalized) return undefined

    let event: ThreadEvent | ResponseDeltaEvent | ResponseOutputTextDeltaEvent | ResponseCompletedEvent | ResponseErrorEvent | Record<string, unknown>
    try {
      event = JSON.parse(normalized)
    } catch {
      return undefined
    }

    return this.handleEvent(event)
  }

  private handleItem(item: ThreadItem): string | undefined {
    switch (item.type) {
      case 'agent_message':
        this.sections.messages.push(item.text)
        return this.buildOutput()

      case 'reasoning':
        this.sections.reasoning.push(item.text)
        return this.buildOutput()

      case 'command_execution':
        const cmdStatus = item.status === 'completed' ? '✅' : item.status === 'failed' ? '❌' : '⏳'
        this.sections.messages.push(
          `${cmdStatus} **Command:** \`${item.command}\`${item.aggregated_output ? `\n\`\`\`\n${item.aggregated_output}\n\`\`\`` : ''}`
        )
        return this.buildOutput()

      case 'file_change':
        const fileStatus = item.status === 'completed' ? '✅' : '❌'
        const changes = item.changes.map(c => {
          const icon = c.kind === 'add' ? '➕' : c.kind === 'delete' ? '➖' : '✏️'
          // Make file paths clickable with file:// protocol
          return `${icon} [${c.path}](file://${c.path})`
        }).join('\n')
        this.sections.messages.push(
          `${fileStatus} **File Changes:**\n${changes}`
        )
        return this.buildOutput()

      case 'mcp_tool_call':
        const toolStatus = item.status === 'completed' ? '✅' : item.status === 'failed' ? '❌' : '⏳'
        this.sections.messages.push(
          `${toolStatus} **Tool Call:** ${item.server}/${item.tool}`
        )
        return this.buildOutput()

      case 'web_search':
        this.sections.messages.push(
          `🔍 **Web Search:** ${item.query}`
        )
        return this.buildOutput()

      case 'todo_list':
        const todos = item.items.map(t =>
          `${t.completed ? '✅' : '⬜'} ${t.text}`
        ).join('\n')
        this.sections.messages.push(
          `**Todo List:**\n${todos}`
        )
        return this.buildOutput()

      case 'error':
        this.sections.messages.push(
          `❌ **Error:** ${item.message}`
        )
        return this.buildOutput()

      default:
        return undefined
    }
  }

  private handleEvent(
    event:
      | ThreadEvent
      | ResponseDeltaEvent
      | ResponseOutputTextDeltaEvent
      | ResponseCompletedEvent
      | ResponseErrorEvent
      | Record<string, any>
  ): string | undefined {
    if (!event || typeof event !== 'object') return undefined

    const eventType = (event as any).type

    // Handle thread started
    if (eventType === 'thread.started') {
      this.sections.threadId = (event as any).thread_id
      return undefined // Don't show thread ID in output
    }

    // Handle turn completed (usage stats)
    if (eventType === 'turn.completed') {
      const usage = (event as any).usage
      if (usage) {
        this.sections.usage = usage
        return this.buildOutput()
      }
      return undefined
    }

    // Skip turn.started and non-critical errors
    if (eventType === 'turn.started' || eventType === 'error') {
      return undefined
    }

    if ('item' in event && event.item) {
      return this.handleItem(event.item as ThreadItem)
    }

    if ('delta' in event) {
      const deltaText = this.extractDeltaText((event as any).delta)
      if (deltaText) {
        // Handle streaming deltas if needed
        return undefined
      }
    }

    if (event.type === 'response.completed') {
      const text = this.extractResponseText((event as ResponseCompletedEvent).response)
      if (text) {
        this.sections.messages.push(text)
        return this.buildOutput()
      }
    }

    if (event.type === 'response.error') {
      const errorMessage =
        (event as ResponseErrorEvent).error?.message ?? 'Codex encountered an error.'
      this.sections.messages.push(`❌ Error: ${errorMessage}`)
      return this.buildOutput()
    }

    return undefined
  }

  private buildOutput(): string {
    const parts: string[] = []

    // Add reasoning sections (formatted as italic/thinking blocks)
    if (this.sections.reasoning.length > 0) {
      for (const reasoning of this.sections.reasoning) {
        parts.push(`_${reasoning}_`)
      }
    }

    // Add messages
    if (this.sections.messages.length > 0) {
      parts.push(...this.sections.messages)
    }

    // Add usage stats at the end if available
    if (this.sections.usage) {
      const { input_tokens, cached_input_tokens, output_tokens } = this.sections.usage
      const total = input_tokens + output_tokens
      parts.push(
        `\n---\n**Tokens:** ${total.toLocaleString()} total (${input_tokens.toLocaleString()} in, ${output_tokens.toLocaleString()} out${cached_input_tokens > 0 ? `, ${cached_input_tokens.toLocaleString()} cached` : ''})`
      )
    }

    return parts.join('\n\n')
  }

  private normalize(raw: string): string | undefined {
    const trimmed = raw.trim()
    if (!trimmed) return undefined

    if (trimmed.startsWith('event:') || trimmed.startsWith('id:')) {
      return undefined
    }

    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') return undefined
      return data
    }

    return trimmed
  }

  private extractDeltaText(delta: unknown): string | undefined {
    if (!delta) return undefined

    if (typeof delta === 'string') {
      return delta
    }

    if (Array.isArray(delta)) {
      return delta
        .map(part => this.extractDeltaText(part))
        .filter((chunk): chunk is string => Boolean(chunk))
        .join('') || undefined
    }

    if (typeof delta === 'object') {
      const obj = delta as Record<string, unknown>
      if (typeof obj.text === 'string') {
        return obj.text
      }

      if (Array.isArray(obj.content)) {
        const text = obj.content
          .map(entry =>
            typeof entry === 'object' && entry !== null && 'text' in entry && typeof entry.text === 'string'
              ? entry.text
              : ''
          )
          .join('')
        return text || undefined
      }

      if (typeof obj.delta === 'string') {
        return obj.delta
      }
    }

    return undefined
  }

  private extractResponseText(response: unknown): string | undefined {
    if (!response || typeof response !== 'object') return undefined

    const record = response as Record<string, unknown>

    if (typeof record.text === 'string') {
      return record.text
    }

    if (Array.isArray(record.output)) {
      const text = (record.output as Array<Record<string, unknown>>)
        .map(part => (typeof part.text === 'string' ? part.text : ''))
        .join('')
      return text || undefined
    }

    return undefined
  }
}
