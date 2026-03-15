import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { BookOpen, Download, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

interface DocsStatus {
  downloaded: boolean
  doc_count: number
  last_synced: number | null
  cache_size_bytes: number
}

interface DocsSettingsProps {
  autoSync: boolean
  onAutoSyncChange: (enabled: boolean) => void
}

export function DocsSettings({ autoSync, onAutoSyncChange }: DocsSettingsProps) {
  const [status, setStatus] = useState<DocsStatus | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [clearing, setClearing] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const s = await invoke<DocsStatus>("get_autohand_docs_status")
      setStatus(s)
    } catch (e) {
      console.error("Failed to load docs status:", e)
    }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await invoke("sync_autohand_docs")
      await loadStatus()
    } catch (e) {
      console.error("Sync failed:", e)
    } finally {
      setSyncing(false)
    }
  }

  const handleClear = async () => {
    setClearing(true)
    try {
      await invoke("clear_autohand_docs_cache")
      await loadStatus()
    } catch (e) {
      console.error("Clear failed:", e)
    } finally {
      setClearing(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  const formatTime = (epoch: number) => {
    const d = new Date(epoch)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return d.toLocaleDateString()
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="size-5" />
          Autohand Documentation
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Keep a local copy of the Autohand docs for instant search and offline reading.
        </p>
      </div>

      {/* Sync button + status */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button onClick={handleSync} disabled={syncing} size="sm" className="gap-2">
            {syncing ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {syncing ? "Syncing..." : "Sync Documentation"}
          </Button>
          {status?.downloaded && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={clearing}
              className="gap-2 text-muted-foreground"
            >
              {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Clear Cache
            </Button>
          )}
        </div>

        {status && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {status.downloaded ? (
              <>
                <p>{status.doc_count} docs cached ({formatBytes(status.cache_size_bytes)})</p>
                {status.last_synced && <p>Last synced {formatTime(status.last_synced)}</p>}
              </>
            ) : (
              <p>No docs downloaded yet. Click Sync to get started.</p>
            )}
          </div>
        )}
      </div>

      {/* Auto-sync toggle */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
        <div className="space-y-0.5">
          <Label htmlFor="docs-auto-sync" className="text-sm font-medium">Sync on launch</Label>
          <p className="text-xs text-muted-foreground">Automatically update docs when Commander starts.</p>
        </div>
        <Switch
          id="docs-auto-sync"
          checked={autoSync}
          onCheckedChange={onAutoSyncChange}
        />
      </div>
    </div>
  )
}
