import { Badge } from '@/components/ui/badge'
import type { NormalizedMeta } from './types'

interface MetaFooterProps {
  meta: NormalizedMeta
}

export function MetaFooter({ meta }: MetaFooterProps) {
  const hasContent =
    meta.command || meta.model || typeof meta.tokensUsed === 'number' || meta.success || meta.provider

  if (!hasContent) return null

  return (
    <div className="text-xs text-muted-foreground bg-muted/20 rounded p-2 border">
      {meta.command && (
        <div className="mb-2">
          <span className="font-medium">Command:</span> {meta.command}
        </div>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {meta.model && <span>model: {meta.model}</span>}
        {meta.provider && <span>provider: {meta.provider}</span>}
        {typeof meta.tokensUsed === 'number' && <span>tokens: {meta.tokensUsed}</span>}
        {meta.success && (
          <Badge variant="outline" className="border-[hsl(var(--success))] text-[hsl(var(--success))] uppercase tracking-wide">
            success
          </Badge>
        )}
      </div>
    </div>
  )
}
