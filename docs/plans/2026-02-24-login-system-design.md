# Login System Design for Commander Desktop App

## Summary

Add authentication to Commander using the existing Autohand device code flow. Users must sign in before accessing the app. The app opens the system browser for authentication and polls for completion.

## Approach

**Device Code Flow** (same as CLI):
1. App calls `POST /api/auth/cli/initiate` to get a device code
2. Opens system browser to `autohand.ai/cli-auth?code=XXXX`
3. Polls `POST /api/auth/cli/poll` every 2 seconds
4. On authorization, stores token and transitions to main app

No API changes required. Uses existing, proven endpoints.

## Architecture

```
Commander App                     Browser                    API
    │                               │                         │
    │── POST /cli/initiate ────────────────────────────────►  │
    │◄── { deviceCode, userCode } ──────────────────────────  │
    │                               │                         │
    │── open browser ──────────────►│                         │
    │                               │── user logs in ────────►│
    │                               │◄── authorized ──────────│
    │                               │                         │
    │── POST /cli/poll ────────────────────────────────────►  │
    │◄── { token, user } ──────────────────────────────────   │
    │                               │                         │
    │── Store token (Tauri store + ~/.autohand/) ──           │
    │── Render main app ──                                    │
```

## Auth State Machine

```
[No Token] → LoginScreen → "Sign In" clicked
                                │
                          initiateDeviceAuth()
                                │
                          [Polling] → show code + "Waiting..."
                                │         │
                                │    (timeout 5min)
                                │         → [Expired] → "Try Again"
                                │
                          (authorized)
                                │
                          Store token + user
                                │
                          [Authenticated] → MainApp
                                │
                          (logout or expired)
                                │
                          [No Token] → LoginScreen
```

## UI States

| State | Display |
|-------|---------|
| Initial | Logo + tagline + "Sign In" button |
| Polling | User code + spinner + "Open Again" + "Cancel" |
| Expired | "Session expired" + "Try Again" |
| Error | Error message + "Try Again" |
| Success | "Welcome, {name}!" → transition to main app |

## New Files

### Frontend
- `src/contexts/auth-context.tsx` - AuthProvider + useAuth hook
- `src/components/LoginScreen.tsx` - Login gate UI
- `src/services/auth-service.ts` - API calls for device auth
- `src/types/auth.ts` - User, AuthState types

### Backend (Tauri/Rust)
- `src-tauri/src/commands/auth_commands.rs` - Token CRUD commands
- `src-tauri/src/models/auth.rs` - AuthUser, AuthToken structs
- `src-tauri/src/services/auth_service.rs` - Token file I/O

## Modified Files

- `App.tsx` - Wrap with AuthProvider, gate on isAuthenticated
- `app-sidebar.tsx` - Replace hardcoded userData with useAuth().user
- `NavUser.tsx` - Add "Sign Out" option
- `src-tauri/src/lib.rs` - Register auth commands
- `src-tauri/Cargo.toml` - Ensure tauri-plugin-store dependency

## Token Storage

**Primary:** Tauri plugin-store (encrypted, OS-native)
- `auth_token` → session token string
- `auth_user` → serialized user object

**Secondary:** `~/.autohand/sessions/commander.json`
- Shared with CLI for cross-tool SSO

## Startup Flow

1. AuthProvider mounts
2. Check Tauri store for existing token
3. If found → validate via `GET /api/auth/me`
   - Valid → authenticated, render MainApp
   - Invalid → clear, show LoginScreen
4. If not found → show LoginScreen

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Network error during poll | "Connection error, retrying..." |
| 5-minute timeout | "Session expired" + "Try Again" |
| Token validation fails | Clear token, show login |
| Rate limited (429) | Back off to 5s polling |

## API Endpoints Used

- `POST /api/auth/cli/initiate` - Start device auth
- `POST /api/auth/cli/poll` - Poll for completion
- `GET /api/auth/me` - Validate token / get user
- `POST /api/auth/logout` - Invalidate session

## Constants

```typescript
AUTH_CONFIG = {
  apiBaseUrl: "https://autohand.ai/api/auth",
  verificationBaseUrl: "https://autohand.ai/cli-auth",
  pollInterval: 2000,      // 2 seconds
  authTimeout: 300000,     // 5 minutes
  sessionExpiryDays: 30,
}
```
