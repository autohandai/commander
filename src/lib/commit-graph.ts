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
