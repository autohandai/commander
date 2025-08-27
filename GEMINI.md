# Gemini Development Standards

## Core Architecture Requirements

This Commander application uses **modular architecture** with **comprehensive TDD**. As Gemini, you must follow these standards for all development work.

## Project Structure - MANDATORY

```
src-tauri/src/
├── models/          # Data structures and types
├── services/        # Business logic layer
├── commands/        # Tauri command handlers (planned) 
├── tests/           # Comprehensive test coverage
├── lib.rs           # Minimal main entry point
└── error.rs         # Centralized error handling (planned)
```

## Test-Driven Development Protocol

### BEFORE any code implementation:

1. **Write Tests First**
   - Create comprehensive test coverage
   - Test success scenarios
   - Test error conditions  
   - Test edge cases
   - Follow existing patterns in `tests/`

2. **Verify Tests Fail**
   ```bash
   cargo test  # New tests should fail initially
   ```

3. **Implement Feature**
   - Write minimal code to pass tests
   - Follow modular architecture principles
   - Use proper Rust error handling

4. **Verify All Tests Pass**
   ```bash
   cargo test  # ALL tests must pass (currently 12+)
   ```

## Current Test Coverage

The project maintains **12 comprehensive tests** that cover:
- Git repository validation
- Project creation workflows
- File system operations
- Command integrations
- Error handling scenarios

**CRITICAL:** All existing tests MUST continue to pass. Breaking tests is not acceptable.

## Layer Responsibilities

### Models Layer (`models/`)
- Data structures and types only
- Serde serialization/deserialization
- No business logic
- Clear, well-documented structs

### Services Layer (`services/`)
- All business logic implementation
- Reusable functionality
- Proper error handling
- Testable functions
- Single responsibility principle

### Commands Layer (`commands/` - planned)
- Thin Tauri command handlers
- Delegate to services layer
- Input validation only
- No business logic

### Tests Layer (`tests/`)
- Comprehensive test coverage
- Helper functions for testing
- Mock external dependencies
- Integration and unit tests

## Implementation Standards for Gemini

### New Feature Implementation:

1. **Analyze Requirements**
   - Determine which layer(s) are affected
   - Identify existing patterns to follow
   - Plan test coverage strategy

2. **Write Comprehensive Tests**
   ```rust
   // tests/services/new_feature_test.rs
   #[tokio::test]
   async fn test_new_feature_success() {
       // Arrange
       let input = create_test_input();
       
       // Act
       let result = new_feature_service::process(input).await;
       
       // Assert
       assert!(result.is_ok());
       assert_eq!(result.unwrap().expected_field, "expected_value");
   }

   #[tokio::test]
   async fn test_new_feature_handles_error() {
       let result = new_feature_service::process(invalid_input()).await;
       assert!(result.is_err());
   }
   ```

3. **Implement in Appropriate Layer**
   ```rust
   // services/new_feature_service.rs
   use crate::models::*;
   
   pub async fn process(input: InputType) -> Result<OutputType, String> {
       // Business logic implementation
       // Proper error handling
       // Return Result type
   }
   ```

4. **Verify Integration**
   - Run full test suite: `cargo test`
   - Check compilation: `cargo check`
   - Test application: `bun tauri dev`

### Bug Fix Process:

1. **Create Failing Test** that reproduces the bug
2. **Identify Root Cause** in appropriate layer
3. **Fix the Issue** following architectural patterns
4. **Verify Fix** with test passing and no regressions

## Code Quality Requirements

- **Error Handling:** Use `Result<T, String>` consistently
- **Documentation:** Document public functions clearly
- **Separation:** No business logic in command handlers
- **Testing:** Test both happy path and error scenarios
- **Modularity:** Keep services focused on single responsibility

## Compilation and Testing Requirements

Before any commit or submission:

```bash
# 1. Code must compile without errors
cargo check

# 2. All tests must pass
cargo test

# 3. Application must run successfully  
bun tauri dev
```

## Gemini-Specific Best Practices

### When Working with AI/LLM Integration:
- Create comprehensive tests for AI service interactions
- Mock external API calls in tests
- Handle API failures gracefully
- Store API configurations in models layer
- Implement AI logic in services layer

### When Adding New Models:
- Follow existing model patterns
- Include proper serde attributes
- Add to appropriate model module
- Update mod.rs exports
- Write tests for serialization/deserialization

### When Extending Services:
- Keep services focused on single domain
- Use dependency injection patterns
- Make functions testable
- Handle errors consistently
- Document complex business logic

## Critical Rules for Gemini

### ❌ NEVER:
- Skip writing tests for new functionality
- Break existing test coverage
- Put business logic in lib.rs or command handlers
- Ignore compilation errors or warnings
- Change architecture without discussion

### ✅ ALWAYS:
- Follow TDD workflow religiously
- Keep layers properly separated
- Write comprehensive error handling
- Document public API functions
- Verify all tests pass before submitting

## Success Validation

Every change you make must pass ALL checks:

1. ✅ **Tests Written:** New functionality has comprehensive tests
2. ✅ **Tests Passing:** All tests (12+) pass successfully
3. ✅ **Compilation:** Code compiles without errors
4. ✅ **Architecture:** Follows modular structure
5. ✅ **Functionality:** Application runs correctly

## Example: Adding LLM Provider Support

```rust
// 1. Add test
#[tokio::test]
async fn test_add_custom_llm_provider() {
    let provider = create_test_provider();
    let result = llm_service::add_provider(provider).await;
    assert!(result.is_ok());
}

// 2. Add to model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomProvider {
    pub name: String,
    pub endpoint: String,
    pub api_key: Option<String>,
}

// 3. Implement in service
pub async fn add_provider(provider: CustomProvider) -> Result<(), String> {
    // Business logic for adding provider
    // Validation, storage, etc.
}

// 4. Add command (when commands/ exists)
#[tauri::command]
async fn add_llm_provider(provider: CustomProvider) -> Result<(), String> {
    llm_service::add_provider(provider).await
}
```

---

**Remember: Quality and reliability come from disciplined adherence to TDD and modular architecture. Every line of code you write should make the system more maintainable and testable.**