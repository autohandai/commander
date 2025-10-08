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
}
