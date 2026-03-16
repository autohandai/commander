use std::collections::HashMap;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
use tokio::process::Command;
use which::which;

use crate::models::ai_agent::{AIAgent, AgentStatus, CustomAgentDefinition};
use crate::models::protocol::ProtocolMode;

const AGENT_DEFINITIONS: &[AgentDefinition] = &[
    AgentDefinition {
        id: "autohand",
        command: "autohand",
        display_name: "Autohand Code",
        package: Some("autohand-cli"),
        removable: false,
    },
    AgentDefinition {
        id: "claude",
        command: "claude",
        display_name: "Claude Code CLI",
        package: Some("@anthropic-ai/claude-code"),
        removable: true,
    },
    AgentDefinition {
        id: "codex",
        command: "codex",
        display_name: "Codex",
        package: Some("@openai/codex"),
        removable: true,
    },
    AgentDefinition {
        id: "gemini",
        command: "gemini",
        display_name: "Gemini",
        package: Some("@google/gemini-cli"),
        removable: true,
    },
];

#[derive(Debug, Clone)]
struct AgentDefinition {
    id: &'static str,
    command: &'static str,
    display_name: &'static str,
    package: Option<&'static str>,
    removable: bool,
}

/// A dynamic agent definition built from a `CustomAgentDefinition`.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DynamicAgentDefinition {
    pub id: String,
    pub command: String,
    pub display_name: String,
}

pub struct AgentStatusService<P: AgentProbe = SystemAgentProbe> {
    probe: P,
    protocol_cache: ProtocolCache,
}

impl AgentStatusService<SystemAgentProbe> {
    pub fn new() -> Self {
        Self {
            probe: SystemAgentProbe,
            protocol_cache: ProtocolCache::new(),
        }
    }

    /// Create a service that reuses an existing protocol cache.
    /// This avoids re-probing agents on every status check cycle.
    pub fn with_cache(cache: ProtocolCache) -> Self {
        Self {
            probe: SystemAgentProbe,
            protocol_cache: cache,
        }
    }

    /// Consume the service and return the protocol cache for persistence.
    pub fn into_cache(self) -> ProtocolCache {
        self.protocol_cache
    }
}

impl<P: AgentProbe> AgentStatusService<P> {
    #[cfg(test)]
    pub fn with_probe(probe: P) -> Self {
        Self {
            probe,
            protocol_cache: ProtocolCache::new(),
        }
    }

    #[cfg(test)]
    pub async fn check_agents(
        &mut self,
        enabled: &HashMap<String, bool>,
    ) -> Result<AgentStatus, String> {
        self.check_agents_with_custom(enabled, &[]).await
    }

    pub async fn check_agents_with_custom(
        &mut self,
        enabled: &HashMap<String, bool>,
        custom_agents: &[CustomAgentDefinition],
    ) -> Result<AgentStatus, String> {
        let mut agents = Vec::new();

        for definition in AGENT_DEFINITIONS {
            let enabled_flag = *enabled.get(definition.id).unwrap_or(&true);

            if !enabled_flag {
                agents.push(AIAgent {
                    name: definition.id.to_string(),
                    command: definition.command.to_string(),
                    display_name: definition.display_name.to_string(),
                    available: false,
                    enabled: false,
                    error_message: None,
                    installed_version: None,
                    latest_version: None,
                    upgrade_available: false,
                    protocol: None,
                    is_default: definition.id == "autohand",
                    removable: definition.removable,
                });
                continue;
            }

            let mut available = false;
            let mut error_message = None;
            let mut latest_version = None;
            let mut upgrade_available = false;
            let mut command_version = None;
            let mut command_semver = None;
            let mut package_version = None;
            let mut package_semver = None;
            let mut latest_semver = None;

            match self.probe.locate(definition.command).await {
                Ok(true) => {
                    match self.probe.command_version(definition.command).await {
                        Ok(version) => {
                            available = true;
                            command_semver =
                                version.as_ref().and_then(|value| extract_semver(value));
                            command_version = version;
                        }
                        Err(err) => {
                            error_message = Some(err);
                        }
                    }

                    if let Some(package) = definition.package {
                        match self.probe.installed_package_version(package).await {
                            Ok(installed) => {
                                if let Some(ref v) = installed {
                                    package_semver = extract_semver(v);
                                }
                                package_version = installed;
                            }
                            Err(err) => {
                                if error_message.is_none() {
                                    error_message = Some(err);
                                }
                            }
                        }

                        match self.probe.latest_package_version(package).await {
                            Ok(latest) => {
                                latest_semver =
                                    latest.as_ref().and_then(|value| extract_semver(value));
                                latest_version = latest;
                            }
                            Err(err) => {
                                if error_message.is_none() {
                                    error_message = Some(err);
                                }
                            }
                        }
                    }

                    if !available {
                        upgrade_available = true;
                    }
                }
                Ok(false) => {
                    error_message =
                        Some(format!("{} command not found in PATH", definition.command));
                    upgrade_available = true;
                }
                Err(err) => {
                    error_message = Some(err);
                    upgrade_available = true;
                }
            }

            // Sidecar fallback: for codex, check if codex-acp is bundled
            if !available && definition.id == "codex" {
                if crate::services::sidecar::resolve_sidecar(
                    "codex-acp",
                    crate::services::sidecar::exe_dir().as_deref(),
                )
                .is_ok()
                {
                    available = true;
                    upgrade_available = false;
                    command_version = Some("codex-acp (bundled)".to_string());
                    error_message = None;
                    // codex-acp is inherently ACP — skip protocol probing and set cache directly.
                    self.protocol_cache.set(
                        definition.id,
                        ProtocolCacheEntry {
                            protocol: Some(crate::models::protocol::ProtocolMode::Acp),
                            agent_version: "codex-acp (bundled)".to_string(),
                            flag_variant: None,
                        },
                    );
                }
            }

            let installed_semver = package_semver.clone().or(command_semver.clone());

            let installed_version = match (package_version.clone(), command_version.clone()) {
                (Some(package), Some(command)) => {
                    if normalize_version_text(&package) == normalize_version_text(&command)
                        || command.contains(package.trim())
                    {
                        Some(command.trim().to_string())
                    } else {
                        Some(format!(
                            "{} (CLI reports {})",
                            package.trim(),
                            command.trim()
                        ))
                    }
                }
                (Some(package), None) => Some(package.trim().to_string()),
                (None, Some(command)) => Some(command.trim().to_string()),
                (None, None) => None,
            };

            if !upgrade_available {
                if let (Some(installed), Some(latest)) =
                    (installed_semver.clone(), latest_semver.clone())
                {
                    if installed < latest {
                        upgrade_available = true;
                    }
                } else if let (Some(installed), Some(latest)) =
                    (&installed_version, &latest_version)
                {
                    if !installed.trim().is_empty() && !latest.trim().is_empty() {
                        upgrade_available =
                            normalize_version_text(installed) != normalize_version_text(latest);
                    }
                }
            }

            // Protocol probing: detect protocol if version changed or not yet cached
            let version_str = command_version.clone().unwrap_or_default();
            if available && self.protocol_cache.needs_reprobe(definition.id, &version_str) {
                if let Ok(detected) = self.probe.detect_protocol(definition.command).await {
                    let entry = ProtocolCacheEntry {
                        protocol: detected.as_ref().map(|(mode, _)| *mode),
                        agent_version: version_str.clone(),
                        flag_variant: detected.map(|(_, flag)| flag),
                    };
                    self.protocol_cache.set(definition.id, entry);
                }
            }

            agents.push(AIAgent {
                name: definition.id.to_string(),
                command: definition.command.to_string(),
                display_name: definition.display_name.to_string(),
                available,
                enabled: true,
                error_message,
                installed_version,
                latest_version,
                upgrade_available,
                protocol: self.protocol_cache.get(definition.id).and_then(|e| e.protocol),
                is_default: definition.id == "autohand",
                removable: definition.removable,
            });
        }

        // Process custom (user-defined) agents
        for custom in custom_agents {
            let enabled_flag = custom.settings.enabled;

            if !enabled_flag {
                agents.push(AIAgent {
                    name: custom.id.clone(),
                    command: custom.command.clone(),
                    display_name: custom.name.clone(),
                    available: false,
                    enabled: false,
                    error_message: None,
                    installed_version: None,
                    latest_version: None,
                    upgrade_available: false,
                    protocol: None,
                    is_default: false,
                    removable: true,
                });
                continue;
            }

            // Extract the binary name (first token of the command string)
            let binary = custom
                .command
                .split_whitespace()
                .next()
                .unwrap_or(&custom.command);

            let (available, error_message) = match self.probe.locate(binary).await {
                Ok(true) => {
                    // Try to get version but don't fail if it errors
                    match self.probe.command_version(binary).await {
                        Ok(_version) => (true, None),
                        Err(_) => (true, None), // still available even without version
                    }
                }
                Ok(false) => (
                    false,
                    Some(format!("{} command not found in PATH", binary)),
                ),
                Err(err) => (false, Some(err)),
            };

            agents.push(AIAgent {
                name: custom.id.clone(),
                command: custom.command.clone(),
                display_name: custom.name.clone(),
                available,
                enabled: true,
                error_message,
                installed_version: None,
                latest_version: None,
                upgrade_available: false,
                protocol: None,
                is_default: false,
                removable: true,
            });
        }

        Ok(AgentStatus { agents })
    }
}

fn extract_semver(text: &str) -> Option<semver::Version> {
    static SEMVER_RE: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"(\d+\.\d+\.\d+)").expect("valid semver regex"));

    SEMVER_RE
        .captures(text)
        .and_then(|caps| caps.get(1))
        .and_then(|m| semver::Version::parse(m.as_str()).ok())
}

fn normalize_version_text(text: &str) -> String {
    text.trim().to_lowercase()
}

#[async_trait]
pub trait AgentProbe: Send + Sync {
    async fn locate(&self, command: &str) -> Result<bool, String>;
    async fn command_version(&self, command: &str) -> Result<Option<String>, String>;
    async fn latest_package_version(&self, package: &str) -> Result<Option<String>, String>;
    async fn installed_package_version(&self, package: &str) -> Result<Option<String>, String>;
    async fn detect_protocol(&self, command: &str) -> Result<Option<(ProtocolMode, String)>, String>;
}

pub struct SystemAgentProbe;

#[async_trait]
impl AgentProbe for SystemAgentProbe {
    async fn locate(&self, command: &str) -> Result<bool, String> {
        Ok(which(command).is_ok())
    }

    async fn command_version(&self, command: &str) -> Result<Option<String>, String> {
        let output = Command::new(command)
            .arg("--version")
            .output()
            .await
            .map_err(|e| format!("Failed to execute {command} --version: {e}"))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let first_line = stdout.lines().next().unwrap_or("").trim();
            if first_line.is_empty() {
                Ok(None)
            } else {
                Ok(Some(first_line.to_string()))
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stderr = stderr.trim();
            if stderr.is_empty() {
                Err(format!(
                    "{command} --version exited with status {}",
                    output.status
                ))
            } else {
                Err(stderr.to_string())
            }
        }
    }

    async fn latest_package_version(&self, package: &str) -> Result<Option<String>, String> {
        if which("npm").is_err() {
            return Ok(None);
        }

        let output = Command::new("npm")
            .args(["view", package, "version", "--json"])
            .output()
            .await
            .map_err(|e| format!("Failed to execute npm view {package} version: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stderr = stderr.trim();
            if stderr.contains("E404") {
                return Ok(None);
            }
            return Err(if stderr.is_empty() {
                format!(
                    "npm view {package} version exited with status {}",
                    output.status
                )
            } else {
                stderr.to_string()
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stdout = stdout.trim();
        if stdout.is_empty() {
            return Ok(None);
        }

        let parsed: Result<Value, _> = serde_json::from_str(stdout);
        match parsed {
            Ok(Value::String(v)) => Ok(Some(v)),
            Ok(Value::Array(arr)) => {
                let last = arr
                    .iter()
                    .rev()
                    .find_map(|v| v.as_str().map(|s| s.to_string()));
                Ok(last)
            }
            _ => Ok(Some(stdout.trim_matches('"').to_string())),
        }
    }

    async fn installed_package_version(&self, package: &str) -> Result<Option<String>, String> {
        if which("npm").is_err() {
            return Ok(None);
        }

        let output = Command::new("npm")
            .args(["list", "-g", package, "--json"])
            .output()
            .await
            .map_err(|e| format!("Failed to execute npm list {package}: {e}"))?;

        let status_code = output.status.code().unwrap_or_default();
        if !output.status.success() && status_code != 0 && status_code != 1 {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stderr = stderr.trim();
            return Err(if stderr.is_empty() {
                format!("npm list {package} exited with status {}", output.status)
            } else {
                stderr.to_string()
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.trim().is_empty() {
            return Ok(None);
        }

        let parsed: Value = serde_json::from_str(stdout.trim())
            .map_err(|e| format!("Failed to parse npm list output for {package}: {e}"))?;

        let version = parsed
            .get("dependencies")
            .and_then(|deps| deps.get(package))
            .and_then(|pkg| pkg.get("version"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        Ok(version)
    }

    async fn detect_protocol(&self, command: &str) -> Result<Option<(ProtocolMode, String)>, String> {
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            tokio::process::Command::new(command)
                .arg("--help")
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .output(),
        )
        .await
        .map_err(|_| "Help probe timed out".to_string())?
        .map_err(|e| format!("Failed to run --help: {e}"))?;

        let combined = format!(
            "{}\n{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr),
        );

        // Check for ACP flags first (prefer ACP over RPC if both present)
        if combined.contains("--mode acp") {
            return Ok(Some((ProtocolMode::Acp, "--mode acp".to_string())));
        }
        if combined.contains("--acp") {
            return Ok(Some((ProtocolMode::Acp, "--acp".to_string())));
        }
        if combined.contains("--mode rpc") {
            return Ok(Some((ProtocolMode::Rpc, "--mode rpc".to_string())));
        }
        if combined.contains("--rpc") {
            return Ok(Some((ProtocolMode::Rpc, "--rpc".to_string())));
        }

        Ok(None)
    }
}

#[derive(Debug, Clone)]
pub struct ProtocolCacheEntry {
    pub protocol: Option<ProtocolMode>,
    pub agent_version: String,
    pub flag_variant: Option<String>,
}

#[derive(Debug, Default)]
pub struct ProtocolCache {
    entries: HashMap<String, ProtocolCacheEntry>,
}

impl ProtocolCache {
    pub fn new() -> Self {
        Self { entries: HashMap::new() }
    }

    pub fn get(&self, agent: &str) -> Option<&ProtocolCacheEntry> {
        self.entries.get(agent)
    }

    pub fn set(&mut self, agent: &str, entry: ProtocolCacheEntry) {
        self.entries.insert(agent.to_string(), entry);
    }

    pub fn needs_reprobe(&self, agent: &str, current_version: &str) -> bool {
        match self.entries.get(agent) {
            Some(entry) => entry.agent_version != current_version,
            None => true,
        }
    }
}
