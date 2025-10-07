# All Agents Development Standards

## 🎯 MANDATORY REQUIREMENTS FOR ALL AGENTS

Every agent working on this Commander project MUST follow these standards. No exceptions.

<<<<<<< HEAD
We use bun run tauri dev to run the app.

You always work on features that are configurable via the Settings Panel in the app. Every feature must be toggleable or adjustable through user preferences.
Before you write any code, you will write the PRD and save in the docs/ directory.

You write the TDD and then write the feature implementation.
=======
Every prompt or request by the user you will create a PRD and store it in the `PRD/` folder with a filename that matches the feature name. You will then follow the TDD and architecture patterns below to implement the feature.
>>>>>>> f5183e6 (fixing the ui for chat to be default)

## Architecture Pattern - STRICT COMPLIANCE

### Modular Structure (REQUIRED)
```
src-tauri/src/
├── models/          # Data structures only
├── services/        # Business logic only  
├── commands/        # Tauri handlers only (planned)
├── tests/           # Comprehensive tests (MANDATORY)
├── lib.rs           # Minimal entry point
└── error.rs         # Error types (planned)
```

## Test-Driven Development - NON-NEGOTIABLE

###
### Before ANY code changes:

1. **WRITE TESTS FIRST** ⚠️
   - Write failing tests that cover your feature
   - Include success scenarios
   - Include failure scenarios
   - Include edge cases

2. **RUN TESTS** ⚠️
   ```bash
   cargo test  # Must show new tests failing
   ```
   
   For frontend you usually get stuck here, but put a timelimit

   ```bash
   bun run test 
   ``` 

3. **IMPLEMENT FEATURE** ⚠️
   - Write minimal code to pass tests
   - Follow modular architecture
   - Use proper error handling

4. **VERIFY ALL TESTS PASS** ⚠️
   ```bash
   cargo test  # ALL 12+ tests must pass
   ```

## Current Test Suite: 12 TESTS - ALL MUST PASS

These tests cover critical functionality and MUST remain passing:
- Git repository validation
- Project creation workflows
- File system operations
- Command integrations
- Error handling

**BREAKING ANY EXISTING TEST IS UNACCEPTABLE**

## Implementation Rules

### ✅ REQUIRED PATTERNS:

**For New Features:**
1. Create test in `tests/commands/` or `tests/services/`
2. Implement business logic in `services/`
3. Add data structures in `models/`
4. Keep command handlers minimal (when commands/ exists)

**For Bug Fixes:**
1. Write failing test that reproduces bug
2. Fix in appropriate service layer
3. Verify test passes and no regressions

**Code Quality:**
- Single responsibility principle
- Proper error handling with Result types
- Clear function documentation
- No business logic in lib.rs

### ❌ FORBIDDEN ACTIONS:

- ❌ Breaking existing tests
- ❌ Adding code without tests
- ❌ Creating monolithic functions
- ❌ Mixing layers (business logic in commands)
- ❌ Skipping `cargo test` verification
- ❌ Changing modular structure

## Verification Checklist - MANDATORY

Before submitting ANY change:

```bash
# 1. All tests must pass
cargo test
# ✅ Result: 12+ tests passed

# 2. Code must compile without errors
cargo check  
# ✅ Result: No compilation errors

# 3. Application must run
bun tauri dev
# ✅ Result: Application starts successfully
```

## Agent-Specific Guidelines

### For Tauri-V2-Native-Expert:
- Focus on native integrations in services layer
- Write tests for platform-specific behavior
- Keep Tauri commands minimal - delegate to services

### For Python-CLI-Architect:
- Apply same TDD principles to any CLI tools
- Integrate with existing test patterns
- Maintain architectural consistency

### For NextJS-Fullstack-Architect:
- Follow frontend standards (preserve dialog widths)
- Test frontend-backend integrations
- Coordinate with Rust backend architecture

### For Code-Reviewer:
- Verify TDD compliance
- Check architectural adherence
- Ensure all tests pass
- Validate modular structure

## Success Criteria

Every change MUST meet ALL criteria:

1. **Tests:** New tests written and passing ✅
2. **Architecture:** Follows modular pattern ✅  
3. **Quality:** No compilation errors ✅
4. **Regression:** All existing tests pass ✅
5. **Documentation:** Changes documented ✅

## Example Implementation Flow

```rust
// Step 1: Write test
#[tokio::test]
async fn test_new_feature_handles_edge_case() {
    let result = new_feature_service::handle_edge_case().await;
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), "Expected error message");
}

// Step 2: Implement in service
pub async fn handle_edge_case() -> Result<Output, String> {
    // Business logic here
    Err("Expected error message".to_string())
}

// Step 3: Add command handler (when commands/ exists)
#[tauri::command] 
async fn new_feature(input: Input) -> Result<Output, String> {
    new_feature_service::handle_edge_case().await
}
```

## Emergency Protocols

If you encounter broken tests:
1. **STOP** - Do not proceed with changes
2. **IDENTIFY** - Which test is broken and why
3. **FIX** - Address the root cause
4. **VERIFY** - Ensure all tests pass before continuing

If you need to change architecture:
1. **DISCUSS** - Propose changes in documentation
2. **PLAN** - Ensure migration maintains test coverage  
3. **IMPLEMENT** - Follow TDD throughout migration
4. **VERIFY** - All functionality preserved

---

## 🚨 FINAL WARNING

**NO AGENT MAY IGNORE THESE STANDARDS**

Every agent is responsible for:
- Writing comprehensive tests
- Following modular architecture  
- Ensuring all tests pass
- Maintaining code quality
- Preserving existing functionality

**Failure to comply will result in rejected changes and potential system instability.**

The Commander project's reliability depends on EVERY agent following these standards without exception.