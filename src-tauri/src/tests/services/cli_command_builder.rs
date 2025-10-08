use crate::models::ai_agent::AgentSettings;
use crate::services::cli_command_builder::build_codex_command_args;
use crate::services::execution_mode_service::ExecutionMode;

#[test]
fn codex_args_include_exec_and_prompt() {
    let settings = AgentSettings {
        model: None,
        ..Default::default()
    };

    let args = build_codex_command_args("how are you?", None, false, Some(&settings));

    assert_eq!(args.first().map(String::as_str), Some("exec"));
    assert!(
        args.contains(&"how are you?".to_string()),
        "prompt should be included in args"
    );
    assert!(args.contains(&"--skip-git-repo-check".to_string()));
}

#[test]
fn codex_args_include_model_flag_when_configured() {
    let settings = AgentSettings {
        model: Some("o3".to_string()),
        ..Default::default()
    };

    let args = build_codex_command_args("generate", None, false, Some(&settings));

    assert!(args.windows(2).any(|pair| pair == ["--model", "o3"]));
}

#[test]
fn codex_args_include_execution_mode_flags() {
    let settings = AgentSettings::default();

    let args = build_codex_command_args(
        "do something",
        Some(ExecutionMode::Collab),
        false,
        Some(&settings),
    );

    assert!(args.contains(&"--sandbox".to_string()));
    assert!(args.contains(&"workspace-write".to_string()));
    assert!(args.contains(&"--skip-git-repo-check".to_string()));
}

#[test]
fn codex_args_include_unsafe_full_toggle() {
    let settings = AgentSettings::default();

    let args =
        build_codex_command_args("run full", Some(ExecutionMode::Full), true, Some(&settings));

    assert!(args.contains(&"--dangerously-bypass-approvals-and-sandbox".to_string()));
}
