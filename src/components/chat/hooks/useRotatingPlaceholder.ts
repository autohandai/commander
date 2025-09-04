import { useEffect, useRef, useState } from 'react'

export function useRotatingPlaceholder(params: {
  isOpen: boolean
  executingCount: number
  isInputFocused: boolean
  inputValue: string
  normal: string[]
  plan: string[]
  planModeEnabled: boolean
}) {
  const [typedPlaceholder, setTypedPlaceholder] = useState('')
  const placeholderTimerRef = useRef<number | null>(null)
  const typingIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    const shouldAnimate =
      params.isOpen &&
      params.executingCount === 0 &&
      !params.isInputFocused &&
      params.inputValue.trim() === ''
    const messages = params.planModeEnabled ? params.plan : params.normal
    let idx = 0

    const clearTimers = () => {
      if (typingIntervalRef.current) {
        window.clearInterval(typingIntervalRef.current)
        typingIntervalRef.current = null
      }
      if (placeholderTimerRef.current) {
        window.clearTimeout(placeholderTimerRef.current)
        placeholderTimerRef.current = null
      }
    }

    const typeMessage = (text: string, done: () => void) => {
      setTypedPlaceholder('')
      let i = 0
      typingIntervalRef.current = window.setInterval(() => {
        i += 1
        setTypedPlaceholder(text.slice(0, i))
        if (i >= text.length) {
          if (typingIntervalRef.current) {
            window.clearInterval(typingIntervalRef.current)
            typingIntervalRef.current = null
          }
          done()
        }
      }, 35)
    }

    const cycle = () => {
      if (!shouldAnimate || messages.length === 0) return
      const text = messages[idx % messages.length]
      typeMessage(text, () => {
        placeholderTimerRef.current = window.setTimeout(() => {
          setTypedPlaceholder('')
          idx += 1
          cycle()
        }, 1400)
      })
    }

    clearTimers()
    if (shouldAnimate) {
      cycle()
    } else {
      setTypedPlaceholder('')
    }
    return () => clearTimers()
  }, [
    params.isOpen,
    params.executingCount,
    params.isInputFocused,
    params.inputValue,
    params.planModeEnabled,
    params.normal,
    params.plan,
  ])

  return typedPlaceholder
}
