#[cfg(test)]
mod tests {
    use crate::services::executors::{ExecutorFactory, AgentExecutor};
    use crate::services::agent_status_service::{ProtocolCache, ProtocolCacheEntry};
    use crate::models::protocol::ProtocolMode;

    #[test]
    fn factory_creates_pty_executor_when_no_protocol() {
        let cache = ProtocolCache::new();
        let executor = ExecutorFactory::create("claude", &cache);
        assert_eq!(executor.protocol(), None);
    }

    #[test]
    fn factory_creates_acp_executor_when_acp_cached() {
        let mut cache = ProtocolCache::new();
        cache.set("autohand", ProtocolCacheEntry {
            protocol: Some(ProtocolMode::Acp),
            agent_version: "0.1.0".into(),
            flag_variant: Some("--mode acp".into()),
        });
        let executor = ExecutorFactory::create("autohand", &cache);
        assert_eq!(executor.protocol(), Some(ProtocolMode::Acp));
    }

    #[test]
    fn factory_creates_rpc_executor_when_rpc_cached() {
        let mut cache = ProtocolCache::new();
        cache.set("autohand", ProtocolCacheEntry {
            protocol: Some(ProtocolMode::Rpc),
            agent_version: "0.1.0".into(),
            flag_variant: Some("--rpc".into()),
        });
        let executor = ExecutorFactory::create("autohand", &cache);
        assert_eq!(executor.protocol(), Some(ProtocolMode::Rpc));
    }
}
