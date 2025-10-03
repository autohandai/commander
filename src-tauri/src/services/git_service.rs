use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Check if a directory is a valid Git repository by looking for .git folder
pub fn is_valid_git_repository(project_path: &str) -> bool {
    let git_path = Path::new(project_path).join(".git");
    git_path.exists()
}

/// Get the current Git branch for a repository
pub fn get_git_branch(project_path: &str) -> Option<String> {
    if !is_valid_git_repository(project_path) {
        return None;
    }

    let output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(project_path)
        .output()
        .ok()?;

    if output.status.success() {
        let branch = String::from_utf8(output.stdout).ok()?;
        Some(branch.trim().to_string())
    } else {
        None
    }
}

/// Get the Git status for a repository (short format)
pub fn get_git_status(project_path: &str) -> Option<String> {
    if !is_valid_git_repository(project_path) {
        return None;
    }

    let output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(project_path)
        .output()
        .ok()?;

    if output.status.success() {
        let status = String::from_utf8(output.stdout).ok()?;
        Some(status.trim().to_string())
    } else {
        None
    }
}

/// Find the root of a git repository, handling worktrees, submodules, and regular repos
/// Returns the path to the main repository root
pub fn find_git_root(current_path: &str) -> Option<String> {
    let path = Path::new(current_path);

    // Walk up the directory tree without resolving symlinks to preserve
    // the original path prefix (e.g., avoid "/private" on macOS temp dirs).
    for ancestor in path.ancestors() {
        let dotgit = ancestor.join(".git");
        if dotgit.is_dir() {
            return Some(ancestor.to_string_lossy().into_owned());
        }

        if dotgit.is_file() {
            // Worktree: .git is a file with a `gitdir:` pointer.
            if let Ok(content) = fs::read_to_string(&dotgit) {
                if let Some(gitdir_line) = content.lines().find(|line| line.starts_with("gitdir:"))
                {
                    let gitdir = gitdir_line.trim_start_matches("gitdir:").trim();
                    let gitdir_path: PathBuf = {
                        let p = Path::new(gitdir);
                        if p.is_absolute() {
                            p.to_path_buf()
                        } else {
                            ancestor.join(p)
                        }
                    };

                    // Find the main repo's .git directory by walking up from gitdir
                    if let Some(main_git_dir) = gitdir_path
                        .ancestors()
                        .find(|p| p.file_name().map(|n| n == ".git").unwrap_or(false))
                    {
                        if let Some(repo_root) = main_git_dir.parent() {
                            return Some(repo_root.to_string_lossy().into_owned());
                        }
                    }
                }
            }
        }
    }

    None
}

/// Enhanced git repository detection that handles worktrees and submodules
/// Returns the main repository root path if found, current path if it's a valid repo
pub fn resolve_git_project_path(current_path: &str) -> Option<String> {
    let path = Path::new(current_path);

    // First check if current path has git
    if !path.join(".git").exists() {
        // Not a git repo, return None
        return None;
    }

    // Check if .git is a file (worktree) or directory (regular repo)
    let git_path = path.join(".git");

    if git_path.is_file() {
        // This is likely a worktree - read the .git file to find main repo
        if let Ok(content) = fs::read_to_string(&git_path) {
            if let Some(gitdir_line) = content.lines().find(|line| line.starts_with("gitdir:")) {
                let gitdir = gitdir_line.trim_start_matches("gitdir:").trim();
                // Navigate up from the gitdir to find the main repo
                let worktree_git_path = Path::new(gitdir);
                if let Some(main_repo) = worktree_git_path.parent() {
                    if main_repo.join(".git").is_dir() {
                        return Some(main_repo.to_string_lossy().to_string());
                    }
                }
            }
        }
        // Fallback to git command
        return find_git_root(current_path);
    } else if git_path.is_dir() {
        // Regular git repository
        return Some(current_path.to_string());
    }

    None
}
