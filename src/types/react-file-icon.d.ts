declare module 'react-file-icon' {
  import * as React from 'react'

  export interface FileIconProps extends React.SVGProps<SVGSVGElement> {
    extension?: string
    labelColor?: string
    glyphColor?: string
    fold?: boolean
    gradientColor?: string
    radius?: number
  }

  export const FileIcon: React.FC<FileIconProps>
  export const defaultStyles: Record<string, any>
}

