import { useRef, useEffect, useState } from 'react'
import * as d3 from 'd3'
import { readAgentColor } from '@/lib/dashboard-palettes'
import { useChartTooltip } from '@/hooks/useChartTooltip'

interface DailyActivity {
  date: string
  message_count: number
  token_count: number
}

export interface KnowledgeBaseChartProps {
  dailyActivity: DailyActivity[]
  agentsUsed: Record<string, number>
  paletteKey?: string
  selectedAgent?: string | null
  onAgentClick?: (agent: string) => void
}

interface GraphNode extends d3.SimulationNodeDatum {
  id: string
  date: string
  messages: number
  tokens: number
  agent: string
  color: string
  radius: number
  activity: number
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  strength: number
}

const KNOWN_AGENTS = ['claude', 'codex', 'gemini', 'ollama', 'autohand'] as const

function readCssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim()
  return value || fallback
}

function getPalette(agentNames: string[]) {
  if (typeof window === 'undefined') {
    const agents: Record<string, string> = {}
    for (const name of agentNames) agents[name] = readAgentColor(name)
    return { axis: '#6b7280', grid: 'rgba(148,163,184,0.25)', mutedDot: 'rgba(148,163,184,0.25)', agents }
  }
  const style = getComputedStyle(document.documentElement)
  const agents: Record<string, string> = {}
  for (const name of agentNames) agents[name] = readAgentColor(name)
  return {
    axis: readCssVar(style, '--dashboard-axis', '#6b7280'),
    grid: readCssVar(style, '--dashboard-grid', 'rgba(148,163,184,0.25)'),
    mutedDot: readCssVar(style, '--dashboard-dot-muted', 'rgba(148,163,184,0.25)'),
    agents,
  }
}

/** Seeded pseudo-random for deterministic layout */
function seededRandom(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return () => {
    h = (h * 16807 + 0) % 2147483647
    return (h & 0x7fffffff) / 2147483647
  }
}

export function KnowledgeBaseChart({
  dailyActivity,
  agentsUsed,
  paletteKey,
  selectedAgent,
  onAgentClick,
}: KnowledgeBaseChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null)
  const tooltip = useChartTooltip()
  const agentNames = Object.keys(agentsUsed)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    if (!containerRef.current) return
    let timerId: ReturnType<typeof setTimeout> | null = null
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width
        if (timerId) clearTimeout(timerId)
        timerId = setTimeout(() => setContainerWidth(w), 150)
      }
    })
    ro.observe(containerRef.current)
    setContainerWidth(containerRef.current.clientWidth)
    return () => {
      ro.disconnect()
      if (timerId) clearTimeout(timerId)
    }
  }, [])

  useEffect(() => {
    if (!svgRef.current || containerWidth < 100) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    if (dailyActivity.length === 0) return

    const palette = getPalette(agentNames)
    const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

    // Agent ratios
    const totalUsage = Object.values(agentsUsed).reduce((a, b) => a + b, 0) || 1
    const agentRatios = agentNames
      .map((name) => ({ name, ratio: agentsUsed[name] / totalUsage }))
      .sort((a, b) => b.ratio - a.ratio)

    const activeDays = dailyActivity.filter((d) => d.message_count > 0 || d.token_count > 0)
    if (activeDays.length === 0) return

    const maxActivity = d3.max(activeDays, (d) => d.message_count + d.token_count / 1000) || 1

    // ── Dimensions ──
    const height = Math.min(420, containerWidth * 0.6)
    const cx = containerWidth / 2
    const cy = height / 2
    const spread = Math.min(cx, cy) * 0.85

    // ── Build nodes ──
    // Cosmic web distribution: dense filaments, sparse voids, bright clusters at intersections.
    const nodes: GraphNode[] = []
    const rng = seededRandom('kb-chart')

    const sortedDays = [...activeDays].sort((a, b) => a.date.localeCompare(b.date))
    const dateCount = sortedDays.length

    for (let di = 0; di < dateCount; di++) {
      const d = sortedDays[di]
      const dayActivity = d.message_count + d.token_count / 1000
      const daySizeBase = Math.sqrt(dayActivity / maxActivity)

      // High-activity days → closer to core; low-activity → outer edges
      const activityNorm = dayActivity / maxActivity
      const coreBias = 1 - Math.pow(activityNorm, 0.3)
      const baseR = spread * (0.05 + coreBias * 0.85)

      // Spiral arm with wider angular spread for cosmic web look
      const spiralAngle = (di / Math.max(dateCount - 1, 1)) * Math.PI * 5

      for (let ai = 0; ai < agentRatios.length; ai++) {
        const ar = agentRatios[ai]
        const agentShare = ar.ratio
        // Wider radius range: tiny particles (1.5) to bright clusters (24)
        const radius = Math.max(1.5, (2 + daySizeBase * 22) * Math.pow(agentShare, 0.35))
        const agentMsgs = Math.round(d.message_count * agentShare)
        const agentTokens = Math.round(d.token_count * agentShare)

        // Wider angular offset per agent for more spread
        const agentAngleOffset = (ai / agentRatios.length) * Math.PI * 0.7
        const jitter = (rng() - 0.5) * spread * 0.35
        const r = baseR + jitter
        const angle = spiralAngle + agentAngleOffset + (rng() - 0.5) * 0.6

        nodes.push({
          id: `${d.date}-${ar.name}`,
          date: d.date,
          messages: agentMsgs,
          tokens: agentTokens,
          agent: ar.name,
          color: palette.agents[ar.name] ?? palette.mutedDot,
          radius,
          activity: dayActivity * agentShare,
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r * 0.7,
        })

        // Spawn satellite particles near high-activity nodes for cosmic density
        if (daySizeBase > 0.3 && agentShare > 0.15) {
          const satellites = Math.floor(rng() * 3) + 1
          for (let si = 0; si < satellites; si++) {
            const satAngle = rng() * Math.PI * 2
            const satDist = (4 + rng() * 18) * daySizeBase
            nodes.push({
              id: `${d.date}-${ar.name}-sat${si}`,
              date: d.date,
              messages: 0,
              tokens: 0,
              agent: ar.name,
              color: palette.agents[ar.name] ?? palette.mutedDot,
              radius: 0.8 + rng() * 1.5,
              activity: 0,
              x: cx + Math.cos(angle) * r + Math.cos(satAngle) * satDist,
              y: cy + Math.sin(angle) * r * 0.7 + Math.sin(satAngle) * satDist,
            })
          }
        }
      }
    }

    // ── Build links ──
    const links: GraphLink[] = []

    const byDate = new Map<string, GraphNode[]>()
    const byAgent = new Map<string, GraphNode[]>()
    for (const n of nodes) {
      // Only index primary nodes (not satellites) for linking
      if (n.id.includes('-sat')) continue
      if (!byDate.has(n.date)) byDate.set(n.date, [])
      byDate.get(n.date)!.push(n)
      if (!byAgent.has(n.agent)) byAgent.set(n.agent, [])
      byAgent.get(n.agent)!.push(n)
    }

    // Intra-day: connect agents within the same day (tight local clusters)
    for (const [, dayNodes] of byDate) {
      for (let i = 0; i < dayNodes.length; i++) {
        for (let j = i + 1; j < dayNodes.length; j++) {
          links.push({ source: dayNodes[i].id, target: dayNodes[j].id, strength: 0.4 })
        }
      }
    }

    // Inter-day: same-agent chains across nearby days — longer reach for filaments
    for (const [, agentNodes] of byAgent) {
      const sorted = [...agentNodes].sort((a, b) => a.date.localeCompare(b.date))
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < Math.min(i + 6, sorted.length); j++) {
          const dayDiff = Math.abs(
            (new Date(sorted[j].date).getTime() - new Date(sorted[i].date).getTime()) / 86400000
          )
          if (dayDiff > 14) break
          const timeFactor = 1 - dayDiff / 15
          links.push({ source: sorted[i].id, target: sorted[j].id, strength: timeFactor * 0.25 })
        }
      }
    }

    // Cross-agent links between nearby days — wider reach for web structure
    const dateKeys = Array.from(byDate.keys()).sort()
    for (let i = 0; i < dateKeys.length; i++) {
      for (let j = i + 1; j <= Math.min(i + 3, dateKeys.length - 1); j++) {
        const dayDiff = Math.abs(
          (new Date(dateKeys[j]).getTime() - new Date(dateKeys[i]).getTime()) / 86400000
        )
        if (dayDiff > 5) continue
        const nodesA = byDate.get(dateKeys[i])!
        const nodesB = byDate.get(dateKeys[j])!
        for (let a = 0; a < Math.min(nodesA.length, 3); a++) {
          for (let b = 0; b < Math.min(nodesB.length, 3); b++) {
            if (nodesA[a].agent !== nodesB[b].agent) {
              links.push({ source: nodesA[a].id, target: nodesB[b].id, strength: 0.1 })
            }
          }
        }
      }
    }

    // ── SVG setup ──
    svg
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', `0 0 ${containerWidth} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')

    const defs = svg.append('defs')

    // Glow filter for nodes
    const glowFilter = defs.append('filter').attr('id', 'kb-glow')
      .attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%')
    glowFilter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur')
    const feMerge = glowFilter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'blur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Soft glow for large cluster nodes
    const softGlow = defs.append('filter').attr('id', 'kb-soft-glow')
      .attr('x', '-150%').attr('y', '-150%').attr('width', '400%').attr('height', '400%')
    softGlow.append('feGaussianBlur').attr('stdDeviation', '10').attr('result', 'blur')
    const softMerge = softGlow.append('feMerge')
    softMerge.append('feMergeNode').attr('in', 'blur')
    softMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Ambient nebula glow — multi-layer for depth
    const radialGrad = defs.append('radialGradient').attr('id', 'kb-ambient')
    radialGrad.append('stop').attr('offset', '0%')
      .attr('stop-color', isDark ? 'rgba(100,160,255,0.06)' : 'rgba(100,160,255,0.02)')
    radialGrad.append('stop').attr('offset', '40%')
      .attr('stop-color', isDark ? 'rgba(160,120,255,0.03)' : 'rgba(140,100,255,0.01)')
    radialGrad.append('stop').attr('offset', '100%').attr('stop-color', 'transparent')

    svg.append('ellipse')
      .attr('cx', cx).attr('cy', cy)
      .attr('rx', spread * 1.4).attr('ry', spread * 1.05)
      .attr('fill', 'url(#kb-ambient)')

    const g = svg.append('g')

    // ── Ambient dust particles — fills voids with faint cosmic dust ──
    const dustGroup = g.append('g').attr('class', 'dust')
    const dustCount = Math.min(80, Math.max(20, nodes.length))
    const dustRng = seededRandom('kb-dust')
    for (let i = 0; i < dustCount; i++) {
      const angle = dustRng() * Math.PI * 2
      const dist = spread * (0.1 + dustRng() * 0.9)
      const dx = cx + Math.cos(angle) * dist
      const dy = cy + Math.sin(angle) * dist * 0.75
      dustGroup.append('circle')
        .attr('cx', dx)
        .attr('cy', dy)
        .attr('r', 0.4 + dustRng() * 0.8)
        .attr('fill', isDark ? 'rgba(200,210,230,0.15)' : 'rgba(100,116,139,0.08)')
        .attr('opacity', 0)
        .transition()
        .delay(300 + i * 10)
        .duration(1000)
        .attr('opacity', 0.15 + dustRng() * 0.25)
    }

    // ── Render links as filamentary mesh ──
    const edgeColor = isDark ? 'rgba(180,200,230,0.18)' : 'rgba(100,116,139,0.12)'
    const linkGroup = g.append('g').attr('class', 'links')
    const linkElements = linkGroup
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', edgeColor)
      .attr('stroke-width', (d: GraphLink) => 0.3 + d.strength * 0.8)
      .attr('stroke-opacity', 0)

    // ── Render nodes ──
    const nodeGroup = g.append('g').attr('class', 'nodes')

    // Outer glow halos for larger nodes — stronger for cosmic cluster look
    if (isDark) {
      nodeGroup
        .selectAll('.glow')
        .data(nodes.filter((n) => n.radius > 4))
        .join('circle')
        .attr('class', 'glow')
        .attr('r', (d: GraphNode) => d.radius * 2.5)
        .attr('fill', (d: GraphNode) => d.color)
        .attr('opacity', 0)
        .attr('filter', 'url(#kb-soft-glow)')
        .transition()
        .delay((_d: GraphNode, i: number) => 200 + i * 15)
        .duration(900)
        .attr('opacity', (d: GraphNode) =>
          selectedAgent != null && selectedAgent !== d.agent ? 0.01 : 0.1
        )
    }

    const nodeElements = nodeGroup
      .selectAll('.node')
      .data(nodes)
      .join('circle')
      .attr('class', 'node')
      .attr('r', (d: GraphNode) => d.radius)
      .attr('fill', (d: GraphNode) => {
        if (selectedAgent != null && selectedAgent !== d.agent) return palette.mutedDot
        return d.color
      })
      .attr('opacity', 0)
      .attr('stroke', (d: GraphNode) => {
        if (selectedAgent != null && selectedAgent !== d.agent) return 'none'
        if (d.radius < 2) return 'none'
        return isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'
      })
      .attr('stroke-width', (d: GraphNode) => d.radius > 8 ? 0.6 : 0.3)
      .attr('cursor', (d: GraphNode) => d.activity > 0 ? 'pointer' : 'default')

    if (isDark) {
      nodeElements.attr('filter', (d: GraphNode) => d.radius > 2 ? 'url(#kb-glow)' : 'none')
    }

    // Hover interactions (only for real data nodes, not satellites)
    nodeElements
      .on('mouseenter', function (event: MouseEvent, d: GraphNode) {
        if (d.activity === 0) return
        d3.select(this).transition().duration(120).attr('r', d.radius * 1.4)
        const content = `${d.agent} · ${d.date} · ${d.messages} msgs${d.tokens > 0 ? ` · ${d.tokens.toLocaleString()} tokens` : ''}`
        tooltip.show(event, content)
      })
      .on('mouseleave', function (_event: MouseEvent, d: GraphNode) {
        d3.select(this).transition().duration(120).attr('r', d.radius)
        tooltip.hide()
      })

    // ── Force simulation ──
    // Cosmic web: gentle forces that preserve the filamentary structure.
    const nodeCount = nodes.length
    const sim = d3
      .forceSimulation<GraphNode>(nodes)
      .force(
        'link',
        d3.forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance((d) => 25 + (1 - d.strength) * 50)
          .strength((d) => d.strength * 0.2)
      )
      .force('charge', d3.forceManyBody()
        .strength(nodeCount > 200 ? -8 : nodeCount > 80 ? -15 : -25)
        .distanceMax(spread * 0.7)
      )
      .force('collision', d3.forceCollide<GraphNode>().radius((d) => d.radius + 0.5).strength(0.4))
      .force('gravityX', d3.forceX(cx).strength(0.006))
      .force('gravityY', d3.forceY(cy).strength(0.008))
      .alphaDecay(0.04)
      .velocityDecay(0.5)

    simulationRef.current = sim

    sim.on('tick', () => {
      const pad = 8
      linkElements
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y)

      nodeElements
        .attr('cx', (d: GraphNode) => Math.max(pad, Math.min(containerWidth - pad, d.x!)))
        .attr('cy', (d: GraphNode) => Math.max(pad, Math.min(height - pad - 18, d.y!)))

      // Move glow halos with nodes
      if (isDark) {
        nodeGroup.selectAll('.glow')
          .attr('cx', (d: any) => Math.max(pad, Math.min(containerWidth - pad, d.x!)))
          .attr('cy', (d: any) => Math.max(pad, Math.min(height - pad - 18, d.y!)))
      }
    })

    // ── Staggered fade-in: dust → links → nodes ──
    linkElements
      .transition()
      .delay((_d: GraphLink, i: number) => Math.min(i * 2, 500))
      .duration(800)
      .ease(d3.easeCubicOut)
      .attr('stroke-opacity', (d: GraphLink) => 0.1 + d.strength * 0.3)

    nodeElements
      .transition()
      .delay((_d: GraphNode, i: number) => 150 + Math.min(i * 5, 600))
      .duration(700)
      .ease(d3.easeCubicOut)
      .attr('opacity', (d: GraphNode) => {
        if (selectedAgent != null && selectedAgent !== d.agent) return 0.08
        // Satellites are dimmer; real nodes are bright
        return d.activity > 0 ? 0.92 : 0.4
      })

    // ── Month labels ──
    const monthMap = new Map<string, string>()
    for (const d of sortedDays) {
      const dt = new Date(`${d.date}T00:00:00`)
      const key = `${dt.getFullYear()}-${dt.getMonth()}`
      if (!monthMap.has(key)) {
        monthMap.set(key, dt.toLocaleString('default', { month: 'short' }))
      }
    }
    const monthLabels = Array.from(monthMap.values())
    const labelSpacing = containerWidth / (monthLabels.length + 1)
    monthLabels.forEach((label, i) => {
      svg.append('text')
        .attr('x', labelSpacing * (i + 1))
        .attr('y', height - 4)
        .attr('text-anchor', 'middle')
        .attr('fill', palette.axis)
        .attr('font-size', 10)
        .attr('opacity', 0)
        .transition()
        .delay(600)
        .duration(400)
        .attr('opacity', 0.6)
        .text(label)
    })

    return () => {
      sim.stop()
      simulationRef.current = null
    }
  }, [dailyActivity, agentsUsed, containerWidth, selectedAgent, paletteKey])

  return (
    <div data-testid="knowledge-base-chart" ref={containerRef} className="w-full">
      <svg ref={svgRef} className="w-full" />
      {agentNames.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-end gap-3 text-xs text-muted-foreground">
          {agentNames.map((agent) => (
            <button
              type="button"
              key={agent}
              className={`inline-flex items-center gap-1.5 cursor-pointer transition-opacity ${
                selectedAgent != null && selectedAgent !== agent ? 'opacity-50' : ''
              } ${selectedAgent === agent ? 'font-semibold text-foreground' : ''}`}
              onClick={() => onAgentClick?.(agent)}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: `var(--dashboard-agent-${KNOWN_AGENTS.includes(agent as (typeof KNOWN_AGENTS)[number]) ? agent : 'default'})`,
                }}
              />
              {agent}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
