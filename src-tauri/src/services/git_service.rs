use std::path::Path;
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

