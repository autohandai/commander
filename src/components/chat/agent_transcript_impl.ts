export interface ParsedAgentOutput {
  header?: { agent?: string; command?: string }
  providerLine?: string
  meta?: Record<string, string>
  userInstructions?: string
  thinking?: string
  answer?: string
  tokensUsed?: number
  success?: boolean
  working?: string[]
}

// Best-effort parser for CLI agent transcripts
export function parseAgentTranscript(raw: string): ParsedAgentOutput | null {
  if (!raw || !raw.includes('--------')) {
    // Fast reject to avoid parsing arbitrary outputs
    return null
  }

  const lines = raw.split(/\r?\n/)
  const out: ParsedAgentOutput = {}

  // Header: "Agent: codex | Command: how are you?"
  const headerLine = lines.find((l) => /^Agent:\s*/i.test(l))
  if (headerLine) {
    const m = headerLine.match(/Agent:\s*([^|]+)\|\s*Command:\s*(.*)$/i)
    if (m) out.header = { agent: m[1].trim(), command: m[2].trim() }
  }

  // Provider/version line like: "[timestamp] OpenAI Codex v..."
  const providerLine = lines.find((l) => /Codex|OpenAI|Gemini|Claude/i.test(l) && /\[\d{4}-\d{2}-\d{2}T/.test(l))
  if (providerLine) out.providerLine = providerLine.replace(/^\[[^\]]+\]\s*/, '').trim()

  // Meta block between -------- separators
  const sepIdxs = lines.reduce<number[]>((acc, l, i) => {
    if (/^-{3,}$/.test(l.trim())) acc.push(i)
    return acc
  }, [])
  if (sepIdxs.length >= 2) {
    const metaLines = lines.slice(sepIdxs[0] + 1, sepIdxs[1])
    const meta: Record<string, string> = {}
    metaLines.forEach((l) => {
      const m = l.match(/^([^:]+):\s*(.*)$/)
      if (m) meta[m[1].trim()] = m[2].trim()
    })
    if (Object.keys(meta).length) out.meta = meta
  }

  // User instructions block
  const userIdx = lines.findIndex((l) => /User instructions:/i.test(l))
  if (userIdx >= 0) {
    // Collect until next bracketed timestamp or end
    const buf: string[] = []
    for (let i = userIdx + 1; i < lines.length; i++) {
      const l = lines[i]
      if (/^\[\d{4}-\d{2}-\d{2}T/.test(l)) break
      if (/^-{3,}$/.test(l)) break
      buf.push(l)
    }
    out.userInstructions = buf.join('\n').trim()
  }

  // Thinking block (starts at a line that ends with 'thinking')
  const thinkIdx = lines.findIndex((l) => /\bthinking\s*$/i.test(l))
  if (thinkIdx >= 0) {
    const buf: string[] = []
    for (let i = thinkIdx + 1; i < lines.length; i++) {
      const l = lines[i]
      if (/^\[\d{4}-\d{2}-\d{2}T/.test(l)) break
      if (/^✅|^❌|tokens used:/i.test(l)) break
      buf.push(l)
    }
    out.thinking = buf.join('\n').trim()
  }

  // Assistant answer block: line like "[timestamp] codex" then content
  const answerHdr = lines.findIndex((l) => /\]\s*(codex|claude|gemini)\s*$/i.test(l))
  if (answerHdr >= 0) {
    const buf: string[] = []
    for (let i = answerHdr + 1; i < lines.length; i++) {
      const l = lines[i]
      if (/^\[\d{4}-\d{2}-\d{2}T/.test(l)) break
      if (/^✅|^❌|tokens used:/i.test(l)) break
      buf.push(l)
    }
    out.answer = buf.join('\n').trim()
  }

  // Working section: header line "Working" followed by bullets (• or -) or created lines
  const workingIdx = lines.findIndex((l) => /^\s*Working\s*$/i.test(l))
  if (workingIdx >= 0) {
    const items: string[] = []
    for (let i = workingIdx + 1; i < lines.length; i++) {
      const l = lines[i]
      if (!l.trim()) continue
      if (/^\[\d{4}-\d{2}-\d{2}T/.test(l)) break
      if (/^-{3,}$/.test(l)) break
      if (/^\s*Thinking\s*$/i.test(l)) break
      // Strip timeline guides like "|" or leading bullets
      const norm = l
        .replace(/^\s*[|│]+\s*/g, '')
        .replace(/^\s*[•\-]\s*/, '')
        .trim()
      if (!norm) continue
      items.push(norm)
    }
    // de-duplicate consecutive duplicates to avoid spam
    const dedup: string[] = []
    for (const it of items) {
      if (dedup[dedup.length - 1] !== it) dedup.push(it)
    }
    if (dedup.length) out.working = dedup
  }

  // Fallback: try to infer a Working block between meta and first section even without explicit header
  if (!out.working || out.working.length === 0) {
    // Determine the region to scan right after meta separator
    const sepIdxs2 = lines.reduce<number[]>((acc, l, i) => { if (/^-{3,}$/.test(l.trim())) acc.push(i); return acc }, [])
    const start = sepIdxs2.length >= 2 ? sepIdxs2[1] + 1 : 0
    const stops = [
      lines.findIndex((l) => /User instructions:/i.test(l)),
      lines.findIndex((l) => /\bthinking\s*$/i.test(l)),
      lines.findIndex((l) => /\]\s*(codex|claude|gemini)\s*$/i.test(l)),
    ].filter((i) => i >= 0)
    const end = stops.length ? Math.min(...stops) : lines.length
    const items: string[] = []
    for (let i = start; i < end; i++) {
      const l = lines[i]
      if (/^\s*[•\-]|^\s*[|│]/.test(l)) {
        const norm = l.replace(/^\s*[|│]+\s*/g, '').replace(/^\s*[•\-]\s*/, '').trim()
        if (norm) items.push(norm)
      }
    }
    if (items.length) {
      const dedup: string[] = []
      for (const it of items) if (dedup[dedup.length - 1] !== it) dedup.push(it)
      if (dedup.length) out.working = dedup
    }
  }

  // Tokens used
  const tokensLine = lines.find((l) => /tokens used:/i.test(l))
  if (tokensLine) {
    const m = tokensLine.match(/tokens used:\s*(\d+)/i)
    if (m) out.tokensUsed = parseInt(m[1], 10)
  }

  // Success
  out.success = /\s*/i.test(raw)

  // If we didn't find anything structured beyond meta, bail out
  if (!out.header && !out.meta && !out.answer && !out.thinking && !out.tokensUsed) return null
  return out
}
