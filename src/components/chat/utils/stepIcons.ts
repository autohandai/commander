import { CircleDot, Circle, CheckCircle2, XCircle, Terminal, FileText, Search, Sparkles, Info } from 'lucide-react'

export interface StepMetaInput {
  status?: string
  label?: string
}

export function getStepIconMeta({ status, label }: StepMetaInput) {
  const lower = (label || '').toLowerCase()
  if (status === 'completed') {
    return { icon: CheckCircle2, className: 'border-emerald-500 text-emerald-500' }
  }
  if (status === 'failed') {
    return { icon: XCircle, className: 'border-red-500 text-red-500' }
  }
  if (status === 'pending') {
    return { icon: Circle, className: 'border-muted-foreground text-muted-foreground' }
  }
  if (status === 'in_progress') {
    return { icon: CircleDot, className: 'border-blue-500 text-blue-500 animate-pulse' }
  }

  if (/bash(:|\b)/i.test(label || '')) {
    return { icon: Terminal, className: 'border-blue-500 text-blue-500' }
  }
  if (/bashoutput|output|stdout|stderr/.test(lower)) {
    return { icon: FileText, className: 'border-slate-400 text-slate-400' }
  }
  if (/search|looking up|find/.test(lower)) {
    return { icon: Search, className: 'border-purple-400 text-purple-400' }
  }
  if (/plan|consider|thinking|analyzing/.test(lower)) {
    return { icon: Sparkles, className: 'border-orange-400 text-orange-400' }
  }
  if (/read|scanned|inspect|load/.test(lower)) {
    return { icon: Info, className: 'border-teal-400 text-teal-400' }
  }

  return { icon: CircleDot, className: 'border-muted-foreground text-muted-foreground' }
}
