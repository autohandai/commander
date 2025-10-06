import { cn } from '@/lib/utils'
import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeBlock, CodeBlockCopyButton } from './CodeBlock'
import { invoke } from '@tauri-apps/api/core'

export type ResponseProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode
  parseIncompleteMarkdown?: boolean
  components?: Record<string, React.ComponentType<any>>
  allowedImagePrefixes?: string[]
  allowedLinkPrefixes?: string[]
  defaultOrigin?: string
  rehypePlugins?: any[]
  remarkPlugins?: any[]
}

function closeUnfinishedCodeFences(md: string): string {
  const fenceCount = (md.match(/```/g) || []).length
  if (fenceCount % 2 === 1) return md + '\n```'
  return md
}

function isAllowed(uri: string, allowed: string[] | undefined): boolean {
  if (!allowed || allowed.length === 0) return false
  if (allowed.includes('*')) return true
  return allowed.some((p) => uri.startsWith(p))
}

export const Response: React.FC<ResponseProps> = ({
  className,
  children,
  parseIncompleteMarkdown = true,
  components,
  allowedImagePrefixes = ['*'],
  allowedLinkPrefixes = ['*', 'file://'],
  defaultOrigin,
  rehypePlugins = [],
  remarkPlugins = [],
  ...divProps
}) => {
  const raw = typeof children === 'string' ? children : ''
  const content = parseIncompleteMarkdown ? closeUnfinishedCodeFences(raw || '') : raw || ''

  const handleFileClick = async (filePath: string, e: React.MouseEvent) => {
    e.preventDefault()
    try {
      await invoke('open_file_in_editor', { filePath })
    } catch (error) {
      console.error('Failed to open file:', error)
    }
  }

  const mergedComponents = {
    code: ({ inline, className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '')
      if (!inline && match) {
        return (
          <CodeBlock code={String(children).replace(/\n$/, '')} language={match[1]}>
            <CodeBlockCopyButton />
          </CodeBlock>
        )
      }
      return (
        <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono" {...props}>
          {children}
        </code>
      )
    },
    a: ({ href = '', children, ...props }: any) => {
      const safe = typeof href === 'string' && isAllowed(href, allowedLinkPrefixes)

      // Handle file:// links
      if (typeof href === 'string' && href.startsWith('file://')) {
        const filePath = href.replace('file://', '')
        return (
          <a
            href={href}
            onClick={(e) => handleFileClick(filePath, e)}
            className="text-blue-500 hover:text-blue-700 underline cursor-pointer"
            {...props}
          >
            {children}
          </a>
        )
      }

      return (
        <a href={safe ? href : undefined} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 underline" {...props}>
          {children}
        </a>
      )
    },
    img: ({ src = '', alt = '', ...props }: any) => {
      const safe = typeof src === 'string' && isAllowed(src, allowedImagePrefixes)
      if (!safe) return null
      return <img src={src} alt={alt} {...props} />
    },
    ul: ({ children }: any) => <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>,
    ol: ({ children }: any) => (
      <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
    ),
    li: ({ children }: any) => <li className="ml-2">{children}</li>,
    p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }: any) => <em className="italic">{children}</em>,
    ...(components || {}),
  } as any

  return (
    <div
      className={cn('[&>p]:leading-normal [&>p]:my-0 prose prose-sm max-w-none', className)}
      {...divProps}
    >
      {typeof children === 'string' ? (
        <ReactMarkdown
          remarkPlugins={[remarkGfm, ...remarkPlugins]}
          rehypePlugins={[...rehypePlugins]}
          components={mergedComponents}
        >
          {content}
        </ReactMarkdown>
      ) : (
        children
      )}
    </div>
  )
}
