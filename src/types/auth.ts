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
