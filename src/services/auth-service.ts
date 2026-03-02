import type { DeviceAuthResponse, PollResponse, AuthUser } from '@/types/auth'

export const AUTH_CONFIG = {
  apiBaseUrl: 'https://autohand.ai/api/auth',
  pollInterval: 2000,
  authTimeout: 300000,
} as const

export async function initiateDeviceAuth(): Promise<DeviceAuthResponse> {
  const res = await fetch(`${AUTH_CONFIG.apiBaseUrl}/cli/initiate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: 'autohand-commander' }),
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
