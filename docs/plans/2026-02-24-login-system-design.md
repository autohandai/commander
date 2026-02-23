# Login System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add authentication to Commander so users must sign in via the Autohand device code flow before accessing the app.

**Architecture:** Device code flow — app calls existing API endpoints to initiate auth, opens system browser, polls for completion, stores token in Tauri store + `~/.autohand/sessions/`. React AuthContext gates the entire app behind a login screen.

**Tech Stack:** React + TypeScript (frontend), Rust/Tauri v2 (backend), Vitest + @testing-library/react (frontend tests), cargo test (backend tests), tauri-plugin-store (token persistence), tauri-plugin-opener (open browser)

---

### Task 1: Create auth types (frontend)

**Files:**
- Create: `src/types/auth.ts`

**Step 1: Write the types file**

```typescript
// src/types/auth.ts

export interface AuthUser {
  id: string
  email: string
  name: string
  avatar_url: string | null
}

export interface DeviceAuthResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

export interface PollResponse {
  status: 'pending' | 'authorized' | 'expired'
  token?: string
  user?: AuthUser
  error?: string
}

export type AuthStatus = 'loading' | 'unauthenticated' | 'polling' | 'authenticated' | 'error' | 'expired'

export interface AuthState {
  status: AuthStatus
  user: AuthUser | null
  token: string | null
  error: string | null
  userCode: string | null
  verificationUri: string | null
}
```

**Step 2: Verify no type errors**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun run tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to auth.ts

**Step 3: Commit**

```bash
git add src/types/auth.ts
git commit -m "feat(auth): add auth types for device code flow"
```

---

### Task 2: Create auth service (frontend)

**Files:**
- Create: `src/services/auth-service.ts`
- Test: `src/services/__tests__/auth-service.test.ts`

**Step 1: Write the failing test**

```typescript
// src/services/__tests__/auth-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { initiateDeviceAuth, pollForAuth, validateToken, logoutFromApi, AUTH_CONFIG } from '../auth-service'

describe('auth-service', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe('AUTH_CONFIG', () => {
    it('has correct API base URL', () => {
      expect(AUTH_CONFIG.apiBaseUrl).toBe('https://autohand.ai/api/auth')
    })

    it('has correct poll interval', () => {
      expect(AUTH_CONFIG.pollInterval).toBe(2000)
    })

    it('has correct auth timeout', () => {
      expect(AUTH_CONFIG.authTimeout).toBe(300000)
    })
  })

  describe('initiateDeviceAuth', () => {
    it('calls POST /cli/initiate and returns device auth data', async () => {
      const mockResponse = {
        deviceCode: 'dev-123',
        userCode: 'ABCD-1234',
        verificationUri: 'https://autohand.ai/cli-auth?code=ABCD-1234',
        expiresIn: 300,
        interval: 2,
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await initiateDeviceAuth()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://autohand.ai/api/auth/cli/initiate',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      })

      await expect(initiateDeviceAuth()).rejects.toThrow()
    })
  })

  describe('pollForAuth', () => {
    it('calls POST /cli/poll with deviceCode', async () => {
      const mockResponse = { status: 'pending' }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await pollForAuth('dev-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://autohand.ai/api/auth/cli/poll',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ deviceCode: 'dev-123' }),
        })
      )
      expect(result).toEqual(mockResponse)
    })

    it('returns authorized with token and user', async () => {
      const mockResponse = {
        status: 'authorized',
        token: 'tok-abc',
        user: { id: '1', email: 'test@test.com', name: 'Test', avatar_url: null },
      }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      })

      const result = await pollForAuth('dev-123')
      expect(result.status).toBe('authorized')
      expect(result.token).toBe('tok-abc')
      expect(result.user?.email).toBe('test@test.com')
    })
  })

  describe('validateToken', () => {
    it('calls GET /me with bearer token', async () => {
      const mockUser = { id: '1', email: 'test@test.com', name: 'Test', avatar_url: null }
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockUser,
      })

      const result = await validateToken('tok-abc')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://autohand.ai/api/auth/me',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer tok-abc',
          }),
        })
      )
      expect(result).toEqual(mockUser)
    })

    it('returns null on 401', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })

      const result = await validateToken('bad-token')
      expect(result).toBeNull()
    })
  })

  describe('logoutFromApi', () => {
    it('calls POST /logout with bearer token', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) })

      await logoutFromApi('tok-abc')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://autohand.ai/api/auth/logout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer tok-abc',
          }),
        })
      )
    })
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/services/__tests__/auth-service.test.ts 2>&1 | tail -20`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/services/auth-service.ts
import type { DeviceAuthResponse, PollResponse, AuthUser } from '@/types/auth'

export const AUTH_CONFIG = {
  apiBaseUrl: 'https://autohand.ai/api/auth',
  verificationBaseUrl: 'https://autohand.ai/cli-auth',
  pollInterval: 2000,
  authTimeout: 300000,
  sessionExpiryDays: 30,
} as const

export async function initiateDeviceAuth(): Promise<DeviceAuthResponse> {
  const res = await fetch(`${AUTH_CONFIG.apiBaseUrl}/cli/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to initiate auth (${res.status})`)
  }

  return res.json()
}

export async function pollForAuth(deviceCode: string): Promise<PollResponse> {
  const res = await fetch(`${AUTH_CONFIG.apiBaseUrl}/cli/poll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceCode }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Poll failed (${res.status})`)
  }

  return res.json()
}

export async function validateToken(token: string): Promise<AuthUser | null> {
  try {
    const res = await fetch(`${AUTH_CONFIG.apiBaseUrl}/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function logoutFromApi(token: string): Promise<void> {
  await fetch(`${AUTH_CONFIG.apiBaseUrl}/logout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/services/__tests__/auth-service.test.ts 2>&1 | tail -20`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/services/auth-service.ts src/services/__tests__/auth-service.test.ts
git commit -m "feat(auth): add auth service with device code flow API calls"
```

---

### Task 3: Create Rust auth model

**Files:**
- Create: `src-tauri/src/models/auth.rs`
- Modify: `src-tauri/src/models/mod.rs`

**Step 1: Write the auth model**

```rust
// src-tauri/src/models/auth.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredAuth {
    pub token: String,
    pub user: AuthUser,
    pub device_id: String,
    pub created_at: String,
}
```

**Step 2: Register in models/mod.rs**

Add to `src-tauri/src/models/mod.rs` after the `pub mod sub_agent;` line:
```rust
pub mod auth;
```

And add to the re-exports:
```rust
pub use auth::*;
```

**Step 3: Verify compilation**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo check 2>&1 | tail -10`
Expected: No errors

**Step 4: Commit**

```bash
git add src-tauri/src/models/auth.rs src-tauri/src/models/mod.rs
git commit -m "feat(auth): add Rust auth model structs"
```

---

### Task 4: Create Rust auth service (token file I/O)

**Files:**
- Create: `src-tauri/src/services/auth_service.rs`
- Modify: `src-tauri/src/services/mod.rs`
- Test: `src-tauri/src/tests/services/auth_service.rs`
- Modify: `src-tauri/src/tests/services/mod.rs`

**Step 1: Write the failing test**

```rust
// src-tauri/src/tests/services/auth_service.rs
use crate::models::auth::{AuthUser, StoredAuth};
use crate::services::auth_service;
use tempfile::TempDir;

#[test]
fn test_save_and_load_auth_token() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path().join(".autohand").join("sessions");

    let stored = StoredAuth {
        token: "test-token-123".to_string(),
        user: AuthUser {
            id: "user-1".to_string(),
            email: "test@example.com".to_string(),
            name: "Test User".to_string(),
            avatar_url: Some("https://example.com/avatar.png".to_string()),
        },
        device_id: "commander-dev-1".to_string(),
        created_at: "2026-02-24T00:00:00Z".to_string(),
    };

    auth_service::save_auth_to_file(&sessions_dir, &stored).unwrap();
    let loaded = auth_service::load_auth_from_file(&sessions_dir).unwrap();

    assert!(loaded.is_some());
    let loaded = loaded.unwrap();
    assert_eq!(loaded.token, "test-token-123");
    assert_eq!(loaded.user.email, "test@example.com");
    assert_eq!(loaded.device_id, "commander-dev-1");
}

#[test]
fn test_load_returns_none_when_no_file() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path().join(".autohand").join("sessions");

    let loaded = auth_service::load_auth_from_file(&sessions_dir).unwrap();
    assert!(loaded.is_none());
}

#[test]
fn test_clear_auth_file() {
    let temp = TempDir::new().unwrap();
    let sessions_dir = temp.path().join(".autohand").join("sessions");

    let stored = StoredAuth {
        token: "tok".to_string(),
        user: AuthUser {
            id: "1".to_string(),
            email: "a@b.com".to_string(),
            name: "A".to_string(),
            avatar_url: None,
        },
        device_id: "dev".to_string(),
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };

    auth_service::save_auth_to_file(&sessions_dir, &stored).unwrap();
    auth_service::clear_auth_file(&sessions_dir).unwrap();

    let loaded = auth_service::load_auth_from_file(&sessions_dir).unwrap();
    assert!(loaded.is_none());
}
```

Register in `src-tauri/src/tests/services/mod.rs`:
```rust
pub mod auth_service;
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo test tests::services::auth_service 2>&1 | tail -15`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```rust
// src-tauri/src/services/auth_service.rs
use crate::models::auth::StoredAuth;
use std::fs;
use std::path::Path;

const AUTH_FILE_NAME: &str = "commander.json";

pub fn save_auth_to_file(sessions_dir: &Path, auth: &StoredAuth) -> Result<(), String> {
    fs::create_dir_all(sessions_dir).map_err(|e| format!("Failed to create sessions dir: {}", e))?;

    let file_path = sessions_dir.join(AUTH_FILE_NAME);
    let json = serde_json::to_string_pretty(auth)
        .map_err(|e| format!("Failed to serialize auth: {}", e))?;

    fs::write(&file_path, json).map_err(|e| format!("Failed to write auth file: {}", e))?;

    Ok(())
}

pub fn load_auth_from_file(sessions_dir: &Path) -> Result<Option<StoredAuth>, String> {
    let file_path = sessions_dir.join(AUTH_FILE_NAME);

    if !file_path.exists() {
        return Ok(None);
    }

    let content =
        fs::read_to_string(&file_path).map_err(|e| format!("Failed to read auth file: {}", e))?;

    let auth: StoredAuth = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse auth file: {}", e))?;

    Ok(Some(auth))
}

pub fn clear_auth_file(sessions_dir: &Path) -> Result<(), String> {
    let file_path = sessions_dir.join(AUTH_FILE_NAME);

    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("Failed to remove auth file: {}", e))?;
    }

    Ok(())
}

pub fn get_default_sessions_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    Ok(home.join(".autohand").join("sessions"))
}
```

Register in `src-tauri/src/services/mod.rs`:
```rust
pub mod auth_service;
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo test tests::services::auth_service 2>&1 | tail -15`
Expected: 3 tests PASS

**Step 5: Run all existing tests to check for regressions**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo test 2>&1 | tail -20`
Expected: All existing tests still pass

**Step 6: Commit**

```bash
git add src-tauri/src/services/auth_service.rs src-tauri/src/services/mod.rs src-tauri/src/tests/services/auth_service.rs src-tauri/src/tests/services/mod.rs
git commit -m "feat(auth): add Rust auth service for token file I/O"
```

---

### Task 5: Create Rust auth commands (Tauri commands)

**Files:**
- Create: `src-tauri/src/commands/auth_commands.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Write the auth commands**

```rust
// src-tauri/src/commands/auth_commands.rs
use crate::models::auth::{AuthUser, StoredAuth};
use crate::services::auth_service;
use tauri_plugin_store::StoreExt;

const STORE_FILE: &str = "auth-store.json";
const KEY_TOKEN: &str = "auth_token";
const KEY_USER: &str = "auth_user";

#[tauri::command]
pub async fn store_auth_token(
    app: tauri::AppHandle,
    token: String,
    user: AuthUser,
    device_id: String,
) -> Result<(), String> {
    // Store in Tauri secure store
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store
        .set(KEY_TOKEN, serde_json::json!(token))
        ;
    store
        .set(KEY_USER, serde_json::to_value(&user).map_err(|e| e.to_string())?)
        ;
    store.save().map_err(|e| e.to_string())?;

    // Also save to ~/.autohand/sessions/ for CLI sharing
    let sessions_dir = auth_service::get_default_sessions_dir()?;
    let stored = StoredAuth {
        token,
        user,
        device_id,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    auth_service::save_auth_to_file(&sessions_dir, &stored)?;

    Ok(())
}

#[tauri::command]
pub async fn get_auth_token(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let token = store.get(KEY_TOKEN);
    match token {
        Some(val) => Ok(val.as_str().map(|s| s.to_string())),
        None => {
            // Fallback: check ~/.autohand/sessions/
            let sessions_dir = auth_service::get_default_sessions_dir()?;
            let stored = auth_service::load_auth_from_file(&sessions_dir)?;
            Ok(stored.map(|s| s.token))
        }
    }
}

#[tauri::command]
pub async fn get_auth_user(app: tauri::AppHandle) -> Result<Option<AuthUser>, String> {
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    let user_val = store.get(KEY_USER);
    match user_val {
        Some(val) => {
            let user: AuthUser =
                serde_json::from_value(val.clone()).map_err(|e| e.to_string())?;
            Ok(Some(user))
        }
        None => {
            // Fallback: check ~/.autohand/sessions/
            let sessions_dir = auth_service::get_default_sessions_dir()?;
            let stored = auth_service::load_auth_from_file(&sessions_dir)?;
            Ok(stored.map(|s| s.user))
        }
    }
}

#[tauri::command]
pub async fn clear_auth_token(app: tauri::AppHandle) -> Result<(), String> {
    // Clear from Tauri store
    let store = app.store(STORE_FILE).map_err(|e| e.to_string())?;
    store.delete(KEY_TOKEN);
    store.delete(KEY_USER);
    store.save().map_err(|e| e.to_string())?;

    // Clear from ~/.autohand/sessions/
    let sessions_dir = auth_service::get_default_sessions_dir()?;
    auth_service::clear_auth_file(&sessions_dir)?;

    Ok(())
}
```

**Step 2: Register in commands/mod.rs**

Add to `src-tauri/src/commands/mod.rs`:
```rust
pub mod auth_commands;
```
And:
```rust
pub use auth_commands::*;
```

**Step 3: Register commands in lib.rs**

Add these 4 commands to the `invoke_handler` in `src-tauri/src/lib.rs`:
```rust
store_auth_token,
get_auth_token,
get_auth_user,
clear_auth_token,
```

**Step 4: Verify compilation**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo check 2>&1 | tail -10`
Expected: No errors

**Step 5: Run all tests**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo test 2>&1 | tail -20`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src-tauri/src/commands/auth_commands.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(auth): add Tauri auth commands for token storage"
```

---

### Task 6: Create AuthContext (frontend)

**Files:**
- Create: `src/contexts/auth-context.tsx`
- Test: `src/contexts/__tests__/auth-context.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/contexts/__tests__/auth-context.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from '../auth-context'

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => tauriCore)

// Mock auth-service
const mockAuthService = vi.hoisted(() => ({
  initiateDeviceAuth: vi.fn(),
  pollForAuth: vi.fn(),
  validateToken: vi.fn(),
  logoutFromApi: vi.fn(),
  AUTH_CONFIG: {
    apiBaseUrl: 'https://autohand.ai/api/auth',
    verificationBaseUrl: 'https://autohand.ai/cli-auth',
    pollInterval: 2000,
    authTimeout: 300000,
    sessionExpiryDays: 30,
  },
}))

vi.mock('@/services/auth-service', () => mockAuthService)

function TestConsumer() {
  const { status, user, login, logout, error, userCode } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user?.name ?? 'none'}</span>
      <span data-testid="error">{error ?? 'none'}</span>
      <span data-testid="userCode">{userCode ?? 'none'}</span>
      <button onClick={login}>Login</button>
      <button onClick={logout}>Logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tauriCore.invoke.mockResolvedValue(null)
  })

  it('starts in loading state then goes to unauthenticated when no token', async () => {
    tauriCore.invoke.mockResolvedValue(null)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    // Initially loading
    expect(screen.getByTestId('status').textContent).toBe('loading')

    // Then unauthenticated when no stored token
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })
  })

  it('restores session from stored token when valid', async () => {
    tauriCore.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_auth_token') return 'valid-token'
      if (cmd === 'get_auth_user') return { id: '1', email: 'a@b.com', name: 'Test User', avatar_url: null }
      return null
    })

    mockAuthService.validateToken.mockResolvedValueOnce({
      id: '1',
      email: 'a@b.com',
      name: 'Test User',
      avatar_url: null,
    })

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
      expect(screen.getByTestId('user').textContent).toBe('Test User')
    })
  })

  it('clears token and shows unauthenticated when stored token is invalid', async () => {
    tauriCore.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_auth_token') return 'invalid-token'
      return null
    })

    mockAuthService.validateToken.mockResolvedValueOnce(null)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })

    expect(tauriCore.invoke).toHaveBeenCalledWith('clear_auth_token')
  })

  it('logout clears token and returns to unauthenticated', async () => {
    tauriCore.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_auth_token') return 'valid-token'
      if (cmd === 'get_auth_user') return { id: '1', email: 'a@b.com', name: 'Test User', avatar_url: null }
      return null
    })
    mockAuthService.validateToken.mockResolvedValueOnce({
      id: '1', email: 'a@b.com', name: 'Test User', avatar_url: null,
    })

    const user = userEvent.setup()

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })

    await act(async () => {
      await user.click(screen.getByText('Logout'))
    })

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })

    expect(tauriCore.invoke).toHaveBeenCalledWith('clear_auth_token')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/contexts/__tests__/auth-context.test.tsx 2>&1 | tail -20`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// src/contexts/auth-context.tsx
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AuthUser, AuthStatus } from '@/types/auth'
import { initiateDeviceAuth, pollForAuth, validateToken, logoutFromApi, AUTH_CONFIG } from '@/services/auth-service'

interface AuthContextType {
  status: AuthStatus
  user: AuthUser | null
  token: string | null
  error: string | null
  userCode: string | null
  verificationUri: string | null
  login: () => Promise<void>
  logout: () => Promise<void>
  cancelLogin: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [userCode, setUserCode] = useState<string | null>(null)
  const [verificationUri, setVerificationUri] = useState<string | null>(null)
  const pollingRef = useRef<boolean>(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Check for existing token on mount
  useEffect(() => {
    checkExistingSession()
  }, [])

  async function checkExistingSession() {
    try {
      const storedToken = await invoke<string | null>('get_auth_token')

      if (!storedToken) {
        setStatus('unauthenticated')
        return
      }

      // Validate the token with the API
      const validUser = await validateToken(storedToken)

      if (validUser) {
        setToken(storedToken)
        setUser(validUser)
        setStatus('authenticated')
      } else {
        // Token is invalid, clear it
        await invoke('clear_auth_token')
        setStatus('unauthenticated')
      }
    } catch {
      setStatus('unauthenticated')
    }
  }

  const login = useCallback(async () => {
    try {
      setError(null)
      setStatus('polling')

      // Initiate device auth
      const authData = await initiateDeviceAuth()
      setUserCode(authData.userCode)
      setVerificationUri(authData.verificationUri)

      // Open browser
      try {
        const { open } = await import('@tauri-apps/plugin-opener')
        await open(authData.verificationUri)
      } catch {
        // If opener fails, user can manually open
      }

      // Start polling
      pollingRef.current = true
      const startTime = Date.now()

      const poll = async () => {
        if (!pollingRef.current) return

        if (Date.now() - startTime > AUTH_CONFIG.authTimeout) {
          pollingRef.current = false
          setStatus('expired')
          setUserCode(null)
          setVerificationUri(null)
          return
        }

        try {
          const result = await pollForAuth(authData.deviceCode)

          if (result.status === 'authorized' && result.token && result.user) {
            pollingRef.current = false

            // Store token
            await invoke('store_auth_token', {
              token: result.token,
              user: result.user,
              deviceId: `commander-${Date.now()}`,
            })

            setToken(result.token)
            setUser(result.user)
            setUserCode(null)
            setVerificationUri(null)
            setStatus('authenticated')
            return
          }

          if (result.status === 'expired') {
            pollingRef.current = false
            setStatus('expired')
            setUserCode(null)
            setVerificationUri(null)
            return
          }

          // Still pending, poll again
          timeoutRef.current = setTimeout(poll, AUTH_CONFIG.pollInterval)
        } catch {
          // Network error, retry
          timeoutRef.current = setTimeout(poll, AUTH_CONFIG.pollInterval)
        }
      }

      poll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start login')
      setStatus('error')
    }
  }, [])

  const cancelLogin = useCallback(() => {
    pollingRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setStatus('unauthenticated')
    setUserCode(null)
    setVerificationUri(null)
    setError(null)
  }, [])

  const logout = useCallback(async () => {
    pollingRef.current = false
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // Call API logout (best-effort)
    if (token) {
      try {
        await logoutFromApi(token)
      } catch {
        // Ignore — we clear locally regardless
      }
    }

    // Clear local storage
    await invoke('clear_auth_token')

    setToken(null)
    setUser(null)
    setStatus('unauthenticated')
    setError(null)
    setUserCode(null)
    setVerificationUri(null)
  }, [token])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingRef.current = false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        status,
        user,
        token,
        error,
        userCode,
        verificationUri,
        login,
        logout,
        cancelLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/contexts/__tests__/auth-context.test.tsx 2>&1 | tail -20`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/contexts/auth-context.tsx src/contexts/__tests__/auth-context.test.tsx
git commit -m "feat(auth): add AuthContext with device code flow login/logout"
```

---

### Task 7: Create LoginScreen component

**Files:**
- Create: `src/components/LoginScreen.tsx`
- Test: `src/components/__tests__/LoginScreen.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/components/__tests__/LoginScreen.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginScreen } from '@/components/LoginScreen'

const mockLogin = vi.fn()
const mockCancelLogin = vi.fn()
let mockAuthValues = {
  status: 'unauthenticated' as const,
  user: null,
  token: null,
  error: null,
  userCode: null,
  verificationUri: null,
  login: mockLogin,
  logout: vi.fn(),
  cancelLogin: mockCancelLogin,
}

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockAuthValues,
}))

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuthValues = {
      status: 'unauthenticated',
      user: null,
      token: null,
      error: null,
      userCode: null,
      verificationUri: null,
      login: mockLogin,
      logout: vi.fn(),
      cancelLogin: mockCancelLogin,
    }
  })

  it('renders sign in button in unauthenticated state', () => {
    render(<LoginScreen />)
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByText(/commander/i)).toBeInTheDocument()
  })

  it('calls login when sign in is clicked', async () => {
    const user = userEvent.setup()
    render(<LoginScreen />)

    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(mockLogin).toHaveBeenCalledTimes(1)
  })

  it('shows user code and waiting message during polling', () => {
    mockAuthValues.status = 'polling'
    mockAuthValues.userCode = 'ABCD-1234'
    mockAuthValues.verificationUri = 'https://autohand.ai/cli-auth?code=ABCD-1234'

    render(<LoginScreen />)

    expect(screen.getByText('ABCD-1234')).toBeInTheDocument()
    expect(screen.getByText(/waiting for authorization/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows expired state with try again button', () => {
    mockAuthValues.status = 'expired'

    render(<LoginScreen />)

    expect(screen.getByText(/session expired/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('shows error state with try again button', () => {
    mockAuthValues.status = 'error'
    mockAuthValues.error = 'Network error'

    render(<LoginScreen />)

    expect(screen.getByText('Network error')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('calls cancelLogin when cancel is clicked during polling', async () => {
    mockAuthValues.status = 'polling'
    mockAuthValues.userCode = 'ABCD-1234'

    const user = userEvent.setup()
    render(<LoginScreen />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(mockCancelLogin).toHaveBeenCalledTimes(1)
  })

  it('shows loading spinner in loading state', () => {
    mockAuthValues.status = 'loading'

    render(<LoginScreen />)

    // Should show some loading indicator
    expect(screen.getByTestId('auth-loading')).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/components/__tests__/LoginScreen.test.tsx 2>&1 | tail -20`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// src/components/LoginScreen.tsx
import { useAuth } from '@/contexts/auth-context'
import { Loader2, ExternalLink, Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

export function LoginScreen() {
  const { status, error, userCode, verificationUri, login, cancelLogin } = useAuth()
  const [copied, setCopied] = useState(false)

  const handleCopyCode = async () => {
    if (!userCode) return
    try {
      await navigator.clipboard.writeText(userCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available
    }
  }

  const handleOpenBrowser = async () => {
    if (!verificationUri) return
    try {
      const { open } = await import('@tauri-apps/plugin-opener')
      await open(verificationUri)
    } catch {
      // Fallback — user can open manually
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-background" data-testid="auth-loading">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
        {/* Logo area */}
        <div className="flex flex-col items-center gap-3">
          <div className="text-4xl font-bold tracking-tight">Commander</div>
          <p className="text-sm text-muted-foreground text-center">
            Your AI-powered development partner
          </p>
        </div>

        {/* Unauthenticated — show sign in */}
        {status === 'unauthenticated' && (
          <Button onClick={login} size="lg" className="w-full max-w-[240px]">
            Sign In
          </Button>
        )}

        {/* Polling — show code and waiting */}
        {status === 'polling' && (
          <div className="flex flex-col items-center gap-4 w-full">
            <p className="text-sm text-muted-foreground">Waiting for authorization...</p>

            {userCode && (
              <div className="flex flex-col items-center gap-2">
                <p className="text-xs text-muted-foreground">Your code:</p>
                <div className="flex items-center gap-2">
                  <code className="text-2xl font-mono font-bold tracking-widest bg-muted px-4 py-2 rounded-lg">
                    {userCode}
                  </code>
                  <Button variant="ghost" size="sm" onClick={handleCopyCode} title="Copy code">
                    <Copy className="h-4 w-4" />
                    {copied && <span className="text-xs ml-1">Copied</span>}
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              A browser window should have opened. Sign in to continue.
            </p>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleOpenBrowser}>
                <ExternalLink className="h-4 w-4 mr-1" />
                Open Again
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelLogin}>
                Cancel
              </Button>
            </div>

            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Expired */}
        {status === 'expired' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">Session expired</p>
            <Button onClick={login} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Try Again
            </Button>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={login} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Try Again
            </Button>
          </div>
        )}

        {/* Version */}
        <p className="text-xs text-muted-foreground mt-4">
          v0.1.0
        </p>
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/components/__tests__/LoginScreen.test.tsx 2>&1 | tail -20`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/components/LoginScreen.tsx src/components/__tests__/LoginScreen.test.tsx
git commit -m "feat(auth): add LoginScreen component with all auth states"
```

---

### Task 8: Integrate AuthProvider into App.tsx and gate access

**Files:**
- Modify: `src/App.tsx`
- Test: `src/components/__tests__/App.authGate.test.tsx`

**Step 1: Write the failing test**

```typescript
// src/components/__tests__/App.authGate.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => tauriCore)
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }))

// Mock auth service
vi.mock('@/services/auth-service', () => ({
  initiateDeviceAuth: vi.fn(),
  pollForAuth: vi.fn(),
  validateToken: vi.fn().mockResolvedValue(null),
  logoutFromApi: vi.fn(),
  AUTH_CONFIG: {
    apiBaseUrl: 'https://autohand.ai/api/auth',
    verificationBaseUrl: 'https://autohand.ai/cli-auth',
    pollInterval: 2000,
    authTimeout: 300000,
    sessionExpiryDays: 30,
  },
}))

vi.mock('@/components/ChatInterface', () => ({ ChatInterface: () => <div data-testid="chat-interface" /> }))
vi.mock('@/components/CodeView', () => ({ CodeView: () => <div data-testid="code-view" /> }))
vi.mock('@/components/HistoryView', () => ({ HistoryView: () => <div data-testid="history-view" /> }))
vi.mock('@/components/AIAgentStatusBar', () => ({ AIAgentStatusBar: () => <div data-testid="status-bar" /> }))

import App from '@/App'

describe('App auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows login screen when no token is stored', async () => {
    tauriCore.invoke.mockResolvedValue(null)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })

    // Main app content should NOT be visible
    expect(screen.queryByText(/welcome to commander/i)).not.toBeInTheDocument()
  })

  it('shows main app when authenticated', async () => {
    const mockUser = { id: '1', email: 'test@test.com', name: 'Test User', avatar_url: null }

    tauriCore.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'get_auth_token') return 'valid-tok'
      if (cmd === 'get_auth_user') return mockUser
      if (cmd === 'load_app_settings') return { show_console_output: true, projects_folder: '', file_mentions_enabled: true, code_settings: { theme: 'github', font_size: 14, auto_collapse_sidebar: false } }
      if (cmd === 'list_recent_projects') return []
      if (cmd === 'get_user_home_directory') return '/home/test'
      return null
    })

    const { validateToken } = await import('@/services/auth-service')
    ;(validateToken as any).mockResolvedValueOnce(mockUser)

    render(<App />)

    await waitFor(() => {
      expect(screen.getByText(/welcome to commander/i)).toBeInTheDocument()
    })

    // Login screen should NOT be visible
    expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/components/__tests__/App.authGate.test.tsx 2>&1 | tail -20`
Expected: FAIL — AuthProvider not wrapping App yet

**Step 3: Modify App.tsx**

In `src/App.tsx`, add imports at the top:
```typescript
import { AuthProvider, useAuth } from "@/contexts/auth-context"
import { LoginScreen } from "@/components/LoginScreen"
```

Replace the `App()` function at the bottom (lines 623-633) with:
```typescript
function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <SettingsProvider>
          <AuthGate />
        </SettingsProvider>
      </AuthProvider>
    </ToastProvider>
  )
}

function AuthGate() {
  const { status } = useAuth()

  if (status === 'loading' || status === 'unauthenticated' || status === 'polling' || status === 'expired' || status === 'error') {
    return <LoginScreen />
  }

  return <AppContent />
}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run src/components/__tests__/App.authGate.test.tsx 2>&1 | tail -20`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/App.tsx src/components/__tests__/App.authGate.test.tsx
git commit -m "feat(auth): gate app behind AuthProvider and LoginScreen"
```

---

### Task 9: Replace hardcoded user data in sidebar and NavUser

**Files:**
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/components/NavUser.tsx`

**Step 1: Modify app-sidebar.tsx**

In `src/components/app-sidebar.tsx`:

1. Remove the hardcoded `userData` const (lines 23-28)
2. Add import: `import { useAuth } from "@/contexts/auth-context"`
3. Inside `AppSidebar` function, add: `const { user } = useAuth()`
4. Replace `user={userData}` in the NavUser props with:
   ```typescript
   user={{
     name: user?.name ?? 'User',
     email: user?.email ?? '',
     avatar: user?.avatar_url ?? '',
   }}
   ```

**Step 2: Add logout to NavUser.tsx**

In `src/components/NavUser.tsx`:

1. Add import: `import { useAuth } from "@/contexts/auth-context"`
2. Inside `NavUser` function, add: `const { logout } = useAuth()`
3. Replace the existing Logout `DropdownMenuItem` (line 130-133) with:
   ```tsx
   <DropdownMenuItem onClick={logout}>
     <LogOut />
     Sign Out
   </DropdownMenuItem>
   ```

**Step 3: Verify typecheck**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun run tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Run all frontend tests to check for regressions**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run 2>&1 | tail -30`
Expected: All tests pass (some existing tests may need mock updates for useAuth — fix any that break)

**Step 5: Commit**

```bash
git add src/components/app-sidebar.tsx src/components/NavUser.tsx
git commit -m "feat(auth): replace hardcoded user data with auth context"
```

---

### Task 10: Fix any broken existing tests

After integrating AuthProvider into App.tsx, some existing tests that render `<App />` or components that now use `useAuth()` may break because they don't mock the auth context.

**Files:**
- Modify: Any failing test files (likely in `src/components/__tests__/`)

**Step 1: Run all frontend tests**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run 2>&1 | tail -50`

**Step 2: For each failing test, add auth mocks**

Tests that render `<App />` need these mocks added:

```typescript
// Add auth-service mock
vi.mock('@/services/auth-service', () => ({
  initiateDeviceAuth: vi.fn(),
  pollForAuth: vi.fn(),
  validateToken: vi.fn().mockResolvedValue({
    id: '1', email: 'test@test.com', name: 'Test User', avatar_url: null,
  }),
  logoutFromApi: vi.fn(),
  AUTH_CONFIG: {
    apiBaseUrl: 'https://autohand.ai/api/auth',
    verificationBaseUrl: 'https://autohand.ai/cli-auth',
    pollInterval: 2000,
    authTimeout: 300000,
    sessionExpiryDays: 30,
  },
}))
```

And update the `tauriCore.invoke` mock to handle auth commands:
```typescript
tauriCore.invoke.mockImplementation(async (cmd: string) => {
  if (cmd === 'get_auth_token') return 'valid-token'
  if (cmd === 'get_auth_user') return { id: '1', email: 'test@test.com', name: 'Test User', avatar_url: null }
  // ... existing mocks
})
```

Tests that use `NavUser` or `AppSidebar` may need `useAuth` mocked:
```typescript
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    user: { id: '1', email: 'test@test.com', name: 'Test User', avatar_url: null },
    logout: vi.fn(),
    status: 'authenticated',
    token: 'tok',
    error: null,
    userCode: null,
    verificationUri: null,
    login: vi.fn(),
    cancelLogin: vi.fn(),
  }),
}))
```

**Step 3: Fix each failing test until all pass**

Run after each fix: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run 2>&1 | tail -30`

**Step 4: Run typecheck**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun run tsc --noEmit --pretty 2>&1 | head -20`

**Step 5: Run Rust tests too**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo test 2>&1 | tail -20`

**Step 6: Commit**

```bash
git add -A
git commit -m "fix(tests): update existing tests with auth context mocks"
```

---

### Task 11: Final verification

**Step 1: Run full frontend test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun vitest run 2>&1 | tail -30`
Expected: ALL tests pass

**Step 2: Run full Rust test suite**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo test 2>&1 | tail -20`
Expected: ALL tests pass

**Step 3: Run typecheck**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee && bun run tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

**Step 4: Verify cargo check**

Run: `cd /Users/igorcosta/Documents/autohand/new/commander/.claude/worktrees/atomic-wishing-bee/src-tauri && cargo check 2>&1 | tail -10`
Expected: No errors

**Step 5: Final commit if any remaining changes**

```bash
git add -A
git commit -m "feat(auth): complete login system implementation"
```
