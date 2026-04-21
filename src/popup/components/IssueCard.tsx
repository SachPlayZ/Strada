import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Check, Copy } from 'lucide-react'
import type { Issue, Severity } from '@/lib/types'

const severityVariant: Record<Severity, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
}

const severityLabel: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

interface IssueCardProps {
  issue: Issue
}

export function IssueCard({ issue }: IssueCardProps) {
  const [copied, setCopied] = useState(false)

  function copyImproved() {
    if (!issue.improvedText) return
    navigator.clipboard.writeText(issue.improvedText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground italic truncate max-w-[80%]">
          &ldquo;{issue.originalText}&rdquo;
        </p>
        <Badge variant={severityVariant[issue.severity]} className="shrink-0 text-[10px]">
          {severityLabel[issue.severity]}
        </Badge>
      </div>

      <Separator />

      <div className="flex flex-col gap-1">
        <p className="font-medium text-xs text-destructive">{issue.problem}</p>
        <p className="text-xs text-muted-foreground">{issue.suggestion}</p>
      </div>

      {issue.improvedText && (
        <div className="rounded bg-muted px-2 py-1.5 flex items-start justify-between gap-2">
          <p className="text-xs flex-1">{issue.improvedText}</p>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0"
            onClick={copyImproved}
            title="Copy improved text"
          >
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
      )}
    </div>
  )
}
