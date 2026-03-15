pub mod autohand_scanner;
pub mod claude_scanner;
pub mod codex_scanner;
pub mod gemini_scanner;

use super::scanner::AgentScanner;
use autohand_scanner::AutohandScanner;
use claude_scanner::ClaudeScanner;
use codex_scanner::CodexScanner;
use gemini_scanner::GeminiScanner;

/// Build the default set of agent scanners
pub fn build_scanner_registry() -> Vec<Box<dyn AgentScanner>> {
    vec![
        Box::new(ClaudeScanner::new()),
        Box::new(CodexScanner::new()),
        Box::new(AutohandScanner::new()),
        Box::new(GeminiScanner::new()),
    ]
}
