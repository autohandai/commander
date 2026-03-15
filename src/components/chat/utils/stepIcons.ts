import { CircleDot, Circle, CheckCircle2, XCircle, Terminal, FileText, Search, Sparkles, Info } from 'lucide-react'

export interface StepMetaInput {
  status?: string
  label?: string
}

export function getStepIconMeta({ status, label }: StepMetaInput) {
  const lower = (label || '').toLowerCase()
  if (status === 'completed') {
    return { icon: CheckCircle2, className: 'border-[hsl(var(--success))] text-[hsl(var(--success))]' }
  }
  if (status === 'failed') {
    return { icon: XCircle, className: 'border-destructive text-destructive' }
  }
  if (status === 'pending') {
    return { icon: Circle, className: 'border-muted-foreground text-muted-foreground' }
  }
  if (status === 'in_progress') {
    return { icon: CircleDot, className: 'border-[hsl(var(--link))] text-[hsl(var(--link))] animate-pulse' }
  }

  if (/bash(:|\b)/i.test(label || '')) {
    return { icon: Terminal, className: 'border-[hsl(var(--link))] text-[hsl(var(--link))]' }
  }
  if (/bashoutput|output|stdout|stderr/.test(lower)) {
    return { icon: FileText, className: 'border-muted-foreground text-muted-foreground' }
  }
  if (/search|looking up|find/.test(lower)) {
    return { icon: Search, className: 'border-purple-400 text-purple-400' }
  }
  if (/plan|consider|thinking|analyzing/.test(lower)) {
    return { icon: Sparkles, className: 'border-[hsl(var(--warning))] text-[hsl(var(--warning))]' }
  }
  if (/read|scanned|inspect|load/.test(lower)) {
    return { icon: Info, className: 'border-teal-400 text-teal-400' }
  }

  return { icon: CircleDot, className: 'border-muted-foreground text-muted-foreground' }
}
