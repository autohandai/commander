#[cfg(test)]
mod tests {
    use crate::services::executors::pty_executor::PtyExecutor;
    use crate::services::executors::AgentExecutor;

    #[test]
    fn pty_executor_reports_no_protocol() {
        let executor = PtyExecutor::new();
        assert_eq!(executor.protocol(), None);
    }

    #[test]
    fn pty_executor_is_not_alive_before_execute() {
        let executor = PtyExecutor::new();
        assert!(!executor.is_alive());
    }
}
