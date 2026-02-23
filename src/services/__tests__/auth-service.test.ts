import { describe, it, expect, vi, beforeEach } from 'vitest'

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
