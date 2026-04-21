import type { ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle, KeyRound, ShieldOff, FileX, HelpCircle } from 'lucide-react'

const errorMeta: Record<string, { title: string; description: string; icon: ReactNode }> = {
  RESTRICTED: {
    title: 'Restricted Page',
    description: "Can't analyze Chrome internal pages or the Web Store.",
    icon: <ShieldOff className="size-4" />,
  },
  NO_COPY: {
    title: 'No Content Found',
    description: 'This page has no meaningful copy to analyze.',
    icon: <FileX className="size-4" />,
  },
  LLM_ERROR: {
    title: 'Analysis Failed',
    description: 'AI analysis returned an unexpected result. Try again.',
    icon: <AlertCircle className="size-4" />,
  },
  MISSING_KEY: {
    title: 'API Key Missing',
    description: 'VITE_GEMINI_API_KEY is not set. Rebuild with a valid key.',
    icon: <KeyRound className="size-4" />,
  },
  UNKNOWN: {
    title: 'Something Went Wrong',
    description: 'An unexpected error occurred.',
    icon: <HelpCircle className="size-4" />,
  },
}

interface ErrorStateProps {
  code: string
  message: string
  onRetry: () => void
}

export function ErrorState({ code, message, onRetry }: ErrorStateProps) {
  const meta = errorMeta[code] ?? errorMeta.UNKNOWN

  return (
    <div className="flex flex-col gap-4 p-4">
      <Alert variant="destructive">
        {meta.icon}
        <AlertTitle>{meta.title}</AlertTitle>
        <AlertDescription className="mt-1 text-xs break-words">{message}</AlertDescription>
      </Alert>
      {code !== 'MISSING_KEY' && (
        <Button variant="outline" size="sm" className="w-full" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  )
}
