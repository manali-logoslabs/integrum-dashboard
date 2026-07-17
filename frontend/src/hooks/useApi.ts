/**
 * useApi — generic async data-fetch hook
 */
import { useState, useEffect, useCallback } from 'react'

interface State<T> {
  data:    T | null
  loading: boolean
  error:   string | null
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): State<T> & { refetch: () => void } {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: null })

  const run = useCallback(() => {
    setState(s => ({ ...s, loading: true, error: null }))
    fetcher()
      .then(data => setState({ data, loading: false, error: null }))
      .catch(err  => setState({ data: null, loading: false, error: String(err?.message ?? err) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => { run() }, [run])

  return { ...state, refetch: run }
}
