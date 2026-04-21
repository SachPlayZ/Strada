import { useEffect, useState, useCallback } from 'react'
import { LoadingState } from './components/LoadingState'
import { ErrorState } from './components/ErrorState'
import { EmptyState } from './components/EmptyState'
import { ReportView } from './components/ReportView'
import type { AnalysisReport, ExtractedCopy, BgMessage } from '@/lib/types'

type AppState =
  | { status: 'idle' }
  | { status: 'loading'; stage?: string }
  | { status: 'error'; code: string; message: string }
  | { status: 'empty' }
  | { status: 'done'; report: AnalysisReport; extracted: ExtractedCopy }

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'loading' })

  useEffect(() => {
    const onProgress = (msg: BgMessage) => {
      if (msg.type === 'PROGRESS')
        setState(prev =>
          prev.status === 'loading' ? { status: 'loading', stage: msg.stage } : prev,
        )
    }
    chrome.runtime.onMessage.addListener(onProgress)
    return () => chrome.runtime.onMessage.removeListener(onProgress)
  }, [])

  const requestAnalysis = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'ANALYZE_PAGE' }, response => {
      if (chrome.runtime.lastError) {
        setState({
          status: 'error',
          code: 'UNKNOWN',
          message: chrome.runtime.lastError.message ?? 'Unknown error',
        })
        return
      }
      if (!response) {
        setState({ status: 'error', code: 'UNKNOWN', message: 'No response from background' })
        return
      }
      if (response.ok) {
        if (response.code === 'NO_COPY') {
          setState({ status: 'empty' })
        } else {
          setState({ status: 'done', report: response.report, extracted: response.extracted })
        }
      } else {
        if (response.code === 'NO_COPY') {
          setState({ status: 'empty' })
        } else {
          setState({ status: 'error', code: response.code, message: response.message })
        }
      }
    })
  }, [])

  const analyze = useCallback(() => {
    setState({ status: 'loading' })
    requestAnalysis()
  }, [requestAnalysis])

  useEffect(() => {
    requestAnalysis()
  }, [requestAnalysis])

  return (
    <div className="w-[420px] max-h-[600px] overflow-hidden bg-background text-foreground flex flex-col">
      {state.status === 'idle' || state.status === 'loading' ? (
        <LoadingState stage={state.status === 'loading' ? state.stage : undefined} />
      ) : state.status === 'error' ? (
        <ErrorState code={state.code} message={state.message} onRetry={analyze} />
      ) : state.status === 'empty' ? (
        <EmptyState />
      ) : (
        <ReportView report={state.report} extracted={state.extracted} />
      )}
    </div>
  )
}
