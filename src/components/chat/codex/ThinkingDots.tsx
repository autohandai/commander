import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export interface ThinkingDotsProps extends React.HTMLAttributes<HTMLDivElement> {
  intervalMs?: number
  prefix?: string
}

// Em‑dash blink indicator: shows and hides — at a steady cadence
export const ThinkingDots: React.FC<ThinkingDotsProps> = ({
  className,
  intervalMs = 500,
  prefix = '',
  ...divProps
}) => {
  const [show, setShow] = useState(true)

  useEffect(() => {
    const id = setInterval(() => setShow((s) => !s), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return (
    <div className={cn('text-muted-foreground text-sm font-sans', className)} {...divProps}>
      {prefix}
      <span
        className="inline-block w-3 text-center transition-opacity"
        style={{ opacity: show ? 1 : 0 }}
        aria-hidden
      >
        —
      </span>
    </div>
  )
}

export default ThinkingDots
