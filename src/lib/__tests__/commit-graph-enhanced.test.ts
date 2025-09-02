import { describe, it, expect } from 'vitest'
import { assignLanes, enhanceWithConnections, type DagRow } from '@/lib/commit-graph'

describe('enhanceWithConnections', () => {
  it('adds color and connection data to linear history', () => {
    const rows: DagRow[] = [
      { hash: 'c3', parents: ['c2'], author: 'Alice', date: '2024-01-03', subject: 'Third commit', refs: [] },
      { hash: 'c2', parents: ['c1'], author: 'Bob', date: '2024-01-02', subject: 'Second commit', refs: [] },
      { hash: 'c1', parents: [], author: 'Alice', date: '2024-01-01', subject: 'First commit', refs: [] },
    ]
    
    const withLanes = assignLanes(rows)
    const enhanced = enhanceWithConnections(withLanes)
    
    expect(enhanced).toHaveLength(3)
    
    // Check that colors are assigned
    enhanced.forEach(commit => {
      expect(commit.color).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
    })
    
    // Check connections - c3 should connect to c2
    expect(enhanced[0].hash).toBe('c3')
    expect(enhanced[0].connections).toHaveLength(1)
    expect(enhanced[0].connections[0].fromLane).toBe(0)
    expect(enhanced[0].connections[0].toLane).toBe(0)
    expect(enhanced[0].connections[0].type).toBe('direct')
  })

  it('handles merge commits with multiple parents', () => {
    const rows: DagRow[] = [
      { hash: 'm2', parents: ['m1', 'f1'], author: 'Alice', date: '2024-01-04', subject: 'Merge commit', refs: [] },
      { hash: 'f1', parents: ['m1'], author: 'Bob', date: '2024-01-03', subject: 'Feature commit', refs: [] },
      { hash: 'm1', parents: [], author: 'Alice', date: '2024-01-01', subject: 'Base commit', refs: [] },
    ]
    
    const withLanes = assignLanes(rows)
    const enhanced = enhanceWithConnections(withLanes)
    
    // Merge commit should have connections marked as merge type
    const mergeCommit = enhanced.find(c => c.hash === 'm2')
    expect(mergeCommit).toBeDefined()
    expect(mergeCommit!.connections).toHaveLength(2) // Two parent connections
    expect(mergeCommit!.connections.some(c => c.type === 'merge')).toBe(true)
  })

  it('extracts branch names from refs', () => {
    const rows: DagRow[] = [
      { 
        hash: 'c1', 
        parents: [], 
        author: 'Alice', 
        date: '2024-01-01', 
        subject: 'Feature commit', 
        refs: ['origin/feature-branch', 'HEAD'] 
      },
    ]
    
    const withLanes = assignLanes(rows)
    const enhanced = enhanceWithConnections(withLanes)
    
    expect(enhanced[0].branchName).toBe('feature-branch')
  })

  it('handles commits with no refs gracefully', () => {
    const rows: DagRow[] = [
      { hash: 'c1', parents: [], author: 'Alice', date: '2024-01-01', subject: 'Regular commit', refs: [] },
    ]
    
    const withLanes = assignLanes(rows)
    const enhanced = enhanceWithConnections(withLanes)
    
    expect(enhanced[0].branchName).toBeUndefined()
    expect(enhanced[0].color).toBeDefined()
    expect(enhanced[0].connections).toHaveLength(0)
  })

  it('assigns different colors to different lanes', () => {
    const rows: DagRow[] = [
      { hash: 'm2', parents: ['m1', 'f1'], author: 'Alice', date: '2024-01-03', subject: 'Merge', refs: [] },
      { hash: 'f1', parents: ['m1'], author: 'Bob', date: '2024-01-02', subject: 'Feature', refs: [] },
      { hash: 'm1', parents: [], author: 'Alice', date: '2024-01-01', subject: 'Main', refs: [] },
    ]
    
    const withLanes = assignLanes(rows)
    const enhanced = enhanceWithConnections(withLanes)
    
    // Different lanes should get different colors (cycling through the palette)
    const colors = enhanced.map(c => c.color)
    const uniqueColors = new Set(colors)
    expect(uniqueColors.size).toBeGreaterThan(1) // Should have at least 2 different colors
  })

  it('preserves all original DagRow properties', () => {
    const rows: DagRow[] = [
      { 
        hash: 'abc123', 
        parents: ['def456'], 
        author: 'Test Author', 
        date: '2024-01-01', 
        subject: 'Test subject', 
        refs: ['main', 'HEAD'] 
      },
    ]
    
    const withLanes = assignLanes(rows)
    const enhanced = enhanceWithConnections(withLanes)
    
    const commit = enhanced[0]
    expect(commit.hash).toBe('abc123')
    expect(commit.parents).toEqual(['def456'])
    expect(commit.author).toBe('Test Author')
    expect(commit.date).toBe('2024-01-01')
    expect(commit.subject).toBe('Test subject')
    expect(commit.refs).toEqual(['main', 'HEAD'])
    expect(commit.lane).toBeDefined()
    expect(commit.connections).toBeDefined()
    expect(commit.color).toBeDefined()
  })

  it('handles empty commit list', () => {
    const rows: DagRow[] = []
    const withLanes = assignLanes(rows)
    const enhanced = enhanceWithConnections(withLanes)
    
    expect(enhanced).toHaveLength(0)
  })
})