import { useEffect, useMemo, useRef, useState } from 'react'
import { LoadingState } from './components/LoadingState'
import { ErrorState } from './components/ErrorState'
import { EmptyState } from './components/EmptyState'
import { ReportView } from './components/ReportView'
import { IntroView } from './components/IntroView'
import { useTheme } from './hooks/useTheme'
import { readSnapshot } from '@/lib/session'
import { PORT_NAME } from '@/lib/types'
import type { AnalysisSnapshot, PortInbound, PortOutbound, TabInfo } from '@/lib/types'

export default function App() {
  // `null` = we haven't finished reading storage.session yet. We hold off on
  // rendering anything meaningful until this resolves so the user never sees
  // a flash of the intro screen over an in-flight analysis.
  const [snapshot, setSnapshot] = useState<AnalysisSnapshot | null>(null)
  const [tab, setTab] = useState<TabInfo | null>(null)
  const { theme, toggleTheme } = useTheme()
  const portRef = useRef<chrome.runtime.Port | null>(null)

  useEffect(() => {
    let cancelled = false

    // Step 1 — authoritative read from storage.session. The popup is a pure
    // view over whatever state the background has persisted; this is the
    // first thing we do on mount.
    readSnapshot().then(s => {
      if (!cancelled) setSnapshot(s)
    })

    // Step 2 — open a named long-lived port. The background posts
    // `SNAPSHOT` messages here whenever it persists a new snapshot, giving
    // us live updates while the popup is open. When the popup closes, the
    // port disconnects automatically and the background silently no-ops.
    const port = chrome.runtime.connect({ name: PORT_NAME })
    portRef.current = port

    const onMessage = (msg: PortOutbound) => {
      if (msg.type === 'SNAPSHOT') {
        setSnapshot(msg.snapshot)
      } else if (msg.type === 'TAB_INFO') {
        setTab(msg.tab)
      }
    }
    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(() => {
      if (portRef.current === port) portRef.current = null
    })

    // Step 3 — ask which tab we're pointed at so the intro screen can name
    // the page and the renderer can detect "snapshot is for a different tab".
    port.postMessage({ type: 'GET_TAB_INFO' } satisfies PortInbound)

    return () => {
      cancelled = true
      port.onMessage.removeListener(onMessage)
      try {
        port.disconnect()
      } catch {
        // already gone
      }
      portRef.current = null
    }
  }, [])

  const send = (msg: PortInbound) => {
    portRef.current?.postMessage(msg)
  }

  const analyze = () => send({ type: 'ANALYZE_PAGE' })
  const reset = () => send({ type: 'RESET' })

  // If the persisted snapshot is for a different URL than the one the user
  // is currently looking at, treat it as idle so they see the intro for the
  // new page instead of a stale completed report.
  const effectiveStatus = useMemo(() => {
    if (!snapshot) return 'hydrating' as const
    if (tab && snapshot.url && snapshot.url !== tab.url) return 'idle'
    return snapshot.status
  }, [snapshot, tab])

  if (effectiveStatus === 'hydrating' || !snapshot) {
    // Tiny neutral frame so the popup doesn't flicker between width changes.
    return <div className="w-[420px] h-[180px] bg-background" aria-busy="true" />
  }

  return (
    <div className="w-[420px] max-h-[600px] overflow-hidden bg-background text-foreground flex flex-col">
      {effectiveStatus === 'idle' ? (
        <IntroView tab={tab} onAnalyze={analyze} theme={theme} onToggleTheme={toggleTheme} />
      ) : effectiveStatus === 'running' ? (
        <LoadingState
          stage={snapshot.stage}
          percent={snapshot.percent}
          detail={snapshot.detail}
          completed={snapshot.completed}
        />
      ) : effectiveStatus === 'error' ? (
        snapshot.error?.code === 'NO_COPY' ? (
          <EmptyState onBack={reset} />
        ) : (
          <ErrorState
            code={snapshot.error?.code ?? 'UNKNOWN'}
            message={snapshot.error?.message ?? 'Unknown error'}
            onRetry={analyze}
          />
        )
      ) : snapshot.report && snapshot.extracted ? (
        <ReportView
          report={snapshot.report}
          extracted={snapshot.extracted}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      ) : (
        // `complete` status but report hasn't rehydrated yet — render idle
        // rather than a half-populated report view.
        <IntroView tab={tab} onAnalyze={analyze} theme={theme} onToggleTheme={toggleTheme} />
      )}
    </div>
  )
}
