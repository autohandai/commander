import { useState, useEffect, useRef } from "react"
import { GitBranch, Check, X, Loader2, AlertCircle, Terminal } from "lucide-react"
import { GithubLogo, GitlabLogo, CirclesFour } from "@phosphor-icons/react"
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"

interface CloneRepositoryModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type Platform = 'github' | 'gitlab' | 'bitbucket'
type CloneStep = 'url' | 'cloning' | 'success' | 'error'

interface CloneStatus {
  step: string
  status: 'pending' | 'running' | 'completed' | 'error'
  message: string
}

const platforms = [
  {
    id: 'github' as Platform,
    name: 'GitHub',
    icon: GithubLogo,
    placeholder: 'https://github.com/user/repository.git'
  },
  {
    id: 'gitlab' as Platform,
    name: 'GitLab',
    icon: GitlabLogo,
    placeholder: 'https://gitlab.com/user/repository.git'
  },
  {
    id: 'bitbucket' as Platform,
    name: 'Bitbucket',
    icon: CirclesFour,
    placeholder: 'https://bitbucket.org/user/repository.git'
  }
]

export function CloneRepositoryModal({ 
  isOpen, 
  onClose, 
  onSuccess 
}: CloneRepositoryModalProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('github')
  const [repoUrl, setRepoUrl] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [defaultProjectsFolder, setDefaultProjectsFolder] = useState('')
  const [currentStep, setCurrentStep] = useState<CloneStep>('url')
  const [cloneSteps, setCloneSteps] = useState<CloneStatus[]>([])
  const [error, setError] = useState('')
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [showConsoleOutput, setShowConsoleOutput] = useState(true)
  const consoleEndRef = useRef<HTMLDivElement>(null)

  // Cmd+Enter shortcut to start clone on URL step
  const handleKeyDown: React.KeyboardEventHandler = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (
        currentStep === 'url' &&
        repoUrl.trim() &&
        localPath.trim()
      ) {
        startClone()
      }
    }
  }
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || '');

  // Load app settings and default projects folder on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load app settings for console output preference
        const appSettings = await invoke('load_app_settings') as any
        setShowConsoleOutput(appSettings.show_console_output ?? true)

        // First try to load saved projects folder
        const savedFolder = await invoke('load_projects_folder') as string | null
        
        let folder: string
        if (savedFolder) {
          folder = savedFolder
        } else {
          // Fall back to default projects folder
          folder = await invoke('get_default_projects_folder') as string
        }
        
        setDefaultProjectsFolder(folder)
        // Set initial local path to the default projects folder
        if (!localPath) {
          setLocalPath(folder)
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
    
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  // Update local path when repo URL changes to suggest folder name
  useEffect(() => {
    if (repoUrl && defaultProjectsFolder) {
      try {
        const url = new URL(repoUrl)
        const pathParts = url.pathname.split('/')
        const repoName = pathParts[pathParts.length - 1]?.replace('.git', '') || 'repository'
        setLocalPath(`${defaultProjectsFolder}/${repoName}`)
      } catch (error) {
        // If URL is invalid, just use the default folder
        setLocalPath(defaultProjectsFolder)
      }
    }
  }, [repoUrl, defaultProjectsFolder])

  // Listen for clone progress events
  useEffect(() => {
    let unsubscribe: (() => void) | undefined

    const setupProgressListener = async () => {
      unsubscribe = await listen('clone-progress', (event: any) => {
        setConsoleOutput(prev => [...prev, event.payload])
      })
    }

    if (currentStep === 'cloning') {
      setupProgressListener()
    }

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [currentStep])

  // Auto-scroll console to bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [consoleOutput])

  const resetModal = () => {
    setSelectedPlatform('github')
    setRepoUrl('')
    setLocalPath(defaultProjectsFolder)
    setCurrentStep('url')
    setCloneSteps([])
    setError('')
    setConsoleOutput([])
  }

  const handleClose = () => {
    resetModal()
    onClose()
  }

  const updateStepStatus = (stepIndex: number, status: CloneStatus['status'], message?: string) => {
    setCloneSteps(prev => prev.map((step, index) => 
      index === stepIndex 
        ? { ...step, status, ...(message && { message }) }
        : step
    ))
  }

  const startClone = async () => {
    if (!repoUrl.trim() || !localPath.trim()) {
      setError('Please fill in all required fields')
      return
    }

    setCurrentStep('cloning')
    setError('')
    
    const steps: CloneStatus[] = [
      { step: 'validate', status: 'running', message: 'Validating repository URL...' },
      { step: 'access', status: 'pending', message: 'Checking repository access...' },
      { step: 'clone', status: 'pending', message: 'Cloning repository...' },
      { step: 'complete', status: 'pending', message: 'Finalizing...' }
    ]
    setCloneSteps(steps)

    try {
      // Step 1: Validate URL and check access
      try {
        await invoke('validate_git_repository_url', { url: repoUrl })
        updateStepStatus(0, 'completed', 'URL validated successfully')
        
        // Step 2: Repository is accessible (already checked in validation)
        updateStepStatus(1, 'running', 'Checking repository access...')
        updateStepStatus(1, 'completed', 'Repository accessible')
      } catch (validationError) {
        updateStepStatus(0, 'error', 'URL validation failed')
        throw validationError
      }

      // Step 3: Clone
      updateStepStatus(2, 'running', 'Cloning repository...')
      
      // Use Tauri command to clone repository
      await invoke('clone_repository', {
        url: repoUrl,
        destination: localPath
      })

      updateStepStatus(2, 'completed', 'Repository cloned successfully')
      
      // Step 4: Complete
      updateStepStatus(3, 'running', 'Finalizing setup...')
      
      // Open the newly cloned project via backend (validates, sets cwd, updates recents w/ dedup)
      try {
        await invoke('open_existing_project', { projectPath: localPath, project_path: localPath })
      } catch (err) {
        console.warn('Failed to open cloned project in backend:', err)
        // Don't fail the whole operation if this fails
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
      updateStepStatus(3, 'completed', 'Clone completed successfully')

      setCurrentStep('success')
      
      // Auto-close and show success notification after 2 seconds
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 2000)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
      setError(errorMessage)
      setCurrentStep('error')
      
      // Mark current running step as error
      const runningStepIndex = cloneSteps.findIndex(step => step.status === 'running')
      if (runningStepIndex !== -1) {
        updateStepStatus(runningStepIndex, 'error', errorMessage)
      }
    }
  }

  const renderUrlStep = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium mb-4">Select Platform</h3>
        <div className="grid grid-cols-3 gap-3">
          {platforms.map((platform) => {
            const Icon = platform.icon
            return (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(platform.id)}
                className={`flex flex-col items-center gap-3 p-4 rounded-lg border-2 transition-colors hover:bg-accent ${
                  selectedPlatform === platform.id 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border'
                }`}
              >
                <Icon className="h-8 w-8" weight={platform.id !== 'bitbucket' ? "duotone" : undefined} />
                <span className="text-sm font-medium">{platform.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="repo-url">Repository URL *</Label>
          <Input
            id="repo-url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder={platforms.find(p => p.id === selectedPlatform)?.placeholder}
            className="font-mono text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="local-path">Local Path *</Label>
          <Input
            id="local-path"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder={defaultProjectsFolder ? `${defaultProjectsFolder}/repository-name` : "/Users/username/Projects/repository-name"}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Repository will be cloned to your default projects folder. You can change the path if needed.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}
    </div>
  )

  const renderCloningStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">Cloning Repository</h3>
        <p className="text-sm text-muted-foreground">
          Please wait while we clone your repository...
        </p>
      </div>

      <div className="space-y-3">
        {cloneSteps.map((step) => (
          <div key={step.step} className="flex items-center gap-3 p-3 rounded-lg border">
            <div className="flex-shrink-0">
              {step.status === 'pending' && (
                <div className="h-4 w-4 rounded-full bg-muted" />
              )}
              {step.status === 'running' && (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              {step.status === 'completed' && (
                <Check className="h-4 w-4 text-green-600" />
              )}
              {step.status === 'error' && (
                <X className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{step.message}</p>
            </div>
          </div>
        ))}
      </div>

      {showConsoleOutput && consoleOutput.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <Label className="text-sm font-medium">Console Output</Label>
          </div>
          <div className="bg-black text-green-400 rounded-lg p-4 font-mono text-xs max-h-64 overflow-y-auto">
            {consoleOutput.map((line, index) => (
              <div key={index} className="whitespace-pre-wrap break-all">
                {line}
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>
      )}
    </div>
  )

  const renderSuccessStep = () => (
    <div className="text-center space-y-4 py-6">
      <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
        <Check className="h-8 w-8 text-green-600" />
      </div>
      <div>
        <h3 className="text-lg font-medium text-green-600 mb-2">Clone Successful!</h3>
        <p className="text-sm text-muted-foreground">
          Repository cloned to {localPath}
        </p>
      </div>
    </div>
  )

  const renderErrorStep = () => (
    <div className="text-center space-y-4 py-6">
      <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
        <X className="h-8 w-8 text-red-600" />
      </div>
      <div>
        <h3 className="text-lg font-medium text-destructive mb-2">Clone Failed</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {error || 'An unexpected error occurred while cloning the repository.'}
        </p>
        <Button variant="outline" onClick={() => setCurrentStep('url')}>
          Try Again
        </Button>
      </div>
    </div>
  )

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Clone Repository
          </DialogTitle>
        </DialogHeader>

        {currentStep === 'url' && renderUrlStep()}
        {currentStep === 'cloning' && renderCloningStep()}
        {currentStep === 'success' && renderSuccessStep()}
        {currentStep === 'error' && renderErrorStep()}

        {currentStep === 'url' && (
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <div className="flex flex-col items-end gap-1">
              <Button onClick={startClone} disabled={!repoUrl.trim() || !localPath.trim()}>
                Start Clone
              </Button>
              <span className="hidden sm:flex items-center text-[10px] leading-none text-muted-foreground gap-1 opacity-70">
                <span>Shortcut</span>
                <span>•</span>
                <kbd className="px-1 py-0 rounded border bg-muted">{isMac ? 'Cmd' : 'Ctrl'}</kbd>
                <span>+</span>
                <kbd className="px-1 py-0 rounded border bg-muted">Enter</kbd>
              </span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
