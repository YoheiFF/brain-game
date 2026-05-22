import { useState, useEffect, useRef, useCallback } from "react"

export function useCountdown(onComplete: () => void) {
  const [count, setCount] = useState<number | null>(null)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    if (count === null) return
    if (count === 0) {
      setCount(null)
      onCompleteRef.current()
      return
    }
    const t = setTimeout(() => setCount((c) => (c ?? 1) - 1), 1000)
    return () => clearTimeout(t)
  }, [count])

  const start = useCallback(() => setCount(3), [])
  return { count, start }
}
