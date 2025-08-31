use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use crate::models::sub_agent::{SubAgent, SubAgentMetadata};

pub struct SubAgentService;

impl SubAgentService {
    /// Load all sub-agents from the user's home directory
    pub async fn load_all_sub_agents() -> Result<Vec<SubAgent>, String> {
        let mut all_agents = Vec::new();
        
        // Define the possible agent directories for different CLI tools
        let agent_paths = vec![
            "~/.claude/agents",
            "~/.codex/agents",
            "~/.gemini/agents",
            "~/claude/agents",
            "~/codex/agents",
            "~/gemini/agents",
        ];
        
        for path_str in agent_paths {
            let expanded_path = Self::expand_tilde(path_str)?;
            if let Ok(agents) = Self::load_agents_from_directory(&expanded_path).await {
                all_agents.extend(agents);
            }
        }
        
        Ok(all_agents)
    }
    
    /// Load agents from a specific CLI tool
    pub async fn load_agents_for_cli(cli_name: &str) -> Result<Vec<SubAgent>, String> {
        let paths = vec![
            format!("~/.{}/agents", cli_name),
            format!("~/{}/agents", cli_name),
        ];
        
        let mut agents = Vec::new();
        for path_str in paths {
            let expanded_path = Self::expand_tilde(&path_str)?;
            if let Ok(found_agents) = Self::load_agents_from_directory(&expanded_path).await {
                agents.extend(found_agents);
            }
        }
        
        Ok(agents)
    }
    
    /// Load agents from a specific directory
    async fn load_agents_from_directory(dir_path: &Path) -> Result<Vec<SubAgent>, String> {
        if !dir_path.exists() {
            return Ok(Vec::new());
        }
        
        let mut agents = Vec::new();
        
        let entries = fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory: {}", e))?;
        
        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();
            
            // Only process .md files
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(agent) = Self::parse_agent_file(&path).await {
                    agents.push(agent);
                }
            }
        }
        
        Ok(agents)
    }
    
    /// Parse a single agent markdown file
    async fn parse_agent_file(file_path: &Path) -> Result<SubAgent, String> {
        let content = fs::read_to_string(file_path)
            .map_err(|e| format!("Failed to read file {}: {}", file_path.display(), e))?;
        
        // Parse the frontmatter and content
        let (metadata, agent_content) = Self::parse_frontmatter(&content)?;
        
        Ok(SubAgent {
            name: metadata.name,
            description: metadata.description,
            color: metadata.color,
            model: metadata.model,
            content: agent_content,
            file_path: file_path.to_string_lossy().to_string(),
        })
    }
    
    /// Parse frontmatter from markdown content
    fn parse_frontmatter(content: &str) -> Result<(SubAgentMetadata, String), String> {
        let lines: Vec<&str> = content.lines().collect();
        
        // Find the frontmatter boundaries
        let mut start_idx = None;
        let mut end_idx = None;
        
        for (i, line) in lines.iter().enumerate() {
            if line.trim() == "---" {
                if start_idx.is_none() {
                    start_idx = Some(i);
                } else if end_idx.is_none() {
                    end_idx = Some(i);
                    break;
                }
            }
        }
        
        let (start_idx, end_idx) = match (start_idx, end_idx) {
            (Some(s), Some(e)) if s < e => (s, e),
            _ => return Err("Invalid frontmatter format".to_string()),
        };
        
        // Parse the frontmatter
        let mut metadata = SubAgentMetadata {
            name: String::new(),
            description: String::new(),
            color: None,
            model: None,
        };
        
        for i in (start_idx + 1)..end_idx {
            let line = lines[i];
            if let Some((key, value)) = Self::parse_yaml_line(line) {
                match key.as_str() {
                    "name" => metadata.name = value,
                    "description" => metadata.description = value,
                    "color" => metadata.color = Some(value),
                    "model" => metadata.model = Some(value),
                    _ => {}
                }
            }
        }
        
        // Get the content after frontmatter
        let content_lines = &lines[(end_idx + 1)..];
        let agent_content = content_lines.join("\n").trim().to_string();
        
        Ok((metadata, agent_content))
    }
    
    /// Parse a single YAML line from frontmatter
    fn parse_yaml_line(line: &str) -> Option<(String, String)> {
        let parts: Vec<&str> = line.splitn(2, ':').collect();
        if parts.len() == 2 {
            let key = parts[0].trim().to_string();
            let value = parts[1].trim().to_string();
            Some((key, value))
        } else {
            None
        }
    }
    
    /// Expand tilde in path to user's home directory
    fn expand_tilde(path: &str) -> Result<PathBuf, String> {
        if path.starts_with("~") {
            let home = home::home_dir()
                .ok_or_else(|| "Failed to get home directory".to_string())?;
            let path_without_tilde = &path[1..];
            let path_without_tilde = path_without_tilde.trim_start_matches('/');
            Ok(home.join(path_without_tilde))
        } else {
            Ok(PathBuf::from(path))
        }
    }
    
    /// Get agents grouped by their CLI tool
    pub async fn get_agents_by_cli() -> Result<HashMap<String, Vec<SubAgent>>, String> {
        let mut grouped_agents: HashMap<String, Vec<SubAgent>> = HashMap::new();
        
        // Load agents for each CLI tool
        for cli in &["claude", "codex", "gemini"] {
            let agents = Self::load_agents_for_cli(cli).await?;
            if !agents.is_empty() {
                grouped_agents.insert(cli.to_string(), agents);
            }
        }
        
        Ok(grouped_agents)
    }
}