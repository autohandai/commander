// Test module declarations
pub mod chat_history;
pub mod commands;
pub mod error_handling;
pub mod integration;
pub mod services;

// Common test utilities and helpers
use std::path::PathBuf;
use tempfile::TempDir;

/// Create a temporary test project with git repository
pub fn create_test_git_project(name: &str) -> (TempDir, PathBuf) {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let project_path = temp_dir.path().join(name);

    std::fs::create_dir_all(&project_path).expect("Failed to create project directory");

    // Initialize git repository
    std::process::Command::new("git")
        .args(&["init"])
        .current_dir(&project_path)
        .output()
        .expect("Failed to initialize git repository");

    (temp_dir, project_path)
}

/// Create a temporary test project WITHOUT git repository
pub fn create_test_regular_project(name: &str) -> (TempDir, PathBuf) {
    let temp_dir = TempDir::new().expect("Failed to create temp directory");
    let project_path = temp_dir.path().join(name);

    std::fs::create_dir_all(&project_path).expect("Failed to create project directory");

    (temp_dir, project_path)
}
