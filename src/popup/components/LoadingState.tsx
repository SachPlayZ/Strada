import { Check, Loader2, Sparkles, FileText } from 'lucide-react'
import type { Category, ProgressStage } from '@/lib/types'

const CATEGORY_LABELS: Record<Category, string> = {
  value_prop: 'Value proposition',
  cta: 'Calls to action',
  jargon: 'Jargon',
  tone: 'Tone',
  readability: 'Readability',
}

const CATEGORY_ORDER: Category[] = ['value_prop', 'cta', 'jargon', 'tone', 'readability']

const STAGE_HEADLINES: Record<ProgressStage, string> = {
  extracting: 'Extracting page copy',
  analyzing: 'Running 5 parallel analyzers',
  aggregating: 'Preparing your report',
  done: 'Finishing up',
}

const STAGE_SUBTITLES: Record<ProgressStage, string> = {
  extracting: 'Reading headlines, CTAs, and body copy from the page.',
  analyzing: 'Each analyzer independently scores one dimension of your copy.',
  aggregating: 'Scoring, deduping issues, and drafting the summary.',
  done: 'Almost ready…',
}

interface LoadingStateProps {
  stage?: ProgressStage
  percent?: number
  detail?: string
  completed?: Category[]
}

type NodeStatus = 'pending' | 'running' | 'done'

export function LoadingState({
  stage = 'extracting',
  percent = 0,
  detail,
  completed = [],
}: LoadingStateProps) {
  const isExtracting = stage === 'extracting'
  const isAnalyzing = stage === 'analyzing'
  const isAggregating = stage === 'aggregating'
  const isDone = stage === 'done'
  const allNodesDone = completed.length === CATEGORY_ORDER.length
  const showPreparing = isAggregating || isDone || (isAnalyzing && allNodesDone)

  function nodeStatus(cat: Category): NodeStatus {
    if (completed.includes(cat)) return 'done'
    if (isAnalyzing) return 'running'
    return 'pending'
  }

  return (
    <div className="flex flex-col gap-4 p-4 animate-fade-in-up">
      <div className="flex items-center gap-2">
        <span className="relative flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary animate-pulse-glow">
          <Sparkles className="size-3.5 animate-float" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold leading-tight truncate">{STAGE_HEADLINES[stage]}</h2>
          <p className="text-[11px] text-muted-foreground truncate">{STAGE_SUBTITLES[stage]}</p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
          {percent}%
        </span>
      </div>

      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
          style={{ width: `${Math.max(4, percent)}%` }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full bg-[linear-gradient(90deg,transparent_0%,hsl(var(--primary-foreground)/0.35)_50%,transparent_100%)] bg-[length:200%_100%] animate-shimmer"
          style={{
            width: `${Math.max(4, percent)}%`,
            opacity: percent > 0 && percent < 100 ? 1 : 0,
          }}
        />
      </div>

      {detail && (
        <p
          key={detail}
          className="text-xs text-muted-foreground animate-slide-in-right min-h-[1rem]"
        >
          {detail}
        </p>
      )}

      <NodeGraph
        extractingActive={isExtracting}
        extractingDone={!isExtracting}
        nodeStatus={nodeStatus}
        aggregatingActive={isAggregating}
        aggregatingDone={isDone}
        allNodesDone={allNodesDone}
      />

      {showPreparing && <PreparingReportCard allDone={allNodesDone} isDone={isDone} />}
    </div>
  )
}

interface NodeGraphProps {
  extractingActive: boolean
  extractingDone: boolean
  nodeStatus: (cat: Category) => NodeStatus
  aggregatingActive: boolean
  aggregatingDone: boolean
  allNodesDone: boolean
}

function NodeGraph({
  extractingActive,
  extractingDone,
  nodeStatus,
  aggregatingActive,
  aggregatingDone,
  allNodesDone,
}: NodeGraphProps) {
  const anyRunning = CATEGORY_ORDER.some(c => nodeStatus(c) === 'running')
  const aggregateStatus: NodeStatus = aggregatingDone
    ? 'done'
    : aggregatingActive || allNodesDone
      ? 'running'
      : 'pending'

  return (
    <div className="relative rounded-xl border bg-muted/20 p-3">
      <StepRow
        label="Extract copy"
        sublabel="Headlines, CTAs, body"
        status={extractingActive ? 'running' : extractingDone ? 'done' : 'pending'}
        variant="start"
      />

      <div className="relative pl-[22px] mt-1.5">
        <Connector active={anyRunning || allNodesDone} />
        <ul className="flex flex-col gap-1.5 py-1.5">
          {CATEGORY_ORDER.map((cat, i) => {
            const status = nodeStatus(cat)
            return (
              <li
                key={cat}
                className="animate-fade-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <NodePill label={CATEGORY_LABELS[cat]} status={status} />
              </li>
            )
          })}
        </ul>
      </div>

      <StepRow
        label="Aggregate & score"
        sublabel="Weight, dedupe, summarize"
        status={aggregateStatus}
        variant="end"
      />
    </div>
  )
}

function Connector({ active }: { active: boolean }) {
  return (
    <svg
      className="pointer-events-none absolute left-[9px] top-0 h-full w-[2px]"
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      <line x1="1" y1="0" x2="1" y2="100%" stroke="hsl(var(--border))" strokeWidth="2" />
      {active && (
        <line
          x1="1"
          y1="0"
          x2="1"
          y2="100%"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeDasharray="4 6"
          className="animate-dash-flow"
        />
      )}
    </svg>
  )
}

interface StepRowProps {
  label: string
  sublabel: string
  status: NodeStatus
  variant?: 'start' | 'end'
}

function StepRow({ label, sublabel, status }: StepRowProps) {
  return (
    <div className="flex items-center gap-3">
      <StatusDot status={status} size="md" />
      <div className="min-w-0 flex-1">
        <p
          className={`text-xs font-medium leading-tight truncate ${
            status === 'pending' ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          {label}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>
      </div>
      <StatusLabel status={status} />
    </div>
  )
}

interface NodePillProps {
  label: string
  status: NodeStatus
}

function NodePill({ label, status }: NodePillProps) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
        status === 'done'
          ? 'border-primary/30 bg-primary/5'
          : status === 'running'
            ? 'border-primary/40 bg-primary/5 animate-pulse-glow'
            : 'border-border bg-background/40'
      }`}
    >
      <StatusDot status={status} size="sm" />
      <span
        className={`text-xs flex-1 min-w-0 truncate ${
          status === 'pending' ? 'text-muted-foreground' : 'text-foreground font-medium'
        }`}
      >
        {label}
      </span>
      <StatusLabel status={status} compact />
    </div>
  )
}

interface StatusDotProps {
  status: NodeStatus
  size: 'sm' | 'md'
}

function StatusDot({ status, size }: StatusDotProps) {
  const dim = size === 'sm' ? 'size-4' : 'size-5'
  const iconDim = size === 'sm' ? 'size-2.5' : 'size-3'

  if (status === 'done') {
    return (
      <span
        className={`${dim} shrink-0 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground animate-fade-in-up`}
      >
        <Check className={iconDim} strokeWidth={3} />
      </span>
    )
  }
  if (status === 'running') {
    return (
      <span
        className={`${dim} shrink-0 inline-flex items-center justify-center rounded-full bg-primary/15 text-primary`}
      >
        <Loader2 className={`${iconDim} animate-spin`} />
      </span>
    )
  }
  return (
    <span
      className={`${dim} shrink-0 inline-flex items-center justify-center rounded-full border border-dashed border-border bg-background`}
    >
      <span className={`${iconDim} rounded-full bg-muted-foreground/30`} />
    </span>
  )
}

function StatusLabel({ status, compact }: { status: NodeStatus; compact?: boolean }) {
  if (compact) {
    const text = status === 'done' ? 'Done' : status === 'running' ? 'Running' : 'Queued'
    const tone =
      status === 'done'
        ? 'text-primary'
        : status === 'running'
          ? 'text-primary/80'
          : 'text-muted-foreground/70'
    return <span className={`text-[10px] tabular-nums ${tone}`}>{text}</span>
  }

  const text = status === 'done' ? 'Complete' : status === 'running' ? 'Working…' : 'Waiting'
  const tone =
    status === 'done'
      ? 'text-primary'
      : status === 'running'
        ? 'text-primary/80'
        : 'text-muted-foreground/70'
  return <span className={`text-[10px] tabular-nums ${tone}`}>{text}</span>
}

function PreparingReportCard({ allDone, isDone }: { allDone: boolean; isDone: boolean }) {
  const title = isDone
    ? 'Report ready'
    : allDone
      ? 'Preparing your report'
      : 'Finishing up analyzers'
  const subtitle = isDone
    ? 'Opening your scored report…'
    : allDone
      ? 'Deduping overlapping issues, weighting category scores, and drafting the summary…'
      : 'Waiting on the last analyzer before drafting your report.'

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-3 animate-fade-in-up">
      {!isDone && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,transparent_30%,hsl(var(--primary)/0.18)_50%,transparent_70%)] bg-[length:250%_100%] animate-shimmer"
        />
      )}
      <div className="relative flex items-start gap-3">
        <span
          className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary ${
            isDone ? '' : 'animate-pulse-glow'
          }`}
        >
          {isDone ? (
            <Check className="size-3.5" strokeWidth={3} />
          ) : (
            <FileText className="size-3.5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-tight text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{subtitle}</p>
        </div>
        {!isDone && <Loader2 className="size-3.5 shrink-0 animate-spin text-primary mt-1" />}
      </div>
    </div>
  )
}
