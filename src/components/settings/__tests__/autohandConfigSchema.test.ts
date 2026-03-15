import { describe, expect, it } from 'vitest'
import { parseAutohandConfig, validateAutohandConfigUpdate } from '@/lib/autohand-config-schema'

describe('autohand config schema', () => {
  it('normalizes invalid input', () => {
    const parsed = parseAutohandConfig({
      protocol: 'invalid-protocol',
      provider: '',
      permissions_mode: 'invalid-mode',
      permissions: {
        mode: 'restricted',
        whitelist: ['read_file', 42, null],
        blacklist: ['rm'],
        rules: ['safe-only'],
        rememberSession: true,
      },
      agent: {
        max_iterations: -10,
        enable_request_queue: true,
      },
      network: {
        timeout: -1,
        max_retries: -2,
        retry_delay: 0,
      },
    })

    expect(parsed.protocol).toBe('rpc')
    expect(parsed.provider).toBe('anthropic')
    expect(parsed.permissions_mode).toBe('interactive')
    expect(parsed.permissions?.whitelist).toEqual(['read_file'])
    expect(parsed.permissions?.remember_session).toBe(true)
    expect(parsed.agent?.max_iterations).toBe(10)
    expect(parsed.network?.timeout).toBe(30000)
    expect(parsed.network?.max_retries).toBe(3)
    expect(parsed.network?.retry_delay).toBe(1000)
  })

  it('rejects invalid save payload', () => {
    const validation = validateAutohandConfigUpdate({
      provider: '',
      agent: { max_iterations: 0, enable_request_queue: false },
    })

    expect(validation.success).toBe(false)
  })
})
