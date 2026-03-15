import { useState, useEffect } from "react"
import { invoke } from "@tauri-apps/api/core"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowLeft, Loader2, ExternalLink } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"

interface DocContent {
  slug: string
  title: string
  category: string
  markdown: string
}

interface DocsViewerProps {
  slug: string
  onBack: () => void
}

export function DocsViewer({ slug, onBack }: DocsViewerProps) {
  const [doc, setDoc] = useState<DocContent | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    invoke<DocContent>("get_autohand_doc", { slug })
      .then(setDoc)
      .catch((e) => setError(typeof e === "string" ? e : "Failed to load doc"))
      .finally(() => setLoading(false))
  }, [slug])

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        {doc && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-muted-foreground">{doc.category}</span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm font-medium truncate">{doc.title}</span>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center p-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={onBack}>Go back</Button>
        </div>
      ) : doc ? (
        <ScrollArea className="flex-1">
          <article className="prose prose-sm dark:prose-invert max-w-3xl mx-auto px-6 py-8">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...rest }) => {
                  return (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1"
                      {...rest}
                    >
                      {children}
                      <ExternalLink className="inline size-3 opacity-50" />
                    </a>
                  )
                },
              }}
            >
              {doc.markdown}
            </ReactMarkdown>
          </article>
        </ScrollArea>
      ) : null}
    </div>
  )
}
