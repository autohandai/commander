import React, { useRef, useCallback, useEffect } from 'react';
import { useSidebarWidth, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH } from '@/contexts/sidebar-width-context';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

interface ResizableSidebarProps {
  children: React.ReactNode;
  className?: string;
}

export function ResizableSidebar({ children, className }: ResizableSidebarProps) {
  const { sidebarWidth, setSidebarWidth, isResizing, setIsResizing } = useSidebarWidth();
  const { state } = useSidebar();
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMouseDownRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    isMouseDownRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
    setIsResizing(true);

    // Add cursor style to document
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth, setIsResizing]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isMouseDownRef.current) return;

    const deltaX = e.clientX - startXRef.current;
    const newWidth = startWidthRef.current + deltaX;
    
    // Apply constraints
    const constrainedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, newWidth));
    setSidebarWidth(constrainedWidth);
  }, [setSidebarWidth]);

  const handleMouseUp = useCallback(() => {
    if (!isMouseDownRef.current) return;
    
    isMouseDownRef.current = false;
    setIsResizing(false);

    // Reset cursor style
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [setIsResizing]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Don't show resize handle when sidebar is collapsed
  const showResizeHandle = state === 'expanded';

  return (
    <div
      ref={sidebarRef}
      className={cn('relative', className)}
      style={{
        '--sidebar-width': `${sidebarWidth}px`,
      } as React.CSSProperties}
    >
      {children}
      
      {showResizeHandle && (
        <div
          className={cn(
            'absolute top-0 right-0 w-1 h-full cursor-col-resize group',
            'hover:bg-border/50 transition-colors',
            isResizing && 'bg-border'
          )}
          onMouseDown={handleMouseDown}
        >
          {/* Visual indicator on hover */}
          <div className="absolute top-1/2 right-0 w-1 h-8 -translate-y-1/2 bg-border/30 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      )}
    </div>
  );
}