use std::path::Path;

use crate::error::CommanderError;
use crate::models::autohand::HookDefinition;

/// Load all hook definitions from the workspace `.autohand/config.json`.
///
/// Returns an empty `Vec` when:
/// - The config directory does not exist.
/// - The config file is missing.
/// - The file has no `hooks.definitions` key.
pub fn load_hooks_from_config(workspace: &Path) -> Result<Vec<HookDefinition>, CommanderError> {
    let config_path = workspace.join(".autohand").join("config.json");
    load_hooks_from_config_file(&config_path)
}

/// Load all hook definitions from a specific config file path.
pub fn load_hooks_from_config_file(config_path: &Path) -> Result<Vec<HookDefinition>, CommanderError> {

    if !config_path.exists() {
        return Ok(Vec::new());
    }

    let raw = std::fs::read_to_string(&config_path).map_err(|e| {
        CommanderError::file_system(
            "read",
            config_path.display().to_string(),
            e.to_string(),
        )
    })?;

    let root: serde_json::Value = serde_json::from_str(&raw).map_err(|e| {
        CommanderError::serialization("config.json", e.to_string())
    })?;

    let definitions = root
        .get("hooks")
        .and_then(|h| h.get("definitions"))
        .cloned()
        .unwrap_or_else(|| serde_json::json!([]));

    let hooks: Vec<HookDefinition> =
        serde_json::from_value(definitions).map_err(|e| {
            CommanderError::serialization("HookDefinition", e.to_string())
        })?;

    Ok(hooks)
}

/// Save (upsert) a hook definition into the workspace config.
///
/// If a hook with the same `id` already exists it is replaced; otherwise the
/// new hook is appended to the definitions list.
///
/// Other fields in `config.json` are preserved.
pub fn save_hook_to_config(
    workspace: &Path,
    hook: &HookDefinition,
) -> Result<(), CommanderError> {
    let mut hooks = load_hooks_from_config(workspace)?;

    // Upsert: replace if existing, append if new
    if let Some(pos) = hooks.iter().position(|h| h.id == hook.id) {
        hooks[pos] = hook.clone();
    } else {
        hooks.push(hook.clone());
    }

    write_hooks_to_config(workspace, &hooks)
}

/// Delete a hook definition by its ID.
///
/// Returns `Ok(())` even when the ID is not found (idempotent delete).
pub fn delete_hook_from_config(
    workspace: &Path,
    hook_id: &str,
) -> Result<(), CommanderError> {
    let mut hooks = load_hooks_from_config(workspace)?;
    hooks.retain(|h| h.id != hook_id);
    write_hooks_to_config(workspace, &hooks)
}

/// Toggle the `enabled` flag for a hook identified by its ID.
///
/// Returns an error when no hook with the given ID exists.
pub fn toggle_hook_in_config(
    workspace: &Path,
    hook_id: &str,
    enabled: bool,
) -> Result<(), CommanderError> {
    let mut hooks = load_hooks_from_config(workspace)?;

    let hook = hooks.iter_mut().find(|h| h.id == hook_id).ok_or_else(|| {
        CommanderError::validation(
            "hook_id",
            hook_id.to_string(),
            format!("No hook found with id '{}'", hook_id),
        )
    })?;

    hook.enabled = enabled;
    write_hooks_to_config(workspace, &hooks)
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/// Write the full hooks list back to `config.json`, preserving any other
/// top-level keys that already exist in the file.
fn write_hooks_to_config(
    workspace: &Path,
    hooks: &[HookDefinition],
) -> Result<(), CommanderError> {
    let config_dir = workspace.join(".autohand");
    let config_path = config_dir.join("config.json");

    // Ensure the directory exists
    std::fs::create_dir_all(&config_dir).map_err(|e| {
        CommanderError::file_system(
            "create_dir",
            config_dir.display().to_string(),
            e.to_string(),
        )
    })?;

    // Read existing config (or start fresh)
    let mut root: serde_json::Value = if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path).map_err(|e| {
            CommanderError::file_system(
                "read",
                config_path.display().to_string(),
                e.to_string(),
            )
        })?;
        serde_json::from_str(&raw).map_err(|e| {
            CommanderError::serialization("config.json", e.to_string())
        })?
    } else {
        serde_json::json!({})
    };

    // Serialize hook definitions
    let hooks_value = serde_json::to_value(hooks).map_err(|e| {
        CommanderError::serialization("HookDefinition", e.to_string())
    })?;

    // Ensure the `hooks` object exists, then set `definitions`
    let hooks_obj = root
        .as_object_mut()
        .ok_or_else(|| {
            CommanderError::serialization(
                "config.json",
                "config root is not a JSON object".to_string(),
            )
        })?
        .entry("hooks")
        .or_insert_with(|| serde_json::json!({}));

    hooks_obj
        .as_object_mut()
        .ok_or_else(|| {
            CommanderError::serialization(
                "config.json",
                "hooks field is not a JSON object".to_string(),
            )
        })?
        .insert("definitions".to_string(), hooks_value);

    // Write back
    let pretty = serde_json::to_string_pretty(&root).map_err(|e| {
        CommanderError::serialization("config.json", e.to_string())
    })?;

    std::fs::write(&config_path, pretty).map_err(|e| {
        CommanderError::file_system(
            "write",
            config_path.display().to_string(),
            e.to_string(),
        )
    })?;

    Ok(())
}
