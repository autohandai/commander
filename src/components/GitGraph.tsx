import { EnhancedDagRow } from '@/lib/commit-graph'
import { Badge } from '@/components/ui/badge'

interface GitGraphProps {
  commits: EnhancedDagRow[]
  onCommitSelect: (hash: string) => void
  selectedCommit: string | null
  maxLanes: number
}

const LANE_WIDTH = 24
const COMMIT_HEIGHT = 54
const COMMIT_RADIUS = 5

export function GitGraph({ commits, onCommitSelect, selectedCommit, maxLanes }: GitGraphProps) {
  const graphWidth = maxLanes * LANE_WIDTH + 40
  const graphHeight = commits.length * COMMIT_HEIGHT

  return (
    <div className="relative flex">
      {/* SVG Git Graph */}
      <div className="relative" style={{ width: graphWidth }}>
        <svg 
          width={graphWidth} 
          height={graphHeight}
          className="absolute left-0 top-0"
        >
          <defs>
            <marker 
              id="arrowhead" 
              markerWidth="6" 
              markerHeight="4" 
              refX="5" 
              refY="2" 
              orient="auto"
            >
              <polygon points="0 0, 6 2, 0 4" fill="#666" />
            </marker>
          </defs>
          
          {/* Render connection lines */}
          {commits.flatMap((commit, index) => 
            commit.connections.map((conn, connIndex) => {
              const x1 = commit.lane * LANE_WIDTH + LANE_WIDTH / 2 + 20
              const y1 = index * COMMIT_HEIGHT + COMMIT_HEIGHT / 2
              const x2 = conn.toLane * LANE_WIDTH + LANE_WIDTH / 2 + 20
              const y2 = conn.toIndex * COMMIT_HEIGHT + COMMIT_HEIGHT / 2
              
              if (conn.type === 'merge') {
                // Curved line for merges
                const controlX = x1 + (x2 - x1) / 2
                const controlY = y1 + (y2 - y1) / 3
                
                return (
                  <path
                    key={`${commit.hash}-${connIndex}`}
                    d={`M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`}
                    stroke={commit.color}
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="4,2"
                    opacity="0.8"
                  />
                )
              } else {
                // Straight line for normal commits
                return (
                  <line
                    key={`${commit.hash}-${connIndex}`}
                    x1={x1} 
                    y1={y1} 
                    x2={x2} 
                    y2={y2}
                    stroke={commit.color}
                    strokeWidth="2"
                    opacity="0.7"
                  />
                )
              }
            })
          )}
          
          {/* Render commit dots */}
          {commits.map((commit, idx) => (
            <g key={commit.hash}>
              <circle
                cx={commit.lane * LANE_WIDTH + LANE_WIDTH / 2 + 20}
                cy={idx * COMMIT_HEIGHT + COMMIT_HEIGHT / 2}
                r={COMMIT_RADIUS}
                fill={commit.color}
                stroke={selectedCommit === commit.hash ? '#0066cc' : '#fff'}
                strokeWidth={selectedCommit === commit.hash ? '3' : '2'}
                className="cursor-pointer hover:stroke-blue-400 transition-colors"
                onClick={() => onCommitSelect(commit.hash)}
              />
              
              {/* Commit hash tooltip on hover */}
              <title>{commit.hash.substring(0, 8)}</title>
            </g>
          ))}
        </svg>
      </div>
      
      {/* Commit metadata list */}
      <div className="flex-1 min-w-0">
        {commits.map((commit) => (
          <button
            key={commit.hash}
            onClick={() => onCommitSelect(commit.hash)}
            className={`w-full text-left p-3 border-b transition-all duration-150 ${
              selectedCommit === commit.hash 
                ? 'bg-accent text-accent-foreground shadow-sm' 
                : 'hover:bg-accent/60'
            }`}
            style={{ height: COMMIT_HEIGHT }}
          >
            <div className="flex items-center gap-2 mb-1">
              <div className="text-sm font-medium truncate flex-1">
                {commit.subject}
              </div>
              {commit.refs.slice(0, 2).map((ref, i) => (
                <Badge 
                  key={i} 
                  variant="outline" 
                  className="text-[10px] px-1 py-0"
                >
                  {ref}
                </Badge>
              ))}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              <span className="font-medium">{commit.author}</span>
              <span className="mx-1">•</span>
              <span>{commit.date}</span>
              {commit.branchName && (
                <>
                  <span className="mx-1">•</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {commit.branchName}
                  </span>
                </>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}