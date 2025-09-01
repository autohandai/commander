import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock Radix Tabs with a minimal implementation that supports forceMount
vi.mock('@radix-ui/react-tabs', async () => {
  const React = await import('react')
  const Ctx = React.createContext<{value: string, onValueChange?: (v: string) => void}>({ value: '' })
  const Root = ({ value, onValueChange, children }: any) => (
    <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>
  )
  const List = ({ children, ...rest }: any) => <div {...rest}>{children}</div>
  const Trigger = ({ value, children, ...rest }: any) => {
    const { onValueChange } = React.useContext(Ctx)
    return (
      <button {...rest} onClick={() => onValueChange?.(value)}>
        {children}
      </button>
    )
  }
  const Content = ({ value, forceMount, children, ...rest }: any) => {
    const { value: current } = React.useContext(Ctx)
    if (forceMount || current === value) return <div data-testid={`content-${value}`} {...rest}>{children}</div>
    return null
  }
  return { Root, List, Trigger, Content }
})

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

function TestTabs() {
  const [value, setValue] = useState('a')
  return (
    <Tabs value={value} onValueChange={setValue}>
      <TabsList>
        <TabsTrigger value="a">A</TabsTrigger>
        <TabsTrigger value="b">B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">
        <div>content-a</div>
      </TabsContent>
      <TabsContent value="b" forceMount>
        <div>content-b</div>
      </TabsContent>
    </Tabs>
  )
}

describe('Tabs forceMount', () => {
  it('keeps non-active content mounted when forceMount is set', async () => {
    render(<TestTabs />)
    // Default active is 'a'
    expect(screen.getByText('content-a')).toBeInTheDocument()
    // Even though not active, b should be mounted thanks to forceMount
    expect(screen.getByText('content-b')).toBeInTheDocument()

    // Switch to B and ensure still present
    fireEvent.click(screen.getByText('B'))
    expect(screen.getByText('content-b')).toBeInTheDocument()
  })
})
