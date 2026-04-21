import { Skeleton } from '@/components/ui/skeleton'

const stageLabels: Record<string, string> = {
  extracting: 'Extracting page copy...',
  analyzing: 'Analyzing with AI...',
  aggregating: 'Aggregating results...',
  done: 'Finishing up...',
}

interface LoadingStateProps {
  stage?: string
}

export function LoadingState({ stage }: LoadingStateProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-3 w-full" />
      <div className="flex flex-col gap-3 pt-2">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
      {stage && (
        <p className="text-center text-sm text-muted-foreground pt-2">
          {stageLabels[stage] ?? 'Loading...'}
        </p>
      )}
    </div>
  )
}
