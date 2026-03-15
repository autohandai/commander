#[cfg(test)]
mod tests {
    use serde_json::Value;

    use crate::models::AppSettings;

    fn agent_from(value: &Value) -> Option<&str> {
        value.get("default_cli_agent").and_then(|v| v.as_str())
    }

    fn round_trip(mut raw: Value) -> Value {
        let settings: AppSettings =
            serde_json::from_value(raw.take()).expect("deserialize settings");
        serde_json::to_value(settings).expect("serialize settings")
    }

    #[test]
    fn default_settings_include_default_agent_field() {
        let value = serde_json::to_value(AppSettings::default()).expect("serialize defaults");
        assert_eq!(
            agent_from(&value),
            Some("claude"),
            "default AppSettings should expose the default CLI agent"
        );
    }

    #[test]
    fn serialization_round_trips_explicit_agent_selection() {
        let mut raw = serde_json::to_value(AppSettings::default()).expect("serialize defaults");
        raw["default_cli_agent"] = Value::String("codex".to_string());
        let value = round_trip(raw);

        assert_eq!(
            agent_from(&value),
            Some("codex"),
            "saving and loading should preserve an explicit default agent"
        );
    }

    #[test]
    fn invalid_agent_value_resets_to_default() {
        let mut raw = serde_json::to_value(AppSettings::default()).expect("serialize defaults");
        raw["default_cli_agent"] = Value::String("madeup".to_string());
        let value = round_trip(raw);

        assert_eq!(
            agent_from(&value),
            Some("claude"),
            "invalid agent strings should fall back to the standard default"
        );
    }

    #[test]
    fn optional_projects_folder_and_agent_round_trip() {
        let mut settings = AppSettings::default();
        settings.projects_folder = Some("/tmp/projects".to_string());
        settings.default_cli_agent = "gemini".to_string();

        let serialized = serde_json::to_value(&settings).expect("serialize settings");
        let deserialized: AppSettings =
            serde_json::from_value(serialized).expect("deserialize settings");

        assert_eq!(
            deserialized.projects_folder,
            Some("/tmp/projects".to_string()),
            "projects_folder should round-trip through serde"
        );
        assert_eq!(
            deserialized.default_cli_agent,
            "gemini".to_string(),
            "default_cli_agent should retain explicit choices"
        );
    }

    // --- Regression: "autohand" must be accepted as a valid default agent ---

    #[test]
    fn autohand_agent_survives_deserialization_round_trip() {
        let mut raw = serde_json::to_value(AppSettings::default()).expect("serialize defaults");
        raw["default_cli_agent"] = Value::String("autohand".to_string());
        let value = round_trip(raw);

        assert_eq!(
            agent_from(&value),
            Some("autohand"),
            "\"autohand\" is a valid agent and must not be replaced by the default"
        );
    }

    #[test]
    fn autohand_agent_survives_normalize() {
        let mut settings = AppSettings::default();
        settings.default_cli_agent = "autohand".to_string();
        settings.normalize();

        assert_eq!(
            settings.default_cli_agent, "autohand",
            "normalize() must keep \"autohand\" intact — it is in the allowlist"
        );
    }
}
