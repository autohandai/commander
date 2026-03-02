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
  verificationUriComplete: string
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
