import React from 'react'

interface ReasoningProps {
  children: React.ReactNode
}

export function Reasoning({ children }: ReasoningProps) {
  return (
    <div className="flex items-start gap-2 text-sm leading-relaxed">
      <span className="select-none text-muted-foreground mt-0.5">•</span>
      <div className="flex-1 min-w-0 text-muted-foreground italic">
        {children}
      </div>
    </div>
  )
}
