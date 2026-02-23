import { useAuth } from '@/contexts/auth-context'
import { Loader2, ExternalLink, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

export function LoginScreen() {
  const { status, error, userCode, verificationUri, login, cancelLogin } = useAuth()
  const [copied, setCopied] = useState(false)

  const handleCopyCode = async () => {
    if (!userCode) return
    try {
      await navigator.clipboard.writeText(userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available
    }
  }

  const handleOpenBrowser = async () => {
    if (!verificationUri) return
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(verificationUri)
    } catch {
      // Fallback — user can open manually
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-background" data-testid="auth-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
        {/* Logo area */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl font-bold tracking-tight">Commander</div>
          <p className="text-sm text-muted-foreground text-center">
            Your AI-powered development partner
          </p>
        </div>

        {/* Unauthenticated — show sign in */}
        {status === 'unauthenticated' && (
          <Button onClick={login} size="lg" className="w-full max-w-[240px]">
            Sign In
          </Button>
        )}

        {/* Polling — show code and waiting */}
        {status === 'polling' && (
          <div className="flex flex-col items-center gap-4 w-full">
            <p className="text-sm text-muted-foreground">Waiting for authorization...</p>

            {userCode && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">Your code:</p>
                <div className="flex items-center gap-2">
                  <code className="text-2xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                    {userCode}
                  </code>
                  <Button variant="ghost" size="sm" onClick={handleCopyCode} title="Copy code">
                    <Copy className="h-4 w-4" />
                    {copied && <span className="text-xs ml-1">Copied</span>}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              A browser window should have opened. Sign in to continue.
            </p>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenBrowser}>
                <ExternalLink className="h-4 w-4 mr-1" />
                Open Again
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelLogin}>
                Cancel
              </Button>
            </div>

            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Expired */}
        {status === 'expired' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">Session expired</p>
            <Button onClick={login} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Try Again
            </Button>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={login} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Try Again
            </Button>
          </div>
        )}

        {/* Version */}
        <p className="text-xs text-muted-foreground mt-4">
          v0.1.0
        </p>
      </div>
    </div>
  )
}
