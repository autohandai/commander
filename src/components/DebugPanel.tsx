import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

export function DebugPanel() {
  const [error, setError] = useState<Error | null>(null)

  const triggerJSError = () => {
    throw new Error('Test JavaScript Error - This is intentional for debugging')
  }

  const triggerStateError = () => {
    setError(new Error('Test State Error - This should be caught by error boundary'))
  }

  const triggerRenderError = () => {
    // This will cause a rendering error
    const badComponent = () => {
      const obj: any = null
      return obj.nonexistent.property
    }
    badComponent()
  }

  if (error) {
    throw error
  }

  return (
    <Card className="m-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          Debug Panel - Error Testing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground mb-4">
          Use these buttons to test error boundaries:
        </p>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={triggerJSError} variant="destructive" size="sm">
            Trigger JS Error
          </Button>
          <Button onClick={triggerStateError} variant="destructive" size="sm">
            Trigger State Error
          </Button>
          <Button onClick={triggerRenderError} variant="destructive" size="sm">
            Trigger Render Error
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}