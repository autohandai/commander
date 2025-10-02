use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use serde_json::{Value, json};

fn read_json_file(path: &Path) -> Option<Value> {
    fs::read_to_string(path).ok().and_then(|s| serde_json::from_str::<Value>(&s).ok())
}

fn home_dir() -> PathBuf { dirs::home_dir().unwrap_or_else(|| PathBuf::from("/")) }

pub fn load_claude_settings(project_path: Option<&str>) -> Value {
    let mut merged = json!({});
    let candidates: Vec<PathBuf> = vec![
        PathBuf::from("/Library/Application Support/ClaudeCode/managed-settings.json"),
        home_dir().join(".claude/settings.json"),
        project_path.map(|p| Path::new(p).join(".claude/settings.local.json")).unwrap_or_default(),
        project_path.map(|p| Path::new(p).join(".claude/settings.json")).unwrap_or_default(),
    ];
    for p in candidates {
        if p.as_os_str().is_empty() { continue; }
        if p.exists() {
            if let Some(v) = read_json_file(&p) {
                merged = merge(merged, v);
            }
        }
    }
    merged
}

pub fn load_gemini_settings(project_path: Option<&str>) -> Value {
    let mut merged = json!({});
    let system1 = if cfg!(target_os = "macos") {
        PathBuf::from("/Library/Application Support/GeminiCli/system-defaults.json")
    } else if cfg!(target_os = "windows") {
        PathBuf::from("C:/ProgramData/gemini-cli/system-defaults.json")
    } else { PathBuf::from("/etc/gemini-cli/system-defaults.json") };
    for p in [
        system1,
        home_dir().join(".gemini/settings.json"),
        project_path.map(|p| Path::new(p).join(".gemini/settings.json")).unwrap_or_default(),
    ] {
        if p.as_os_str().is_empty() { continue; }
        if p.exists() {
            if let Some(v) = read_json_file(&p) { merged = merge(merged, v); }
        }
    }
    merged
}

fn merge(mut a: Value, b: Value) -> Value {
    match (a, b) {
        (Value::Object(mut ao), Value::Object(bo)) => {
            for (k, v) in bo { ao.insert(k, merge(ao.remove(&k).unwrap_or(Value::Null), v)); }
            Value::Object(ao)
        }
        (_, rhs) => rhs,
    }
}

