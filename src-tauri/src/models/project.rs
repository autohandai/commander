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
    #[serde(default = "default_ui_theme")]
    /// UI theme preference: "auto" | "light" | "dark"
    pub ui_theme: String,
    #[serde(default = "default_chat_send_shortcut")]
    /// Chat send shortcut: "mod+enter" | "enter"
    pub chat_send_shortcut: String,
    #[serde(default = "default_show_welcome_recent_projects")]
    /// Whether to show recent projects on the Welcome screen
    pub show_welcome_recent_projects: bool,
    #[serde(default)]
    pub code_settings: CodeSettings,
}

fn default_show_console_output() -> bool {
    true
}

fn default_file_mentions_enabled() -> bool {
    true
}

fn default_ui_theme() -> String {
    "auto".to_string()
}
fn default_chat_send_shortcut() -> String {
    "mod+enter".to_string()
}
fn default_show_welcome_recent_projects() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeSettings {
    #[serde(default = "default_code_theme")]
    pub theme: String, // e.g., "github" | "dracula"
    #[serde(default = "default_font_size")]
    pub font_size: u16, // in px
}

fn default_code_theme() -> String {
    "github".to_string()
}
fn default_font_size() -> u16 {
    14
}

impl Default for CodeSettings {
    fn default() -> Self {
        Self {
            theme: default_code_theme(),
            font_size: default_font_size(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            show_console_output: default_show_console_output(),
            projects_folder: None,
            file_mentions_enabled: default_file_mentions_enabled(),
            ui_theme: default_ui_theme(),
            chat_send_shortcut: default_chat_send_shortcut(),
            show_welcome_recent_projects: default_show_welcome_recent_projects(),
            code_settings: CodeSettings::default(),
        }
    }
}
