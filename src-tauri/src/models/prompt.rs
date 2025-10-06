use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTemplate {
    pub name: String,
    pub description: String,
    pub content: String,
    pub category: String,
    pub variables: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptCategory {
    pub name: String,
    pub description: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptsConfig {
    pub categories: HashMap<String, PromptCategory>,
    pub prompts: HashMap<String, HashMap<String, PromptTemplate>>,
    pub version: u32,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptUsage {
    pub prompt_id: String,
    pub category: String,
    pub used_at: i64,
    pub context: String,
    pub variables: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptVariable {
    pub name: String,
    pub description: String,
    pub default_value: Option<String>,
    pub required: bool,
}

impl PromptTemplate {
    /// Replace variables in the prompt content with provided values
    #[allow(dead_code)]
    pub fn render(&self, variables: &HashMap<String, String>) -> String {
        let mut rendered = self.content.clone();

        for (key, value) in variables {
            let placeholder = format!("{{{{{}}}}}", key);
            rendered = rendered.replace(&placeholder, value);
        }

        rendered
    }

    /// Extract all variable placeholders from the content
    #[allow(dead_code)]
    pub fn extract_variables(&self) -> Vec<String> {
        let mut variables = Vec::new();
        let content = &self.content;

        let mut start = 0;
        while let Some(open_pos) = content[start..].find("{{") {
            let open_pos = start + open_pos;
            if let Some(close_pos) = content[open_pos + 2..].find("}}") {
                let close_pos = open_pos + 2 + close_pos;
                let var_name = &content[open_pos + 2..close_pos];
                if !variables.contains(&var_name.to_string()) {
                    variables.push(var_name.to_string());
                }
                start = close_pos + 2;
            } else {
                break;
            }
        }

        variables
    }

    /// Validate that all required variables are provided
    #[allow(dead_code)]
    pub fn validate_variables(
        &self,
        variables: &HashMap<String, String>,
    ) -> Result<(), Vec<String>> {
        let required_vars = self.extract_variables();
        let missing_vars: Vec<String> = required_vars
            .iter()
            .filter(|var| !variables.contains_key(*var))
            .cloned()
            .collect();

        if missing_vars.is_empty() {
            Ok(())
        } else {
            Err(missing_vars)
        }
    }
}

impl PromptsConfig {
    /// Get a prompt by category and key
    #[allow(dead_code)]
    pub fn get_prompt(&self, category: &str, key: &str) -> Option<&PromptTemplate> {
        self.prompts.get(category)?.get(key)
    }

    /// Get all prompts in a category
    #[allow(dead_code)]
    pub fn get_category_prompts(&self, category: &str) -> Option<&HashMap<String, PromptTemplate>> {
        self.prompts.get(category)
    }

    /// Get all enabled categories
    #[allow(dead_code)]
    pub fn get_enabled_categories(&self) -> Vec<(&String, &PromptCategory)> {
        self.categories
            .iter()
            .filter(|(_, category)| category.enabled)
            .collect()
    }

    /// Add a new prompt to a category
    #[allow(dead_code)]
    pub fn add_prompt(&mut self, category: String, key: String, prompt: PromptTemplate) {
        self.prompts
            .entry(category)
            .or_default()
            .insert(key, prompt);
        self.updated_at = chrono::Utc::now().timestamp();
    }

    /// Remove a prompt from a category
    #[allow(dead_code)]
    pub fn remove_prompt(&mut self, category: &str, key: &str) -> Option<PromptTemplate> {
        let removed = self.prompts.get_mut(category)?.remove(key);
        if removed.is_some() {
            self.updated_at = chrono::Utc::now().timestamp();
        }
        removed
    }
}
