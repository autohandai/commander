import { Component, ErrorInfo, ReactNode } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  /** When any value in this array changes, the error state auto-resets.
   *  This prevents the boundary from being permanently stuck after a
   *  transient render error (e.g. a streaming message briefly crashing). */
  resetKeys?: unknown[]
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: ErrorInfo
  /** Snapshot of resetKeys at the time the error was caught. */
  prevResetKeys?: unknown[]
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  public static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Auto-reset: if resetKeys changed since the error was caught, clear the error.
    if (state.hasError && state.prevResetKeys && props.resetKeys) {
      const changed = props.resetKeys.length !== state.prevResetKeys.length ||
        props.resetKeys.some((key, i) => key !== state.prevResetKeys![i])
      if (changed) {
        return { hasError: false, error: undefined, errorInfo: undefined, prevResetKeys: undefined }
      }
    }
    return null
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
    this.setState({
      error,
      errorInfo,
      prevResetKeys: this.props.resetKeys ? [...this.props.resetKeys] : undefined,
    })

    // Call the optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined, prevResetKeys: undefined })
  }

  public render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center p-8 space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold">Something went wrong</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              An unexpected error occurred while rendering this component.
            </p>
            {this.state.error && (
              <details className="text-xs text-muted-foreground mt-4">
                <summary className="cursor-pointer hover:text-foreground">
                  Error Details (click to expand)
                </summary>
                <pre className="text-left mt-2 p-2 bg-muted rounded text-xs overflow-auto max-w-md">
                  {this.state.error.message}
                  {this.state.errorInfo?.componentStack && (
                    <div className="mt-2">
                      <strong>Component Stack:</strong>
                      {this.state.errorInfo.componentStack}
                    </div>
                  )}
                </pre>
              </details>
            )}
            <Button
              variant="outline"
              onClick={this.handleReset}
              className="mt-4"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
