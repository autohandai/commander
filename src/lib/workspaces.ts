export interface GitWorktreeInfo { [key: string]: string }

export interface WorkspaceEntry {
  name: string
  path: string
}

// Extract only worktrees under `<projectPath>/.commander/<name>` and map to {name, path}
export function parseWorkspaceWorktrees(
  worktrees: GitWorktreeInfo[],
  projectPath: string
): WorkspaceEntry[] {
  const prefix = projectPath.replace(/\/+$/, '') + '/.commander/'
  return worktrees
    .map((wt) => wt.path)
    .filter((p): p is string => typeof p === 'string')
    .filter((p) => p.startsWith(prefix))
    .map((p) => ({ name: p.slice(prefix.length).replace(/\/+$/, ''), path: p }))
    .filter((e) => !!e.name)
}

