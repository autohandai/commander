use crate::models::auth::StoredAuth;
use std::fs;
use std::path::Path;

const AUTH_FILE_NAME: &str = "commander.json";

pub fn save_auth_to_file(sessions_dir: &Path, auth: &StoredAuth) -> Result<(), String> {
    fs::create_dir_all(sessions_dir)
        .map_err(|e| format!("Failed to create sessions dir: {}", e))?;

    let file_path = sessions_dir.join(AUTH_FILE_NAME);
    let json = serde_json::to_string_pretty(auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write auth file: {}", e))?;

    Ok(())
}

pub fn load_auth_from_file(sessions_dir: &Path) -> Result<Option<StoredAuth>, String> {
    let file_path = sessions_dir.join(AUTH_FILE_NAME);

    if !file_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&file_path).map_err(|e| format!("Failed to read auth file: {}", e))?;

    let auth: StoredAuth = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse auth file: {}", e))?;

    Ok(Some(auth))
}

pub fn clear_auth_file(sessions_dir: &Path) -> Result<(), String> {
    let file_path = sessions_dir.join(AUTH_FILE_NAME);

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to remove auth file: {}", e))?;
    }

    Ok(())
}

pub fn get_default_sessions_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".autohand").join("sessions"))
}
