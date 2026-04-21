import { FileSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  onBack?: () => void
}

export function EmptyState({ onBack }: EmptyStateProps) {
  return (
    <div className="p-8 flex flex-col items-center text-center gap-3">
      <FileSearch className="size-10 text-muted-foreground" />
      <div>
        <p className="font-medium text-sm">No copy found on this page</p>
        <p className="text-xs text-muted-foreground mt-1">
          Try a content-heavy page like a landing page, blog post, or product page.
        </p>
      </div>
      {onBack && (
        <Button variant="outline" size="sm" onClick={onBack} className="mt-2">
          Back
        </Button>
      )}
    </div>
  )
}
