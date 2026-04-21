import { useEffect, useState, useCallback } from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'strada:theme'

function prefersDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  } catch {
    return false
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
  root.style.colorScheme = theme
}

export function useTheme() {
  // Start from a synchronous guess so the first paint isn't a flash. We'll
  // reconcile with chrome.storage.local once it resolves.
  const [theme, setThemeState] = useState<Theme>(() => (prefersDark() ? 'dark' : 'light'))
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    let cancelled = false
    try {
      chrome.storage?.local.get(STORAGE_KEY, result => {
        if (cancelled) return
        const stored = result?.[STORAGE_KEY] as Theme | undefined
        if (stored === 'light' || stored === 'dark') {
          setThemeState(stored)
        }
        setHydrated(true)
      })
    } catch {
      // Defer to a microtask so we don't call setState synchronously during the
      // effect body (react-hooks/set-state-in-effect). Semantically identical.
      queueMicrotask(() => {
        if (!cancelled) setHydrated(true)
      })
    }
    return () => {
      cancelled = true
    }
  }, [])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      chrome.storage?.local.set({ [STORAGE_KEY]: next })
    } catch {
      /* no-op outside extension context */
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try {
        chrome.storage?.local.set({ [STORAGE_KEY]: next })
      } catch {
        /* no-op */
      }
      return next
    })
  }, [])

  return { theme, setTheme, toggleTheme, hydrated }
}
