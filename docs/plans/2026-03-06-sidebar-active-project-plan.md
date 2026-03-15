# Sidebar Active Project Styling + Task Indicator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix light mode active project colors (harsh black bg -> soft blue tint) and add a spinning mini donut indicator when an agent is running.

**Architecture:** Add CSS variables for sidebar active state, thread `executingSessions.size` from ChatInterface up through ProjectView to App to AppSidebar via callbacks, render an SVG spinner ring on the active project row.

**Tech Stack:** Tailwind CSS variables, React props/callbacks, inline SVG

---

### Task 1: Add CSS Variables for Sidebar Active State

**Files:**
- Modify: `src/index.css:8-52` (`:root` block) and `src/index.css:53-96` (`.dark` block)

**Step 1: Add `--sidebar-active` variables to light mode (`:root`)**

In `src/index.css`, inside the `:root` block (after line 36 `--sidebar-ring`), add:

```css
    --sidebar-active: 214 95% 93%;
    --sidebar-active-foreground: 240 5.9% 10%;
```

**Step 2: Add `--sidebar-active` variables to dark mode (`.dark`)**

In `src/index.css`, inside the `.dark` block (after line 80 `--sidebar-ring`), add:

```css
    --sidebar-active: 224 50% 18%;
    --sidebar-active-foreground: 0 0% 98%;
```

**Step 3: Add same variables to `@media (prefers-color-scheme: dark)` block**

In the `@media (prefers-color-scheme: dark)` block at the bottom (after line 267 `--sidebar-ring`), add:

```css
    --sidebar-active: 224 50% 18%;
    --sidebar-active-foreground: 0 0% 98%;
```

**Step 4: Verify no build errors**

Run: `npx vite build --mode development 2>&1 | tail -5`
Expected: Build succeeds (CSS vars are inert until used)

**Step 5: Commit**

```bash
git add src/index.css
git commit -m "feat(sidebar): add CSS variables for active project styling"
```

---

### Task 2: Fix Active Project Styling in AppSidebar

**Files:**
- Modify: `src/components/app-sidebar.tsx:147` (active class) and `src/components/app-sidebar.tsx:149-152` (indicator div)

**Step 1: Replace the active project className**

In `src/components/app-sidebar.tsx`, line 147, replace:

```tsx
className={`relative ${currentProject?.path === project.path ? 'bg-primary text-primary-foreground font-medium' : ''}`}
```

With:

```tsx
className={`relative ${currentProject?.path === project.path ? 'bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))] font-medium border-l-2 border-[hsl(var(--sidebar-primary))]' : ''}`}
```

**Step 2: Remove the old white indicator bar div**

Delete lines 149-152 (the `{/* Active project indicator */}` block with the `div`):

```tsx
// DELETE THIS BLOCK:
{/* Active project indicator */}
{currentProject?.path === project.path && (
  <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-1 h-6 bg-primary-foreground rounded-r-full"></div>
)}
```

**Step 3: Visual verification**

Run: `bun tauri dev`
- In light mode: active project should have a soft blue background with dark text and a 2px blue left border
- In dark mode: active project should have a subtle blue-tinted dark background
- Non-active projects should look unchanged

**Step 4: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "fix(sidebar): use soft accent tint for active project in light mode"
```

---

### Task 3: Thread Executing State from ChatInterface to App

**Files:**
- Modify: `src/components/ChatInterface.tsx:45-49` (props interface) and `src/components/ChatInterface.tsx:88` (destructure) and near line 103 (effect)
- Modify: `src/App.tsx:38-43` (ProjectViewProps) and `src/App.tsx:45` (destructure) and `src/App.tsx:71-75` (ChatInterface render) and `src/App.tsx:551-557` (ProjectView render)
- Modify: `src/App.tsx:118` area (add state)

**Step 1: Add `onExecutingChange` to ChatInterfaceProps**

In `src/components/ChatInterface.tsx`, update the interface:

```tsx
interface ChatInterfaceProps {
  isOpen: boolean;
  selectedAgent?: string;
  project?: RecentProject;
  onExecutingChange?: (count: number) => void;
}
```

**Step 2: Destructure the new prop and add effect**

In `src/components/ChatInterface.tsx`, update the function signature (line 88):

```tsx
export function ChatInterface({ isOpen, selectedAgent, project, onExecutingChange }: ChatInterfaceProps) {
```

Add a `useEffect` right after the `executingSessions` state declaration (after line 103):

```tsx
  useEffect(() => {
    onExecutingChange?.(executingSessions.size);
  }, [executingSessions.size, onExecutingChange]);
```

**Step 3: Add `onExecutingChange` to ProjectViewProps and thread it**

In `src/App.tsx`, update `ProjectViewProps`:

```tsx
interface ProjectViewProps {
  project: RecentProject
  selectedAgent?: string
  activeTab: string
  onTabChange: (tab: string) => void
  onExecutingChange?: (count: number) => void
}
```

Update `ProjectView` destructuring:

```tsx
function ProjectView({ project, selectedAgent, activeTab, onTabChange, onExecutingChange }: ProjectViewProps) {
```

Pass to ChatInterface:

```tsx
<ChatInterface
  isOpen={true}
  selectedAgent={selectedAgent}
  project={project}
  onExecutingChange={onExecutingChange}
/>
```

**Step 4: Add state in App and wire it**

In `src/App.tsx`, near line 118 (after `currentProject` state), add:

```tsx
const [isProjectExecuting, setIsProjectExecuting] = useState(false)
const handleExecutingChange = React.useCallback((count: number) => {
  setIsProjectExecuting(count > 0)
}, [])
```

Update `ProjectView` render (around line 552):

```tsx
<ProjectView
  project={currentProject}
  selectedAgent={selectedAgent}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  onExecutingChange={handleExecutingChange}
/>
```

Pass to `AppSidebar` (around line 489):

```tsx
<AppSidebar
  isSettingsOpen={isSettingsOpen}
  setIsSettingsOpen={setIsSettingsOpen}
  onRefreshProjects={projectsRefreshRef}
  onProjectSelect={handleProjectSelect}
  currentProject={currentProject}
  onHomeClick={handleBackToWelcome}
  onAddProjectClick={() => setIsProjectChooserOpen(true)}
  isProjectExecuting={isProjectExecuting}
/>
```

**Step 5: Commit**

```bash
git add src/components/ChatInterface.tsx src/App.tsx
git commit -m "feat(sidebar): thread executing session count from ChatInterface to App"
```

---

### Task 4: Add Mini Donut Spinner to AppSidebar

**Files:**
- Modify: `src/components/app-sidebar.tsx:24-32` (props interface) and `src/components/app-sidebar.tsx:34` (destructure) and `src/components/app-sidebar.tsx:157-169` (project row content)

**Step 1: Add `isProjectExecuting` prop**

In `src/components/app-sidebar.tsx`, update the interface:

```tsx
interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  isSettingsOpen?: boolean
  setIsSettingsOpen?: (open: boolean) => void
  onRefreshProjects?: React.MutableRefObject<{ refresh: () => void } | null>
  onProjectSelect?: (project: RecentProject) => void
  currentProject?: RecentProject | null
  onHomeClick?: () => void
  onAddProjectClick?: () => void
  isProjectExecuting?: boolean
}
```

Update destructuring:

```tsx
export function AppSidebar({ isSettingsOpen, setIsSettingsOpen, onRefreshProjects, onProjectSelect, currentProject, onHomeClick, onAddProjectClick, isProjectExecuting, ...props }: AppSidebarProps) {
```

**Step 2: Add the donut spinner to the project row**

In the project row content area (around line 158-169), wrap the existing content in a flex container with the spinner. Replace:

```tsx
<div className="flex flex-col items-start">
  <span className="text-sm">{project.name}</span>
  {project.git_branch && (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <GitBranch className="size-3" />
      <span>{project.git_branch}</span>
      {project.git_status === 'dirty' && (
        <span className="text-orange-500">•</span>
      )}
    </div>
  )}
</div>
```

With:

```tsx
<div className="flex flex-col items-start flex-1 min-w-0">
  <span className="text-sm truncate w-full">{project.name}</span>
  {project.git_branch && (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <GitBranch className="size-3" />
      <span>{project.git_branch}</span>
      {project.git_status === 'dirty' && (
        <span className="text-orange-500">•</span>
      )}
    </div>
  )}
</div>
{currentProject?.path === project.path && isProjectExecuting && (
  <svg className="size-3.5 animate-spin shrink-0 ml-auto" viewBox="0 0 14 14" aria-label="Agent running">
    <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="2"
      stroke="hsl(var(--sidebar-primary))" strokeOpacity="0.25" />
    <circle cx="7" cy="7" r="5.5" fill="none" strokeWidth="2"
      stroke="hsl(var(--sidebar-primary))"
      strokeDasharray="20 14" strokeLinecap="round" />
  </svg>
)}
```

**Step 3: Visual verification**

Run: `bun tauri dev`
- Send a message to any agent
- The active project in the sidebar should show a spinning blue donut ring
- When the response completes, the spinner should disappear
- Non-active projects should never show a spinner

**Step 4: Commit**

```bash
git add src/components/app-sidebar.tsx
git commit -m "feat(sidebar): add mini donut spinner for running agent sessions"
```

---

### Task 5: Write Tests

**Files:**
- Create: `src/components/__tests__/app-sidebar.active.test.tsx`

**Step 1: Write test for active project styling**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

// Mock the hooks used by AppSidebar
vi.mock('@/hooks/use-recent-projects', () => ({
  useRecentProjects: () => ({
    projects: [
      { name: 'my-project', path: '/tmp/my-project', is_git_repo: true, git_branch: 'main', git_status: 'dirty' },
      { name: 'other', path: '/tmp/other', is_git_repo: false },
    ],
    loading: false,
    error: null,
    refreshProjects: vi.fn(),
  }),
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { name: 'Test', email: 'test@test.com', avatar_url: '' } }),
}))

function renderSidebar(props: Partial<React.ComponentProps<typeof AppSidebar>> = {}) {
  return render(
    <SidebarProvider>
      <AppSidebar
        currentProject={{ name: 'my-project', path: '/tmp/my-project', is_git_repo: true, git_branch: 'main', git_status: 'dirty' } as any}
        {...props}
      />
    </SidebarProvider>
  )
}

describe('AppSidebar active project', () => {
  it('applies sidebar-active styling to the current project', () => {
    renderSidebar()
    const link = screen.getByTitle(/\/tmp\/my-project/)
    expect(link.className).toContain('sidebar-active')
  })

  it('does not show spinner when not executing', () => {
    renderSidebar({ isProjectExecuting: false })
    expect(screen.queryByLabelText('Agent running')).toBeNull()
  })

  it('shows spinner when executing', () => {
    renderSidebar({ isProjectExecuting: true })
    expect(screen.getByLabelText('Agent running')).toBeTruthy()
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run src/components/__tests__/app-sidebar.active.test.tsx --exclude '.worktrees/**'`
Expected: 3 tests pass

**Step 3: Commit**

```bash
git add src/components/__tests__/app-sidebar.active.test.tsx
git commit -m "test(sidebar): add tests for active project styling and spinner"
```

---

### Task 6: Final Verification

**Step 1: Run full frontend test suite**

Run: `npx vitest run --exclude '.worktrees/**' 2>&1 | tail -10`
Expected: All tests pass, no regressions

**Step 2: Run cargo check**

Run: `cd src-tauri && cargo check`
Expected: Compiles (no Rust changes in this plan)

**Step 3: Visual QA checklist**

- [ ] Light mode: active project has soft blue tint background
- [ ] Light mode: active project text is dark and readable
- [ ] Light mode: 2px blue left border on active project
- [ ] Dark mode: active project has subtle blue-tinted dark background
- [ ] Dark mode: active project text is light and readable
- [ ] Non-active projects look normal in both modes
- [ ] Spinner appears when agent is streaming
- [ ] Spinner disappears when agent finishes
- [ ] Spinner only shows on the active (current) project row
- [ ] Git dirty dot still visible on both active and non-active projects
