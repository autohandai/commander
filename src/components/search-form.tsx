import { useState, useRef, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { Search, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarInput,
} from "@/components/ui/sidebar"

interface DocSearchResult {
  slug: string
  title: string
  category: string
  snippet: string
}

interface SearchFormProps extends React.ComponentProps<"form"> {
  onDocSelect?: (slug: string) => void
}

export function SearchForm({ onDocSelect, ...props }: SearchFormProps) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DocSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [docsAvailable, setDocsAvailable] = useState<boolean | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounced search (online-first, falls back to cached index)
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setOpen(false)
      setDocsAvailable(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const hits = await invoke<DocSearchResult[]>("search_autohand_docs", { query: query.trim() })
        setResults(hits)
        setSelectedIndex(0)
        setDocsAvailable(true)
        setOpen(true)
      } catch {
        setResults([])
        setDocsAvailable(false)
        setOpen(true)
      }
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleSelect = useCallback((slug: string) => {
    setOpen(false)
    setQuery("")
    onDocSelect?.(slug)
  }, [onDocSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (results[selectedIndex]) {
        handleSelect(results[selectedIndex].slug)
      }
    } else if (e.key === "Escape") {
      setOpen(false)
      inputRef.current?.blur()
    }
  }, [open, results, selectedIndex, handleSelect])

  return (
    <div ref={containerRef} className="relative">
      <form {...props} onSubmit={(e) => e.preventDefault()}>
        <SidebarGroup className="py-0">
          <SidebarGroupContent className="relative">
            <Label htmlFor="search" className="sr-only">Search</Label>
            <SidebarInput
              ref={inputRef}
              id="search"
              placeholder="Search the docs..."
              className="pl-8 pr-7"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => { if (query.trim() && (results.length > 0 || !docsAvailable)) setOpen(true) }}
            />
            <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 select-none opacity-50" />
            {query && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 opacity-50 hover:opacity-100"
                onClick={() => { setQuery(""); setResults([]); setOpen(false) }}
              >
                <X className="size-3" />
              </button>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </form>

      {/* Floating results panel */}
      {open && (
        <div className="absolute left-2 right-2 top-full z-50 mt-1 max-h-[320px] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {results.length > 0 ? (
            results.slice(0, 8).map((result, i) => (
              <button
                key={result.slug}
                type="button"
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors",
                  i === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
                onClick={() => handleSelect(result.slug)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <div className="flex items-center gap-2">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{result.title}</span>
                  <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {result.category}
                  </span>
                </div>
                <p className="pl-[22px] text-xs text-muted-foreground line-clamp-1">{result.snippet}</p>
              </button>
            ))
          ) : docsAvailable === false ? (
            <div className="px-3 py-4 text-center text-sm text-muted-foreground">
              <p>Could not reach docs index.</p>
              <p className="text-xs mt-1">Sync docs in Settings &rarr; Docs for offline search.</p>
            </div>
          ) : (
            <div className="px-3 py-3 text-center text-xs text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>
      )}
    </div>
  )
}
