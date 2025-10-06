use std::fs;
use std::path::Path;

pub fn read_file_content(path: &str) -> Result<String, String> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(format!("Failed to read file: {} (not found)", path));
    }
    if p.is_dir() {
        return Err(format!("Failed to read file: {} (is a directory)", path));
    }
    fs::read_to_string(p).map_err(|e| format!("Failed to read file {}: {}", path, e))
}
