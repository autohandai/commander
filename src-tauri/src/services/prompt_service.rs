use crate::models::*;
use std::collections::HashMap;
use tauri_plugin_store::StoreExt;

/// Get default prompts configuration
pub fn get_default_prompts() -> PromptsConfig {
    let mut categories = HashMap::new();
    let mut prompts = HashMap::new();

    // Plan Mode Category
    categories.insert(
        "plan_mode".to_string(),
        PromptCategory {
            name: "Plan Mode".to_string(),
            description: "Prompts for plan generation and execution".to_string(),
            enabled: true,
        },
    );

    let plan_prompts = HashMap::from([
        ("system".to_string(), PromptTemplate {
            name: "Plan Generation System Prompt".to_string(),
            description: "System prompt used for generating execution plans with Ollama".to_string(),
            content: r#"You are an expert project planner and software architect. Break down the user's request into clear, actionable steps that can be executed by AI coding assistants.

For each step, provide:
1. A clear title (what needs to be done)  
2. A brief description (how to do it)
3. Estimated time (be realistic: 1-30 minutes per step)
4. Dependencies (reference other step IDs if needed)
5. Detailed implementation notes with specific technical guidance

Format your response as JSON:
{
  "title": "Descriptive plan title",
  "description": "Brief description of what this plan accomplishes", 
  "steps": [
    {
      "id": "step-1",
      "title": "Step title",
      "description": "Brief description",
      "estimatedTime": "5 minutes",
      "dependencies": [],
      "details": "Detailed implementation notes, file paths, code examples, and considerations"
    }
  ]
}

Guidelines:
- Break complex tasks into 3-8 manageable steps
- Each step should be completable in 1-30 minutes
- Include specific file paths, component names, and technical details
- Consider error handling and edge cases
- Focus on implementation steps that AI assistants can execute
- Make dependencies clear and logical"#.to_string(),
            category: "plan_mode".to_string(),
            variables: vec![],
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }),
        ("user_context".to_string(), PromptTemplate {
            name: "Plan Context Template".to_string(),
            description: "Template for adding user context to plan generation".to_string(),
            content: r#"User Request: {{user_request}}

Project Context:
- Working Directory: {{working_dir}}
- Project Type: {{project_type}}
- Available Tools: {{available_tools}}

Please create a detailed execution plan for this request."#.to_string(),
            category: "plan_mode".to_string(),
            variables: vec![
                "user_request".to_string(),
                "working_dir".to_string(), 
                "project_type".to_string(),
                "available_tools".to_string()
            ],
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }),
    ]);
    prompts.insert("plan_mode".to_string(), plan_prompts);

    // Agent Execution Category
    categories.insert(
        "agent_execution".to_string(),
        PromptCategory {
            name: "Agent Execution".to_string(),
            description: "Prompts used when executing tasks with AI agents".to_string(),
            enabled: true,
        },
    );

    let execution_prompts = HashMap::from([
        ("claude_system".to_string(), PromptTemplate {
            name: "Claude Code CLI System Prompt".to_string(),
            description: "System prompt for Claude Code CLI agent interactions".to_string(),
            content: r#"You are Claude Code CLI, an AI assistant specialized in software development and coding tasks.

Your capabilities:
- Advanced code analysis and review
- Intelligent refactoring and optimization
- Comprehensive debugging assistance
- Detailed code explanations
- Performance optimization recommendations

Guidelines:
- Be concise and direct in your responses
- Provide concrete, actionable suggestions
- Include relevant code examples when helpful
- Consider security and performance implications
- Follow established coding conventions and best practices

When working with code:
- Always read and understand existing code structure first
- Maintain consistency with the existing codebase
- Test your changes when possible
- Document significant changes clearly"#.to_string(),
            category: "agent_execution".to_string(),
            variables: vec![],
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }),
        ("codex_system".to_string(), PromptTemplate {
            name: "Codex System Prompt".to_string(),
            description: "System prompt for Codex agent interactions".to_string(),
            content: r#"You are Codex, a specialized code generation and completion AI assistant.

Your expertise:
- Code generation from natural language descriptions
- Intelligent auto-completion and suggestions
- Language translation between programming languages
- Implementation of design patterns and algorithms
- Code optimization and refactoring

Focus areas:
- Generate clean, efficient, and maintainable code
- Follow language-specific conventions and idioms
- Implement proper error handling
- Consider scalability and performance
- Provide clear documentation and comments

When generating code:
- Ask clarifying questions if requirements are ambiguous
- Suggest multiple approaches when appropriate
- Explain trade-offs between different solutions
- Include proper imports and dependencies
- Test the generated code when possible"#.to_string(),
            category: "agent_execution".to_string(),
            variables: vec![],
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }),
        ("gemini_system".to_string(), PromptTemplate {
            name: "Gemini System Prompt".to_string(),
            description: "System prompt for Gemini agent interactions".to_string(),
            content: r#"You are Gemini, Google's advanced multimodal AI assistant with capabilities in code, analysis, and creative problem-solving.

Your strengths:
- Multimodal understanding (text, images, and code together)
- Complex logical reasoning and problem-solving
- Real-time information processing and web integration
- Creative and innovative solution approaches
- Cross-domain knowledge synthesis

Approach:
- Leverage multimodal capabilities when relevant
- Provide comprehensive analysis from multiple perspectives
- Suggest innovative solutions to complex problems
- Integrate web-based information when helpful
- Balance creativity with practical implementation

When assisting with development:
- Consider the broader system architecture
- Suggest modern tools and approaches
- Provide alternative perspectives on problems
- Help with both technical implementation and strategic decisions
- Offer creative solutions to challenging requirements"#.to_string(),
            category: "agent_execution".to_string(),
            variables: vec![],
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
        }),
    ]);
    prompts.insert("agent_execution".to_string(), execution_prompts);

    // Code Analysis Category
    categories.insert(
        "code_analysis".to_string(),
        PromptCategory {
            name: "Code Analysis".to_string(),
            description: "Prompts for code review and analysis tasks".to_string(),
            enabled: true,
        },
    );

    let analysis_prompts = HashMap::from([
        (
            "review_checklist".to_string(),
            PromptTemplate {
                name: "Code Review Checklist".to_string(),
                description: "Comprehensive code review prompt template".to_string(),
                content: r#"Please review the following code and provide feedback on:

**Code Quality:**
- [ ] Code readability and maintainability
- [ ] Proper naming conventions
- [ ] Code organization and structure
- [ ] Documentation and comments

**Functionality:**
- [ ] Correctness of implementation
- [ ] Edge case handling
- [ ] Error handling and validation
- [ ] Performance considerations

**Security:**
- [ ] Input validation and sanitization
- [ ] Authentication and authorization
- [ ] Data exposure risks
- [ ] Injection vulnerabilities

**Best Practices:**
- [ ] Follow language/framework conventions
- [ ] Proper resource management
- [ ] Testing considerations
- [ ] Deployment and configuration

Code to review:
{{code_content}}

Please provide specific, actionable feedback with examples where appropriate."#
                    .to_string(),
                category: "code_analysis".to_string(),
                variables: vec!["code_content".to_string()],
                created_at: chrono::Utc::now().timestamp(),
                updated_at: chrono::Utc::now().timestamp(),
            },
        ),
        (
            "performance_analysis".to_string(),
            PromptTemplate {
                name: "Performance Analysis Template".to_string(),
                description: "Template for analyzing code performance".to_string(),
                content: r#"Analyze the performance characteristics of this code:

**Performance Analysis for:** {{component_name}}

**Code:**
{{code_content}}

**Analysis Areas:**
1. **Time Complexity**: What is the Big O notation for this code?
2. **Space Complexity**: Memory usage patterns and optimization opportunities
3. **Bottlenecks**: Identify potential performance bottlenecks
4. **Scalability**: How will this perform with larger datasets?
5. **Resource Usage**: CPU, memory, I/O considerations

**Optimization Suggestions:**
- Provide specific optimization recommendations
- Include alternative algorithms or approaches
- Consider caching strategies where appropriate
- Suggest profiling approaches

**Trade-offs:**
- Discuss performance vs. readability trade-offs
- Memory vs. speed considerations
- Maintenance implications of optimizations"#
                    .to_string(),
                category: "code_analysis".to_string(),
                variables: vec!["component_name".to_string(), "code_content".to_string()],
                created_at: chrono::Utc::now().timestamp(),
                updated_at: chrono::Utc::now().timestamp(),
            },
        ),
    ]);
    prompts.insert("code_analysis".to_string(), analysis_prompts);

    PromptsConfig {
        categories,
        prompts,
        version: 1,
        updated_at: chrono::Utc::now().timestamp(),
    }
}

/// Load prompts from store
pub async fn load_prompts(app: &tauri::AppHandle) -> Result<PromptsConfig, String> {
    let store = app
        .store("prompts.json")
        .map_err(|e| format!("Failed to access prompts store: {}", e))?;

    let prompts = store
        .get("prompts_config")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_else(|| get_default_prompts());

    Ok(prompts)
}

/// Save prompts to store
pub async fn save_prompts(app: &tauri::AppHandle, prompts: &PromptsConfig) -> Result<(), String> {
    let store = app
        .store("prompts.json")
        .map_err(|e| format!("Failed to access prompts store: {}", e))?;

    let serialized = serde_json::to_value(prompts)
        .map_err(|e| format!("Failed to serialize prompts config: {}", e))?;

    store.set("prompts_config", serialized);
    store
        .save()
        .map_err(|e| format!("Failed to save prompts store: {}", e))?;

    Ok(())
}

/// Update a specific prompt
pub async fn update_prompt(
    app: &tauri::AppHandle,
    category: &str,
    key: &str,
    prompt: &PromptTemplate,
) -> Result<(), String> {
    let mut config = load_prompts(app).await?;

    if let Some(category_prompts) = config.prompts.get_mut(category) {
        let mut updated_prompt = prompt.clone();
        updated_prompt.updated_at = chrono::Utc::now().timestamp();
        category_prompts.insert(key.to_string(), updated_prompt);

        config.updated_at = chrono::Utc::now().timestamp();
        save_prompts(app, &config).await?;
        Ok(())
    } else {
        Err(format!("Category '{}' not found", category))
    }
}

/// Delete a specific prompt
pub async fn delete_prompt(
    app: &tauri::AppHandle,
    category: &str,
    key: &str,
) -> Result<(), String> {
    let mut config = load_prompts(app).await?;

    if let Some(category_prompts) = config.prompts.get_mut(category) {
        if category_prompts.remove(key).is_some() {
            config.updated_at = chrono::Utc::now().timestamp();
            save_prompts(app, &config).await?;
            Ok(())
        } else {
            Err(format!(
                "Prompt '{}' not found in category '{}'",
                key, category
            ))
        }
    } else {
        Err(format!("Category '{}' not found", category))
    }
}

/// Create a new prompt category
pub async fn create_category(
    app: &tauri::AppHandle,
    category: &str,
    description: &str,
) -> Result<(), String> {
    let mut config = load_prompts(app).await?;

    let new_category = PromptCategory {
        name: category.to_string(),
        description: description.to_string(),
        enabled: true,
    };

    config.categories.insert(category.to_string(), new_category);
    config.prompts.insert(category.to_string(), HashMap::new());
    config.updated_at = chrono::Utc::now().timestamp();

    save_prompts(app, &config).await?;
    Ok(())
}
