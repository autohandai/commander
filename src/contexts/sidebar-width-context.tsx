import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

interface SidebarWidthContextType {
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;
  getActualSidebarWidth: () => number;
}

const SidebarWidthContext = createContext<SidebarWidthContextType | null>(null);

const SIDEBAR_WIDTH_STORAGE_KEY = 'sidebar-width';
const DEFAULT_SIDEBAR_WIDTH = 256; // 16rem = 256px
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;
const COLLAPSED_SIDEBAR_WIDTH = 48; // 3rem = 48px

interface SidebarWidthProviderProps {
  children: React.ReactNode;
}

export function SidebarWidthProvider({ children }: SidebarWidthProviderProps) {
  const [sidebarWidth, setSidebarWidthState] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);

  // Load saved width on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      if (width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidthState(width);
      }
    }
  }, []);

  const setSidebarWidth = useCallback((width: number) => {
    const constrainedWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
    setSidebarWidthState(constrainedWidth);
    localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, constrainedWidth.toString());
    
    // Update CSS custom property for the sidebar
    document.documentElement.style.setProperty('--sidebar-width', `${constrainedWidth}px`);
  }, []);

  const getActualSidebarWidth = useCallback(() => {
    // This function will be called from components that need to know the actual rendered width
    return sidebarWidth;
  }, [sidebarWidth]);

  // Update CSS custom property when width changes
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`);
  }, [sidebarWidth]);

  const value = {
    sidebarWidth,
    setSidebarWidth,
    isResizing,
    setIsResizing,
    getActualSidebarWidth,
  };

  return (
    <SidebarWidthContext.Provider value={value}>
      {children}
    </SidebarWidthContext.Provider>
  );
}

export function useSidebarWidth() {
  const context = useContext(SidebarWidthContext);
  if (!context) {
    throw new Error('useSidebarWidth must be used within a SidebarWidthProvider');
  }
  return context;
}

export { MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH, DEFAULT_SIDEBAR_WIDTH, COLLAPSED_SIDEBAR_WIDTH };