import { Progress } from '@/components/ui/progress'
import { Check, Loader2 } from 'lucide-react'
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
  analyzing: 'Analyzing with AI',
  aggregating: 'Aggregating results',
  done: 'Finishing up',
}

interface LoadingStateProps {
  stage?: ProgressStage
  percent?: number
  detail?: string
  completed?: Category[]
}

export function LoadingState({
  stage = 'extracting',
  percent = 0,
  detail,
  completed = [],
}: LoadingStateProps) {
  const showChecklist = stage === 'analyzing' || stage === 'aggregating' || stage === 'done'

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <h2 className="text-sm font-semibold">{STAGE_HEADLINES[stage]}</h2>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{percent}%</span>
      </div>

      <Progress value={percent} className="h-2" />

      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}

      {showChecklist && (
        <ul className="flex flex-col gap-1.5 rounded-md border bg-muted/20 p-3">
          {CATEGORY_ORDER.map(cat => {
            const isDone = completed.includes(cat)
            return (
              <li key={cat} className="flex items-center gap-2 text-xs">
                {isDone ? (
                  <Check className="size-3.5 text-primary shrink-0" />
                ) : (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground shrink-0" />
                )}
                <span className={isDone ? 'text-foreground' : 'text-muted-foreground'}>
                  {CATEGORY_LABELS[cat]}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
