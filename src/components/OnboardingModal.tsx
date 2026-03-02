import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { MessageCircle, Code, Bot, FolderOpen, GitBranch } from "lucide-react"
import { useSettings } from "@/contexts/settings-context"

interface OnboardingModalProps {
  isOpen: boolean
  onComplete: () => void
}

const FEATURES = [
  {
    id: "ai-chat",
    title: "AI Chat",
    icon: MessageCircle,
    description:
      "Chat with Claude, Codex, Gemini, and Ollama. Switch agents mid-conversation.",
    screenshot: "/screenshots/onboarding-ai-chat.png",
  },
  {
    id: "code-view",
    title: "Code View",
    icon: Code,
    description:
      "Browse and edit code with syntax highlighting. Explore project structure.",
    screenshot: "/screenshots/onboarding-code-view.png",
  },
  {
    id: "multi-agent",
    title: "Multi-Agent",
    icon: Bot,
    description:
      "Run multiple AI coding agents simultaneously. Compare and delegate.",
    screenshot: "/screenshots/onboarding-multi-agent.png",
  },
  {
    id: "projects",
    title: "Project Management",
    icon: FolderOpen,
    description:
      "Create, clone, and manage Git projects. Track recent work.",
    screenshot: "/screenshots/onboarding-projects.png",
  },
  {
    id: "git",
    title: "Git Integration",
    icon: GitBranch,
    description:
      "Branch management, commit history, diff views, and worktrees.",
    screenshot: "/screenshots/onboarding-git.png",
  },
] as const

type FeatureId = (typeof FEATURES)[number]["id"]

export function OnboardingModal({ isOpen, onComplete }: OnboardingModalProps) {
  const { updateSettings } = useSettings()
  const [activeFeature, setActiveFeature] = useState<FeatureId>(FEATURES[0].id)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [imgError, setImgError] = useState<Record<string, boolean>>({})

  const current = FEATURES.find((f) => f.id === activeFeature) ?? FEATURES[0]
  const ActiveIcon = current.icon
  const hasScreenshot = !imgError[current.id]

  const handleGetStarted = async () => {
    if (dontShowAgain) {
      await updateSettings({ has_completed_onboarding: true })
    }
    onComplete()
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onComplete() }}>
      <DialogContent
        className="max-w-[1040px] w-[92vw] p-0 gap-0 overflow-hidden"
        style={{ height: "min(80vh, 640px)" }}
      >
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl">Welcome to Commander</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your AI coding command center. Here's what you can do.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          <nav
            className="w-[240px] shrink-0 border-r bg-muted/30 py-2"
            data-testid="onboarding-sidebar"
          >
            {FEATURES.map((feature) => {
              const Icon = feature.icon
              const isActive = feature.id === activeFeature
              return (
                <button
                  key={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                  data-testid={`onboarding-feature-${feature.id}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {feature.title}
                </button>
              )
            })}
          </nav>

          {/* Preview */}
          <div
            className="flex-1 flex flex-col items-center justify-center p-8 text-center overflow-y-auto"
            data-testid="onboarding-preview"
          >
            {/* Screenshot area */}
            {hasScreenshot ? (
              <div className="w-full max-w-[560px] mb-6 rounded-lg overflow-hidden border border-border/50 bg-muted/20">
                <img
                  src={current.screenshot}
                  alt={`${current.title} screenshot`}
                  className="w-full h-auto object-contain"
                  data-testid="onboarding-preview-screenshot"
                  onError={() =>
                    setImgError((prev) => ({ ...prev, [current.id]: true }))
                  }
                />
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-muted/50 mb-6">
                <ActiveIcon className="h-12 w-12 text-primary" />
              </div>
            )}
            <h3 className="text-lg font-semibold mb-2" data-testid="onboarding-preview-title">
              {current.title}
            </h3>
            <p className="text-muted-foreground max-w-sm" data-testid="onboarding-preview-description">
              {current.description}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(checked) =>
                setDontShowAgain(checked === true)
              }
              data-testid="onboarding-dont-show"
            />
            Don't show again
          </label>
          <Button onClick={handleGetStarted} data-testid="onboarding-get-started">
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
