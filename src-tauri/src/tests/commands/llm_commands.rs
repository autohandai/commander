#[cfg(test)]
mod tests {
    /// Regression test: start_agent_monitor must use tauri::async_runtime::spawn,
    /// NOT tokio::spawn. Using tokio::spawn panics at app startup because the
    /// setup hook runs on the main thread outside a Tokio runtime context.
    ///
    /// Bug: "there is no reactor running, must be called from the context of a Tokio 1.x runtime"
    /// Fix: replaced tokio::spawn with tauri::async_runtime::spawn
    #[test]
    fn start_agent_monitor_uses_tauri_async_runtime_spawn() {
        let source = include_str!("../../commands/llm_commands.rs");

        // Locate the function body (take a generous slice)
        let fn_start = source
            .find("fn start_agent_monitor")
            .expect("start_agent_monitor function must exist");
        let fn_body = &source[fn_start..std::cmp::min(fn_start + 600, source.len())];

        assert!(
            fn_body.contains("tauri::async_runtime::spawn"),
            "start_agent_monitor must use tauri::async_runtime::spawn, not tokio::spawn. \
             Using tokio::spawn panics when called from the main thread setup hook."
        );
        assert!(
            !fn_body.contains("tokio::spawn"),
            "start_agent_monitor must NOT use tokio::spawn — it's called from the main \
             thread outside a Tokio runtime context."
        );
    }
}
