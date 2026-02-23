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

      const validUser = await validateToken(storedToken)

      if (validUser) {
        setToken(storedToken)
        setUser(validUser)
        setStatus('authenticated')
      } else {
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

      const authData = await initiateDeviceAuth()
      setUserCode(authData.userCode)
      setVerificationUri(authData.verificationUri)

      try {
        const { openUrl } = await import('@tauri-apps/plugin-opener')
        await openUrl(authData.verificationUri)
      } catch {
        // If opener fails, user can manually open
      }

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

          timeoutRef.current = setTimeout(poll, AUTH_CONFIG.pollInterval)
        } catch {
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

    if (token) {
      try {
        await logoutFromApi(token)
      } catch {
        // Ignore
      }
    }

    await invoke('clear_auth_token')

    setToken(null)
    setUser(null)
    setStatus('unauthenticated')
    setError(null)
    setUserCode(null)
    setVerificationUri(null)
  }, [token])

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
      value={{ status, user, token, error, userCode, verificationUri, login, logout, cancelLogin }}
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
