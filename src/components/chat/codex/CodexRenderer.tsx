import React from 'react'
import { Response, ShellOutput, FilePath } from './Response'
import { Reasoning } from './Reasoning'

interface CodexRendererProps {
  content: string
}

interface ParsedItem {
  type: 'reasoning' | 'message' | 'command' | 'file_change' | 'tool_call' | 'web_search' | 'todo' | 'usage'
  content: string
  metadata?: {
    status?: string
    command?: string
    output?: string
    files?: Array<{ icon: string; path: string }>
    server?: string
    tool?: string
    query?: string
    todos?: Array<{ completed: boolean; text: string }>
    tokens?: { input: number; output: number; cached?: number; total: number }
  }
}

export function CodexRenderer({ content }: CodexRendererProps) {
  const items = parseContent(content)

  return (
    <div className="space-y-0.5 -ml-3">
      {items.map((item, index) => {
        switch (item.type) {
          case 'reasoning':
            return (
              <Reasoning key={index}>
                {item.content}
              </Reasoning>
            )

          case 'message':
            return (
              <Response key={index}>
                {item.content}
              </Response>
            )

          case 'command':
            const { command, output, status } = item.metadata || {}
            return (
              <Response
                key={index}
                icon="◎"
                title={`Ran ${command}`}
                expandable={!!output}
                defaultExpanded={false}
              >
                {output && <ShellOutput command={command || ''} output={output} />}
              </Response>
            )

          case 'file_change':
            const { files = [] } = item.metadata || {}
            return (
              <Response
                key={index}
                icon="◎"
                title={`File changes ${item.metadata?.status || ''}`}
                expandable={files.length > 0}
                defaultExpanded={false}
              >
                <div className="space-y-0.5">
                  {files.map((file, i) => (
                    <FilePath key={i} path={file.path} icon={file.icon} />
                  ))}
                </div>
              </Response>
            )

          case 'tool_call':
            return (
              <Response key={index} icon="◎">
                {item.metadata?.server}/{item.metadata?.tool}
              </Response>
            )

          case 'web_search':
            return (
              <Response key={index} icon="🔍">
                {item.metadata?.query}
              </Response>
            )

          case 'todo':
            const { todos = [] } = item.metadata || {}
            return (
              <Response
                key={index}
                title="Todo List"
                expandable={todos.length > 0}
                defaultExpanded={true}
              >
                <div className="space-y-0.5">
                  {todos.map((todo, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span>{todo.completed ? '✅' : '⬜'}</span>
                      <span>{todo.text}</span>
                    </div>
                  ))}
                </div>
              </Response>
            )

          case 'usage':
            const { tokens } = item.metadata || {}
            if (!tokens) return null
            return (
              <div key={index} className="mt-2 pt-2 border-t border-muted-foreground/20 text-xs text-muted-foreground">
                Tokens: {tokens.total.toLocaleString()} total ({tokens.input.toLocaleString()} in, {tokens.output.toLocaleString()} out{tokens.cached ? `, ${tokens.cached.toLocaleString()} cached` : ''})
              </div>
            )

          default:
            return null
        }
      })}
    </div>
  )
}

function parseContent(content: string): ParsedItem[] {
  const items: ParsedItem[] = []
  const blocks = content.split('\n\n')

  for (const block of blocks) {
    if (!block.trim()) continue

    // Reasoning (italic)
    if (block.startsWith('_') && block.endsWith('_')) {
      items.push({
        type: 'reasoning',
        content: block.slice(1, -1).trim(),
      })
      continue
    }

    // Command execution
    if (block.includes('**Command:**')) {
      const commandMatch = block.match(/\*\*Command:\*\* `([^`]+)`/)
      const outputMatch = block.match(/```\n([\s\S]+?)\n```/)
      const statusMatch = block.match(/^(✅|❌|⏳)/)

      items.push({
        type: 'command',
        content: block,
        metadata: {
          command: commandMatch?.[1],
          output: outputMatch?.[1],
          status: statusMatch?.[1],
        },
      })
      continue
    }

    // File changes
    if (block.includes('**File Changes:**')) {
      const lines = block.split('\n')
      const statusMatch = lines[0].match(/^(✅|❌)/)
      const files: Array<{ icon: string; path: string }> = []

      lines.slice(1).forEach(line => {
        const match = line.match(/^(➕|➖|✏️)\s+\[([^\]]+)\]\(file:\/\/([^)]+)\)/)
        if (match) {
          files.push({ icon: match[1], path: match[3] })
        }
      })

      items.push({
        type: 'file_change',
        content: block,
        metadata: {
          status: statusMatch?.[1],
          files,
        },
      })
      continue
    }

    // Tool calls
    if (block.includes('**Tool Call:**')) {
      const match = block.match(/\*\*Tool Call:\*\* ([^/]+)\/(.+)/)
      items.push({
        type: 'tool_call',
        content: block,
        metadata: {
          server: match?.[1],
          tool: match?.[2],
        },
      })
      continue
    }

    // Web search
    if (block.includes('**Web Search:**')) {
      const match = block.match(/\*\*Web Search:\*\* (.+)/)
      items.push({
        type: 'web_search',
        content: block,
        metadata: {
          query: match?.[1],
        },
      })
      continue
    }

    // Todo list
    if (block.includes('**Todo List:**')) {
      const lines = block.split('\n').slice(1)
      const todos: Array<{ completed: boolean; text: string }> = []

      lines.forEach(line => {
        const match = line.match(/^(✅|⬜)\s+(.+)/)
        if (match) {
          todos.push({
            completed: match[1] === '✅',
            text: match[2],
          })
        }
      })

      items.push({
        type: 'todo',
        content: block,
        metadata: { todos },
      })
      continue
    }

    // Usage stats
    if (block.includes('**Tokens:**')) {
      const match = block.match(/\*\*Tokens:\*\* ([\d,]+) total \(([\d,]+) in, ([\d,]+) out(?:, ([\d,]+) cached)?\)/)
      if (match) {
        items.push({
          type: 'usage',
          content: block,
          metadata: {
            tokens: {
              total: parseInt(match[1].replace(/,/g, '')),
              input: parseInt(match[2].replace(/,/g, '')),
              output: parseInt(match[3].replace(/,/g, '')),
              cached: match[4] ? parseInt(match[4].replace(/,/g, '')) : undefined,
            },
          },
        })
      }
      continue
    }

    // Regular message
    items.push({
      type: 'message',
      content: block,
    })
  }

  return items
}
