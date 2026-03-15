import { z } from 'zod'

const PROTOCOLS = ['rpc', 'acp'] as const
const PERMISSION_MODES = ['interactive', 'auto', 'restricted'] as const
const HOOK_EVENTS = [
  'session-start',
  'session-end',
  'pre-tool',
  'post-tool',
  'file-modified',
  'pre-prompt',
  'post-response',
  'subagent-stop',
  'permission-request',
  'notification',
  'session-error',
  'automode-start',
  'automode-stop',
  'automode-error',
] as const

const asTrimmedString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const sanitizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

const parseObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

const loadProviderDetailsSchema = z
  .object({
    api_key: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
    base_url: z.string().trim().min(1).optional(),
  })
  .strict()

const strictProviderDetailsSchema = loadProviderDetailsSchema

const loadPermissionsSchema = z
  .object({
    mode: z.enum(PERMISSION_MODES).catch('interactive'),
    whitelist: z.preprocess(sanitizeStringArray, z.array(z.string())),
    blacklist: z.preprocess(sanitizeStringArray, z.array(z.string())),
    rules: z.preprocess(sanitizeStringArray, z.array(z.string())),
    remember_session: z.coerce.boolean().catch(false),
  })
  .strict()

const strictPermissionsSchema = z
  .object({
    mode: z.enum(PERMISSION_MODES),
    whitelist: z.array(z.string()),
    blacklist: z.array(z.string()),
    rules: z.array(z.string()),
    remember_session: z.boolean(),
  })
  .strict()

const loadAgentSchema = z
  .object({
    max_iterations: z.coerce.number().int().min(1).catch(10),
    enable_request_queue: z.coerce.boolean().catch(false),
  })
  .strict()

const strictAgentSchema = z
  .object({
    max_iterations: z.number().int().min(1),
    enable_request_queue: z.boolean(),
  })
  .strict()

const loadNetworkSchema = z
  .object({
    timeout: z.coerce.number().int().min(1).catch(30000),
    max_retries: z.coerce.number().int().min(0).catch(3),
    retry_delay: z.coerce.number().int().min(1).catch(1000),
  })
  .strict()

const strictNetworkSchema = z
  .object({
    timeout: z.number().int().min(1),
    max_retries: z.number().int().min(0),
    retry_delay: z.number().int().min(1),
  })
  .strict()

const loadMcpServerSchema = z
  .object({
    name: z.string().trim().min(1),
    transport: z.string().trim().min(1).catch('stdio'),
    command: z.string().trim().min(1).optional(),
    args: z.preprocess(sanitizeStringArray, z.array(z.string())),
    url: z.string().trim().min(1).optional(),
    env: z.record(z.string(), z.string()).catch({}),
    source: z.string().trim().min(1).optional(),
    auto_connect: z.coerce.boolean().catch(true),
  })
  .strict()

const strictMcpServerSchema = z
  .object({
    name: z.string().trim().min(1),
    transport: z.string().trim().min(1),
    command: z.string().trim().min(1).optional(),
    args: z.array(z.string()),
    url: z.string().trim().min(1).optional(),
    env: z.record(z.string(), z.string()),
    source: z.string().trim().min(1).optional(),
    auto_connect: z.boolean(),
  })
  .strict()

const loadHookSchema = z
  .object({
    id: z.string().trim().min(1),
    event: z.enum(HOOK_EVENTS),
    command: z.string().trim().min(1),
    pattern: z.string().trim().min(1).optional(),
    enabled: z.coerce.boolean().catch(true),
    description: z.string().trim().min(1).optional(),
  })
  .strict()

const strictHookSchema = z
  .object({
    id: z.string().trim().min(1),
    event: z.enum(HOOK_EVENTS),
    command: z.string().trim().min(1),
    pattern: z.string().trim().min(1).optional(),
    enabled: z.boolean(),
    description: z.string().trim().min(1).optional(),
  })
  .strict()

const loadAutohandConfigSchema = z
  .object({
    protocol: z.enum(PROTOCOLS).catch('rpc'),
    provider: z.string().trim().min(1).catch('anthropic'),
    model: z.string().trim().min(1).optional(),
    permissions_mode: z.enum(PERMISSION_MODES).catch('interactive'),
    hooks: z.array(z.unknown()).catch([]),
    provider_details: loadProviderDetailsSchema.optional(),
    permissions: loadPermissionsSchema.optional(),
    agent: loadAgentSchema.optional(),
    network: loadNetworkSchema.optional(),
  })
  .strict()

const strictAutohandConfigSchema = z
  .object({
    protocol: z.enum(PROTOCOLS),
    provider: z.string().trim().min(1),
    model: z.string().trim().min(1).optional(),
    permissions_mode: z.enum(PERMISSION_MODES),
    hooks: z.array(z.unknown()),
    provider_details: strictProviderDetailsSchema.optional(),
    permissions: strictPermissionsSchema.optional(),
    agent: strictAgentSchema.optional(),
    network: strictNetworkSchema.optional(),
  })
  .strict()

export type ProviderDetails = z.infer<typeof strictProviderDetailsSchema>
export type PermissionsConfig = z.infer<typeof strictPermissionsSchema>
export type AgentBehaviorConfig = z.infer<typeof strictAgentSchema>
export type NetworkConfig = z.infer<typeof strictNetworkSchema>
export type McpServerConfig = z.infer<typeof strictMcpServerSchema>
export type HookDefinition = z.infer<typeof strictHookSchema>
export type AutohandConfig = z.infer<typeof strictAutohandConfigSchema>

const normalizeProviderDetailsInput = (value: unknown): unknown => {
  const raw = parseObject(value)
  const apiKey = asTrimmedString(raw.api_key ?? raw.apiKey)
  const model = asTrimmedString(raw.model)
  const baseUrl = asTrimmedString(raw.base_url ?? raw.baseUrl)
  if (!apiKey && !model && !baseUrl) return undefined
  return {
    api_key: apiKey,
    model,
    base_url: baseUrl,
  }
}

const normalizePermissionsInput = (value: unknown): unknown => {
  const raw = parseObject(value)
  if (Object.keys(raw).length === 0) return undefined
  return {
    mode: raw.mode,
    whitelist: raw.whitelist,
    blacklist: raw.blacklist,
    rules: raw.rules,
    remember_session: raw.remember_session ?? raw.rememberSession ?? false,
  }
}

const normalizeAgentInput = (value: unknown): unknown => {
  const raw = parseObject(value)
  if (Object.keys(raw).length === 0) return undefined
  return {
    max_iterations: raw.max_iterations,
    enable_request_queue: raw.enable_request_queue,
  }
}

const normalizeNetworkInput = (value: unknown): unknown => {
  const raw = parseObject(value)
  if (Object.keys(raw).length === 0) return undefined
  return {
    timeout: raw.timeout,
    max_retries: raw.max_retries,
    retry_delay: raw.retry_delay,
  }
}

const normalizeAutohandConfigInput = (value: unknown): Record<string, unknown> => {
  const raw = parseObject(value)
  return {
    protocol: raw.protocol,
    provider: raw.provider,
    model: raw.model,
    permissions_mode: raw.permissions_mode,
    hooks: raw.hooks,
    provider_details: normalizeProviderDetailsInput(raw.provider_details),
    permissions: normalizePermissionsInput(raw.permissions),
    agent: normalizeAgentInput(raw.agent),
    network: normalizeNetworkInput(raw.network),
  }
}

const normalizeMcpServerInput = (value: unknown): Record<string, unknown> => {
  const raw = parseObject(value)
  return {
    name: raw.name,
    transport: raw.transport,
    command: asTrimmedString(raw.command),
    args: raw.args,
    url: asTrimmedString(raw.url),
    env: parseObject(raw.env),
    source: asTrimmedString(raw.source),
    auto_connect: raw.auto_connect,
  }
}

const normalizeHookInput = (value: unknown): Record<string, unknown> => {
  const raw = parseObject(value)
  return {
    id: raw.id,
    event: raw.event,
    command: raw.command,
    pattern: asTrimmedString(raw.pattern),
    enabled: raw.enabled,
    description: asTrimmedString(raw.description),
  }
}

export function parseAutohandConfig(value: unknown): AutohandConfig {
  const normalized = normalizeAutohandConfigInput(value)
  const parsed = loadAutohandConfigSchema.parse(normalized)
  return strictAutohandConfigSchema.parse(parsed)
}

export function validateAutohandConfigUpdate(value: unknown):
  | { success: true; data: AutohandConfig }
  | { success: false; error: string } {
  const normalized = normalizeAutohandConfigInput(value)
  const parsed = strictAutohandConfigSchema.safeParse(normalized)
  if (parsed.success) {
    return { success: true, data: parsed.data }
  }
  return {
    success: false,
    error: parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; '),
  }
}

export function parseAutohandMcpServers(value: unknown): McpServerConfig[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => loadMcpServerSchema.safeParse(normalizeMcpServerInput(item)))
    .filter((parsed): parsed is { success: true; data: McpServerConfig } => parsed.success)
    .map((parsed) => parsed.data)
}

export function validateAutohandMcpServer(value: unknown):
  | { success: true; data: McpServerConfig }
  | { success: false; error: string } {
  const parsed = strictMcpServerSchema.safeParse(normalizeMcpServerInput(value))
  if (parsed.success) {
    return { success: true, data: parsed.data }
  }
  return {
    success: false,
    error: parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; '),
  }
}

export function parseAutohandHooks(value: unknown): HookDefinition[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => loadHookSchema.safeParse(normalizeHookInput(item)))
    .filter((parsed): parsed is { success: true; data: HookDefinition } => parsed.success)
    .map((parsed) => parsed.data)
}

export function validateAutohandHook(value: unknown):
  | { success: true; data: HookDefinition }
  | { success: false; error: string } {
  const parsed = strictHookSchema.safeParse(normalizeHookInput(value))
  if (parsed.success) {
    return { success: true, data: parsed.data }
  }
  return {
    success: false,
    error: parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; '),
  }
}
