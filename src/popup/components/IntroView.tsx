import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Sparkles, Globe, ShieldOff, ArrowRight } from 'lucide-react'
import type { TabInfo } from '@/lib/types'
import { ThemeToggle } from './ThemeToggle'
import type { Theme } from '../hooks/useTheme'

interface IntroViewProps {
  tab: TabInfo | null
  onAnalyze: () => void
  theme: Theme
  onToggleTheme: () => void
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

export function IntroView({ tab, onAnalyze, theme, onToggleTheme }: IntroViewProps) {
  const restricted = tab?.restricted ?? false

  return (
    <div className="flex flex-col gap-4 p-4 animate-fade-in-up">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold leading-tight">Strada</h1>
          <p className="text-[11px] text-muted-foreground leading-tight">
            AI copy analyzer for any page
          </p>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <div className="rounded-xl border bg-muted/30 p-3 flex gap-3">
        <Globe className="size-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" title={tab?.title}>
            {tab?.title || 'Loading page…'}
          </p>
          <p className="text-xs text-muted-foreground truncate" title={tab?.url}>
            {tab ? hostOf(tab.url) : ''}
          </p>
        </div>
      </div>

      {restricted ? (
        <Alert variant="destructive">
          <ShieldOff className="size-4" />
          <AlertTitle>This page can't be analyzed</AlertTitle>
          <AlertDescription className="mt-1 text-xs">
            Strada can't read Chrome internal pages, the Web Store, or local files. Open a regular
            website and reopen the extension.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Analyze this page's copy across value proposition, CTAs, jargon, tone, and readability.
            Takes ~2–5 seconds.
          </p>
          <Button className="w-full group" onClick={onAnalyze} disabled={!tab}>
            {tab ? (
              <>
                Analyze this page
                <ArrowRight className="ml-1 size-4 transition-transform group-hover:translate-x-0.5" />
              </>
            ) : (
              'Loading…'
            )}
          </Button>
        </>
      )}
    </div>
  )
}
