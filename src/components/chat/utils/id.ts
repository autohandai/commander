export const generateId = (prefix: string) => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`
    }
  } catch {
    // Fall through to timestamp fallback
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

