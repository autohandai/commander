#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};

    use async_trait::async_trait;

    use crate::models::ai_agent::AIAgent;
    use crate::services::agent_status_service::{AgentProbe, AgentStatusService};

    fn all_enabled() -> HashMap<String, bool> {
        HashMap::from([
            ("claude".to_string(), true),
            ("codex".to_string(), true),
            ("gemini".to_string(), true),
        ])
    }

    #[derive(Clone, Debug)]
    struct FakeCommandInfo {
        present: bool,
        version: Result<Option<String>, String>,
    }

    #[derive(Clone, Debug)]
    struct FakeProbe {
        commands: HashMap<String, FakeCommandInfo>,
        latest_packages: HashMap<String, Result<Option<String>, String>>,
        installed_packages: HashMap<String, Result<Option<String>, String>>,
        version_calls: Arc<Mutex<HashMap<String, usize>>>,
    }

    impl FakeProbe {
        fn new() -> Self {
            Self {
                commands: HashMap::new(),
                latest_packages: HashMap::new(),
                installed_packages: HashMap::new(),
                version_calls: Arc::new(Mutex::new(HashMap::new())),
            }
        }

        fn with_command(
            mut self,
            command: &str,
            present: bool,
            version: Result<Option<String>, String>,
        ) -> Self {
            self.commands
                .insert(command.to_string(), FakeCommandInfo { present, version });
            self
        }

        fn with_package(mut self, package: &str, latest: Result<Option<String>, String>) -> Self {
            self.latest_packages.insert(package.to_string(), latest);
            self
        }

        fn with_installed_package(
            mut self,
            package: &str,
            version: Result<Option<String>, String>,
        ) -> Self {
            self.installed_packages.insert(package.to_string(), version);
            self
        }

        fn record_version_call(&self, command: &str) {
            let mut calls = self.version_calls.lock().unwrap();
            *calls.entry(command.to_string()).or_insert(0) += 1;
        }

        fn version_call_count(&self, command: &str) -> usize {
            *self
                .version_calls
                .lock()
                .unwrap()
                .get(command)
                .unwrap_or(&0)
        }
    }

    #[async_trait]
    impl AgentProbe for FakeProbe {
        async fn locate(&self, command: &str) -> Result<bool, String> {
            let info = self
                .commands
                .get(command)
                .unwrap_or_else(|| panic!("unexpected locate call for {command}"));
            Ok(info.present)
        }

        async fn command_version(&self, command: &str) -> Result<Option<String>, String> {
            self.record_version_call(command);
            let info = self
                .commands
                .get(command)
                .unwrap_or_else(|| panic!("unexpected version call for {command}"));
            info.version.clone()
        }

        async fn latest_package_version(&self, package: &str) -> Result<Option<String>, String> {
            self.latest_packages
                .get(package)
                .unwrap_or_else(|| panic!("unexpected package call for {package}"))
                .clone()
        }

        async fn installed_package_version(&self, package: &str) -> Result<Option<String>, String> {
            self.installed_packages
                .get(package)
                .unwrap_or_else(|| panic!("unexpected package call for {package}"))
                .clone()
        }
    }

    fn find_agent<'a>(agents: &'a [AIAgent], name: &str) -> &'a AIAgent {
        agents
            .iter()
            .find(|a| a.name == name)
            .expect("agent missing")
    }

    #[tokio::test]
    async fn agents_report_versions_without_false_upgrade_flag() {
        let probe = FakeProbe::new()
            .with_command("claude", true, Ok(Some("2.0.5 (Claude Code)".to_string())))
            .with_command("codex", true, Ok(Some("codex-cli 0.41.0".to_string())))
            .with_command("gemini", true, Ok(Some("0.6.1".to_string())))
            .with_package("@anthropic-ai/claude-code", Ok(Some("2.0.5".to_string())))
            .with_installed_package("@anthropic-ai/claude-code", Ok(Some("2.0.5".to_string())))
            .with_package("@openai/codex", Ok(Some("0.42.0".to_string())))
            .with_installed_package("@openai/codex", Ok(Some("0.42.0".to_string())))
            .with_package("@google/gemini-cli", Ok(None));
        let probe =
            probe.with_installed_package("@google/gemini-cli", Ok(Some("0.6.1".to_string())));

        let service = AgentStatusService::with_probe(probe.clone());
        let status = service
            .check_agents(&all_enabled())
            .await
            .expect("status ok");

        let claude = find_agent(&status.agents, "claude");
        assert!(claude.available, "claude should be marked available");
        assert_eq!(
            claude.installed_version.as_deref(),
            Some("2.0.5 (Claude Code)")
        );
        assert_eq!(claude.latest_version.as_deref(), Some("2.0.5"));
        assert!(
            !claude.upgrade_available,
            "claude should not report upgrade when semver matches"
        );

        let codex = find_agent(&status.agents, "codex");
        assert!(codex.available, "codex should be available");
        assert_eq!(
            codex.installed_version.as_deref(),
            Some("0.42.0 (CLI reports codex-cli 0.41.0)")
        );
        assert_eq!(codex.latest_version.as_deref(), Some("0.42.0"));
        assert!(!codex.upgrade_available, "codex should be up to date");

        let gemini = find_agent(&status.agents, "gemini");
        assert!(
            gemini.available,
            "gemini should still be considered available"
        );
        assert_eq!(gemini.installed_version.as_deref(), Some("0.6.1"));
        assert!(
            gemini.latest_version.is_none(),
            "gemini latest should be unknown without npm data"
        );
        assert!(
            !gemini.upgrade_available,
            "gemini should not require upgrade without comparison"
        );
    }

    #[tokio::test]
    async fn newer_latest_version_triggers_upgrade_flag() {
        let probe = FakeProbe::new()
            .with_command("claude", true, Ok(Some("1.0.0".to_string())))
            .with_command("codex", true, Ok(Some("codex-cli 0.40.0".to_string())))
            .with_command("gemini", true, Ok(Some("0.6.0".to_string())))
            .with_package("@anthropic-ai/claude-code", Ok(Some("1.1.0".to_string())))
            .with_installed_package("@anthropic-ai/claude-code", Ok(Some("1.0.0".to_string())))
            .with_package("@openai/codex", Ok(Some("0.41.0".to_string())))
            .with_installed_package("@openai/codex", Ok(Some("0.40.0".to_string())))
            .with_package("@google/gemini-cli", Ok(Some("0.7.0".to_string())));
        let probe =
            probe.with_installed_package("@google/gemini-cli", Ok(Some("0.6.0".to_string())));

        let service = AgentStatusService::with_probe(probe);
        let status = service
            .check_agents(&all_enabled())
            .await
            .expect("status ok");

        let claude = find_agent(&status.agents, "claude");
        assert!(
            claude.upgrade_available,
            "claude should request upgrade when npm newer"
        );

        let codex = find_agent(&status.agents, "codex");
        assert!(
            codex.upgrade_available,
            "codex should request upgrade when npm newer"
        );

        let gemini = find_agent(&status.agents, "gemini");
        assert!(
            gemini.upgrade_available,
            "gemini should request upgrade when npm newer"
        );
    }

    #[tokio::test]
    async fn missing_agent_surfaces_error_message() {
        let probe = FakeProbe::new()
            .with_command("claude", true, Ok(Some("1.0.0".to_string())))
            .with_command("codex", false, Err("command failed".to_string()))
            .with_command("gemini", true, Ok(Some("0.8.0".to_string())))
            .with_package("@anthropic-ai/claude-code", Ok(None))
            .with_installed_package("@anthropic-ai/claude-code", Ok(None))
            .with_package("@openai/codex", Ok(Some("1.5.0".to_string())))
            .with_installed_package("@openai/codex", Ok(Some("1.5.0".to_string())))
            .with_package("@google/gemini-cli", Ok(None));
        let probe =
            probe.with_installed_package("@google/gemini-cli", Ok(Some("0.8.0".to_string())));

        let service = AgentStatusService::with_probe(probe);
        let status = service
            .check_agents(&all_enabled())
            .await
            .expect("status ok");

        let codex = find_agent(&status.agents, "codex");
        assert!(
            !codex.available,
            "codex should be unavailable when command missing"
        );
        let message = codex
            .error_message
            .as_deref()
            .expect("error message present");
        assert!(
            message.contains("not found") || message.contains("command failed"),
            "unexpected error message: {message}"
        );
        assert!(codex.installed_version.is_none());
        assert!(
            codex.upgrade_available,
            "missing agent should be treated as needing upgrade"
        );
    }

    #[tokio::test]
    async fn disabled_agents_are_not_probed() {
        let mut enabled = all_enabled();
        enabled.insert("codex".to_string(), false);

        let probe = FakeProbe::new()
            .with_command("claude", true, Ok(Some("1.0.0".to_string())))
            .with_command("gemini", true, Ok(Some("0.9.0".to_string())))
            .with_package("@anthropic-ai/claude-code", Ok(None))
            .with_installed_package("@anthropic-ai/claude-code", Ok(Some("1.0.0".to_string())))
            .with_package("@google/gemini-cli", Ok(None))
            .with_installed_package("@google/gemini-cli", Ok(Some("0.9.0".to_string())));

        let service = AgentStatusService::with_probe(probe.clone());
        let status = service.check_agents(&enabled).await.expect("status ok");

        let codex = find_agent(&status.agents, "codex");
        assert!(!codex.enabled, "codex should be marked disabled");
        assert!(!codex.available, "disabled agent should not be available");
        assert_eq!(
            probe.version_call_count("codex"),
            0,
            "disabled agent should not trigger version probe"
        );
    }
}
