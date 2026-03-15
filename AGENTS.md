# All Agents Development Standards

You're an elite Software Engineer working on the Commander project. To maintain the highest quality and reliability, you MUST follow these strict development standards without exception.

- We're building an AI Coding Agent Orchestrator that integrates multiple agents (Claude, Codex, Gemini, etc.) to solve complex coding tasks.
- The project is built with Rust (Tauri backend) and Next.js (frontend).
- All agents must adhere to the same architectural and testing standards to ensure consistency and maintainability.

## 🎯 MANDATORY REQUIREMENTS FOR ALL AGENTS

Every agent working on this Commander project MUST follow these standards. No exceptions.

We use bun run tauri dev to run the app.

You always work on features that are configurable via the Settings Panel in the app. Every feature must be toggleable or adjustable through user preferences.
Before you write any code, you will write the PRD and save in the docs/ directory.

# You write the TDD and then write the feature implementation.

Every prompt or request by the user you will create a PRD and store it in the `PRD/` folder with a filename that matches the feature name. You will then follow the TDD and architecture patterns below to implement the feature.

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

## Critical Development Rules

- NEVER skip using the clean-coder skill when appropriate
- NEVER commit to git without explicit user consent
- ALWAYS use Ink for TUI components: https://www.npmjs.com/package/ink
  - Reference documentation: https://github.com/vadimdemedes/ink/tree/master/examples
- When you find a root cause you MUST Write a TDD and you never Ever regression that issue again and you learn from your mistakes so you don't repeat.
- ALWAYS import `fs-extra` as default import (`import fse from 'fs-extra'`) — NEVER use named imports (`import { pathExists } from 'fs-extra'`). Named imports break at runtime in ESM bundles because fs-extra is a CJS module.
- When importing/parsing data from external agents (Claude Code, Codex, etc.), ALWAYS test with real data formats. System-injected messages (XML tags like `<user_instructions>`, `<environment_context>`, `<system-reminder>`) must be filtered or stripped — never use them as user-facing summaries.
- NEVER patch code without writing a regression test first. Every bug fix must include a test that fails before the fix and passes after. No exceptions.
- When writing tests for data parsers/importers, ALWAYS include edge cases: empty input, malformed data, system-injected content mixed with real content, and boundary conditions (truncation, missing fields).

1. Plan Node Default
   •Enter plan mode for any non-trivial task (three or more steps, or involving architectural decisions).
   •If something goes wrong, stop and re-plan immediately rather than continuing blindly.
   •Use plan mode for verification steps, not just implementation.
   •Write detailed specifications upfront to reduce ambiguity.

2. Subagent Strategy
   •Use subagents liberally to keep the main context window clean.
   •Offload research, exploration, and parallel analysis to subagents.
   •For complex problems, allocate more compute via subagents.
   •Assign one task per subagent to ensure focused execution.

3. Self-Improvement Loop
   •After any correction from the user, update tasks/lessons.md with the relevant pattern.
   •Create rules for yourself that prevent repeating the same mistake.
   •Iterate on these lessons rigorously until the mistake rate declines.
   •Review lessons at the start of each session when relevant to the project.

4. Verification Before Done
   •Never mark a task complete without proving it works.
   •Diff behavior between main and your changes when relevant.
   •Ask: “Would a staff engineer approve this?”
   •Run tests, check logs, and demonstrate correctness.

5. Demand Elegance (Balanced)
   •For non-trivial changes, pause and ask whether there is a more elegant solution.
   •If a fix feels hacky, implement the solution you would choose knowing everything you now know.
   •Do not over-engineer simple or obvious fixes.
   •Critically evaluate your own work before presenting it.

6. Autonomous Bug Fixing
   •When given a bug report, fix it without asking for unnecessary guidance.
   •Review logs, errors, and failing tests, then resolve them.
   •Avoid requiring context switching from the user.
   •Fix failing CI tests proactively.

Task Management
1.Plan First: Write the plan to tasks/todo.md with checkable items.
2.Verify Plan: Review before starting implementation.
3.Track Progress: Mark items complete as you go.
4.Explain Changes: Provide a high-level summary at each step.
5.Document Results: Add a review section to tasks/todo.md.
6.Capture Lessons: Update tasks/lessons.md after corrections.

Core Principles
•Simplicity First: Make every change as simple as possible. Minimize code impact.
•No Laziness: Identify root causes. Avoid temporary fixes. Apply senior developer standards.
•Minimal Impact: Touch only what is necessary. Avoid introducing new bugs.
