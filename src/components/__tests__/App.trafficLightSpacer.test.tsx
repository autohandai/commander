import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TrafficLightSpacer } from '@/App'

/**
 * Regression test: when the sidebar is collapsed on macOS, the header content
 * (sidebar toggle) must NOT overlap the native traffic-light window controls.
 * We reserve horizontal space via <TrafficLightSpacer /> in the header.
 *
 * Bug: collapsing the sidebar pushed the toggle icon under the macOS
 * red/yellow/green buttons (titleBarStyle: Overlay).
 */

const setPlatform = (value: string) => {
  Object.defineProperty(window.navigator, 'platform', {
    value,
    configurable: true,
  })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('TrafficLightSpacer', () => {
  it('reserves space when sidebar is collapsed on macOS', () => {
    setPlatform('MacIntel')
    render(
      <SidebarProvider defaultOpen={false}>
        <TrafficLightSpacer />
      </SidebarProvider>
    )
    const spacer = screen.getByTestId('traffic-light-spacer')
    expect(spacer).toBeInTheDocument()
    // Must reserve enough room to clear the macOS traffic lights (~78px).
    expect(spacer.className).toMatch(/w-\[\d+px\]/)
  })

  it('reserves NO space when sidebar is expanded on macOS', () => {
    setPlatform('MacIntel')
    render(
      <SidebarProvider defaultOpen={true}>
        <TrafficLightSpacer />
      </SidebarProvider>
    )
    expect(screen.queryByTestId('traffic-light-spacer')).not.toBeInTheDocument()
  })

  it('reserves NO space on non-macOS even when collapsed', () => {
    setPlatform('Win32')
    render(
      <SidebarProvider defaultOpen={false}>
        <TrafficLightSpacer />
      </SidebarProvider>
    )
    expect(screen.queryByTestId('traffic-light-spacer')).not.toBeInTheDocument()
  })
})
