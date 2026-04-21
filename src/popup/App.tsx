import { useEffect, useState, useCallback } from 'react'
import { LoadingState } from './components/LoadingState'
import { ErrorState } from './components/ErrorState'
import { EmptyState } from './components/EmptyState'
import { ReportView } from './components/ReportView'
import { IntroView } from './components/IntroView'
import type {
  AnalysisReport,
  ExtractedCopy,
  BgMessage,
  Category,
  ProgressStage,
  TabInfo,
  TabInfoResponse,
} from '@/lib/types'

type AppState =
  | { status: 'idle' }
  | {
      status: 'loading'
      stage: ProgressStage
      percent: number
      detail: string
      completed: Category[]
    }
  | { status: 'error'; code: string; message: string }
  | { status: 'empty' }
  | { status: 'done'; report: AnalysisReport; extracted: ExtractedCopy }

const INITIAL_LOADING: Extract<AppState, { status: 'loading' }> = {
  status: 'loading',
  stage: 'extracting',
  percent: 0,
  detail: 'Starting…',
  completed: [],
}

export default function App() {
  const [state, setState] = useState<AppState>({ status: 'idle' })
  const [tab, setTab] = useState<TabInfo | null>(null)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: 'GET_TAB_INFO' }, (response: TabInfoResponse) => {
      if (chrome.runtime.lastError || !response?.ok) return
      setTab(response.tab)
    })
  }, [])

  useEffect(() => {
    const onProgress = (msg: BgMessage) => {
      if (msg.type !== 'PROGRESS') return
      setState(prev =>
        prev.status === 'loading'
          ? {
              status: 'loading',
              stage: msg.stage,
              percent: msg.percent,
              detail: msg.detail,
              completed: msg.completed,
            }
          : prev,
      )
    }
    chrome.runtime.onMessage.addListener(onProgress)
    return () => chrome.runtime.onMessage.removeListener(onProgress)
  }, [])

  const analyze = useCallback(() => {
    setState(INITIAL_LOADING)
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
        setState({ status: 'done', report: response.report, extracted: response.extracted })
      } else if (response.code === 'NO_COPY') {
        setState({ status: 'empty' })
      } else {
        setState({ status: 'error', code: response.code, message: response.message })
      }
    })
  }, [])

  const goIdle = useCallback(() => setState({ status: 'idle' }), [])

  return (
    <div className="w-[420px] max-h-[600px] overflow-hidden bg-background text-foreground flex flex-col">
      {state.status === 'idle' ? (
        <IntroView tab={tab} onAnalyze={analyze} />
      ) : state.status === 'loading' ? (
        <LoadingState
          stage={state.stage}
          percent={state.percent}
          detail={state.detail}
          completed={state.completed}
        />
      ) : state.status === 'error' ? (
        <ErrorState code={state.code} message={state.message} onRetry={analyze} />
      ) : state.status === 'empty' ? (
        <EmptyState onBack={goIdle} />
      ) : (
        <ReportView report={state.report} extracted={state.extracted} />
      )}
    </div>
  )
}
