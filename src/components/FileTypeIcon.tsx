import { useMemo, useState } from 'react'
import { getIconForFile } from 'vscode-icons-js'
import { File as LucideFile } from 'lucide-react'

export interface FileTypeIconProps {
  filename: string
  className?: string
  size?: number
}

export function FileTypeIcon({ filename, className = 'mr-2', size = 16 }: FileTypeIconProps) {
  const [error, setError] = useState(false)
  const iconName = useMemo(() => getIconForFile(filename), [filename])
  const src = `https://cdn.jsdelivr.net/gh/vscode-icons/vscode-icons/icons/${iconName}`

  if (!error) {
    return (
      <img
        src={src}
        alt={filename}
        width={size}
        height={size}
        className={className}
        onError={() => setError(true)}
      />
    )
  }
  // Fallback
  return <LucideFile className={`h-4 w-4 text-muted-foreground ${className}`} />
}
