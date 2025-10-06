import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'

interface ResponseProps {
  children: React.ReactNode
  title?: string
  expandable?: boolean
  defaultExpanded?: boolean
  icon?: string
}

export function Response({ children, title, expandable = false, defaultExpanded = false, icon = '•' }: ResponseProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (!expandable) {
    return (
      <div className="flex items-start gap-2 text-sm leading-relaxed">
        <span className="select-none text-muted-foreground mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          {title && <span className="font-medium">{title}</span>}
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="text-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-2 w-full text-left hover:text-muted-foreground transition-colors"
      >
        <span className="select-none text-muted-foreground mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {title && <span>{title}</span>}
          {expanded ? <ChevronDown className="h-3 w-3 flex-shrink-0" /> : <ChevronRight className="h-3 w-3 flex-shrink-0" />}
        </div>
      </button>
      {expanded && (
        <div className="ml-5 mt-1 text-xs">
          {children}
        </div>
      )}
    </div>
  )
}

interface ShellOutputProps {
  command: string
  output: string
}

export function ShellOutput({ command, output }: ShellOutputProps) {
  return (
    <div className="bg-muted/30 rounded border border-muted-foreground/20 p-2 font-mono">
      <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
        <span>Shell</span>
      </div>
      <pre className="text-xs whitespace-pre-wrap overflow-x-auto">
        <code>$ {command}</code>
        {'\n'}
        {output}
      </pre>
    </div>
  )
}

interface FilePathProps {
  path: string
  icon?: string
}

export function FilePath({ path, icon = '📄' }: FilePathProps) {
  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    try {
      await invoke('open_file_in_editor', { filePath: path })
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="text-blue-500 hover:text-blue-700 hover:underline cursor-pointer text-left flex items-center gap-1"
    >
      {icon && <span className="text-xs">{icon}</span>}
      <span className="font-mono text-xs">{path}</span>
    </button>
  )
}
