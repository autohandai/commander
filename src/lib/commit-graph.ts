export interface DagRow {
  hash: string
  parents: string[]
  author: string
  date: string
  subject: string
  refs: string[]
}

export interface DagWithLane extends DagRow {
  lane: number
}

export interface DagConnection {
  fromLane: number
  toLane: number
  fromIndex: number
  toIndex: number
  type: 'direct' | 'merge'
}

export interface EnhancedDagRow extends DagWithLane {
  connections: DagConnection[]
  color: string
  branchName?: string
}

// Simple lane assignment: keep a map of active parent hashes → lane index.
// When a commit appears, reuse a parent's lane if present, else take first free lane.
export function assignLanes(rows: DagRow[]): DagWithLane[] {
  // Process newest -> oldest (as provided). Maintain an array of lane targets (parent hashes).
  const lanes: (string | null)[] = []
  const result: DagWithLane[] = []

  const firstFree = () => {
    const idx = lanes.indexOf(null)
    if (idx === -1) { lanes.push(null); return lanes.length - 1 }
    return idx
  }

  for (const row of rows) {
    // If this commit is already targeted by a lane, reuse that lane.
    let lane = lanes.findIndex(h => h === row.hash)
    if (lane === -1) lane = firstFree()

    // Occupy the lane with first parent (or null if none)
    lanes[lane] = row.parents[0] ?? null

    // Additional parents spawn new lanes pointing to those parents
    for (let i = 1; i < row.parents.length; i++) {
      const p = row.parents[i]
      const idx = firstFree()
      lanes[idx] = p
    }

    result.push({ ...row, lane })

    // Optional compaction: trim trailing null lanes to keep width modest
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()
  }
  return result
}

// Generate colors for branches
function generateBranchColors(): string[] {
  return [
    'hsl(210, 100%, 50%)', // Blue
    'hsl(120, 100%, 40%)', // Green  
    'hsl(30, 100%, 50%)',  // Orange
    'hsl(280, 100%, 50%)', // Purple
    'hsl(0, 100%, 50%)',   // Red
    'hsl(180, 100%, 40%)', // Teal
    'hsl(300, 100%, 50%)', // Magenta
    'hsl(60, 100%, 45%)',  // Yellow
  ]
}

// Enhance commits with connection data and colors
export function enhanceWithConnections(rows: DagWithLane[]): EnhancedDagRow[] {
  const result: EnhancedDagRow[] = []
  const laneColors = generateBranchColors()
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const connections: DagConnection[] = []
    
    // Calculate connections to parent commits
    row.parents.forEach(parentHash => {
      const parentIndex = rows.findIndex(r => r.hash === parentHash)
      if (parentIndex > i) {
        const parentRow = rows[parentIndex]
        connections.push({
          fromLane: row.lane,
          toLane: parentRow.lane,
          fromIndex: i,
          toIndex: parentIndex,
          type: row.parents.length > 1 ? 'merge' : 'direct'
        })
      }
    })
    
    result.push({
      ...row,
      connections,
      color: laneColors[row.lane % laneColors.length],
      branchName: row.refs.find(ref => ref.startsWith('origin/'))?.replace('origin/', '')
    })
  }
  
  return result
}
