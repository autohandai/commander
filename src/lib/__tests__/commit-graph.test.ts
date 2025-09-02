import { describe, it, expect } from 'vitest'
import { assignLanes, type DagRow } from '@/lib/commit-graph'

describe('assignLanes', () => {
  it('keeps linear history on one lane', () => {
    const rows: DagRow[] = [
      { hash: 'c3', parents: ['c2'], author: '', date: '', subject: '', refs: [] },
      { hash: 'c2', parents: ['c1'], author: '', date: '', subject: '', refs: [] },
      { hash: 'c1', parents: [], author: '', date: '', subject: '', refs: [] },
    ]
    const out = assignLanes(rows)
    expect(out.map(r => r.lane)).toEqual([0,0,0])
  })

  it('creates new lane for side branch', () => {
    const rows: DagRow[] = [
      { hash: 'm2', parents: ['m1','f1'], author: '', date: '', subject: '', refs: [] },
      { hash: 'f1', parents: ['m1'], author: '', date: '', subject: '', refs: [] },
      { hash: 'm1', parents: [], author: '', date: '', subject: '', refs: [] },
    ]
    const out = assignLanes(rows)
    expect(out.length).toBe(3)
    // bottom commit has lane 0
    expect(out[2].lane).toBe(0)
  })
})
