use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub name: String,
    pub path: String,
    pub last_accessed: i64,
    pub is_git_repo: bool,
    pub git_branch: Option<String>,
    pub git_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]  
pub struct ProjectsData {
    pub projects: Vec<RecentProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    #[serde(default = "default_show_console_output")]
    pub show_console_output: bool,
    #[serde(default)]
    pub projects_folder: Option<String>,
    #[serde(default = "default_file_mentions_enabled")]
    pub file_mentions_enabled: bool,
    #[serde(default)]
    pub code_settings: CodeSettings,
}

fn default_show_console_output() -> bool {
    true
}

fn default_file_mentions_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeSettings {
    #[serde(default = "default_code_theme")]
    pub theme: String, // e.g., "github" | "dracula"
    #[serde(default = "default_font_size")]
    pub font_size: u16, // in px
}

fn default_code_theme() -> String { "github".to_string() }
fn default_font_size() -> u16 { 14 }

impl Default for CodeSettings {
    fn default() -> Self {
        Self { theme: default_code_theme(), font_size: default_font_size() }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            show_console_output: default_show_console_output(),
            projects_folder: None,
            file_mentions_enabled: default_file_mentions_enabled(),
            code_settings: CodeSettings::default(),
        }
    }
}
