use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubAgent {
    pub name: String,
    pub description: String,
    pub color: Option<String>,
    pub model: Option<String>,
    pub content: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubAgentMetadata {
    pub name: String,
    pub description: String,
    pub color: Option<String>,
    pub model: Option<String>,
}
