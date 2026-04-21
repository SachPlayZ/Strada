import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Separator } from '@/components/ui/separator'
import { IssueCard } from './IssueCard'
import type { AnalysisReport, Category, ExtractedCopy } from '@/lib/types'

const categoryLabels: Record<Category, string> = {
  value_prop: 'Value Proposition',
  cta: 'Call to Action',
  jargon: 'Jargon',
  tone: 'Tone',
  readability: 'Readability',
}

const categoryOrder: Category[] = ['value_prop', 'cta', 'readability', 'tone', 'jargon']

function scoreColor(score: number) {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-amber-500'
  return 'text-red-500'
}

function scoreBadgeVariant(score: number): 'outline' | 'secondary' | 'destructive' {
  if (score >= 80) return 'outline'
  if (score >= 60) return 'secondary'
  return 'destructive'
}

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

interface ReportViewProps {
  report: AnalysisReport
  extracted: ExtractedCopy
}

export function ReportView({ report, extracted }: ReportViewProps) {
  const topIssues = report.issues.slice(0, 3)
  const issuesByCategory = categoryOrder.reduce<Record<Category, typeof report.issues>>(
    (acc, cat) => {
      acc[cat] = report.issues.filter(i => i.category === cat)
      return acc
    },
    {} as Record<Category, typeof report.issues>,
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-3 p-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-muted-foreground truncate min-w-0" title={report.meta.title}>
            {truncate(report.meta.title, 48)}
          </p>
          <span className={`text-3xl font-bold tabular-nums shrink-0 ${scoreColor(report.overallScore)}`}>
            {report.overallScore}
          </span>
        </div>
        <Progress value={report.overallScore} className="h-2" />
        <p className="text-xs text-muted-foreground leading-relaxed">{report.summary}</p>
      </div>

      <Tabs defaultValue="overview" className="flex flex-col flex-1 min-h-0">
        <TabsList className="mx-4 mt-3 grid grid-cols-3 shrink-0">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="issues">
            Issues{report.issues.length > 0 && ` (${report.issues.length})`}
          </TabsTrigger>
          <TabsTrigger value="copy">Extracted</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-[340px]">
            <div className="flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-2">
                {categoryOrder.map(cat => {
                  const score = report.categoryScores[cat] ?? 0
                  return (
                    <div key={cat} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{categoryLabels[cat]}</span>
                        <Badge variant={scoreBadgeVariant(score)} className="text-[10px]">
                          {score}
                        </Badge>
                      </div>
                      <Progress value={score} className="h-1.5" />
                    </div>
                  )
                })}
              </div>

              {topIssues.length > 0 && (
                <>
                  <Separator />
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold">Top Issues</p>
                    {topIssues.map(issue => (
                      <IssueCard key={issue.id} issue={issue} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="issues" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-[340px]">
            <div className="p-4">
              {report.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No issues found.</p>
              ) : (
                <Accordion type="multiple" className="flex flex-col gap-1">
                  {categoryOrder.map(cat => {
                    const issues = issuesByCategory[cat]
                    if (issues.length === 0) return null
                    return (
                      <AccordionItem key={cat} value={cat} className="border rounded-lg px-3">
                        <AccordionTrigger className="text-xs py-2 hover:no-underline">
                          <span className="flex items-center gap-2">
                            {categoryLabels[cat]}
                            <Badge variant="secondary" className="text-[10px]">
                              {issues.length}
                            </Badge>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          <div className="flex flex-col gap-2">
                            {issues.map(issue => (
                              <IssueCard key={issue.id} issue={issue} />
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )
                  })}
                </Accordion>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="copy" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-[340px]">
            <div className="p-4">
              <Accordion type="multiple" defaultValue={['headlines']} className="flex flex-col gap-1">
                {extracted.headlines.length > 0 && (
                  <StringListSection value="headlines" label="Headlines" items={extracted.headlines} />
                )}
                {extracted.ctas.length > 0 && (
                  <StringListSection value="ctas" label="CTAs" items={extracted.ctas} />
                )}
                {extracted.valueProps.length > 0 && (
                  <StringListSection value="valueProps" label="Value Props" items={extracted.valueProps} />
                )}
                {extracted.bodyText && (
                  <AccordionItem value="bodyText" className="border rounded-lg px-3">
                    <AccordionTrigger className="text-xs py-2 hover:no-underline">Body Text</AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {truncate(extracted.bodyText, 1200)}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  )
}

interface StringListSectionProps {
  value: string
  label: string
  items: string[]
}

function StringListSection({ value, label, items }: StringListSectionProps) {
  return (
    <AccordionItem value={value} className="border rounded-lg px-3">
      <AccordionTrigger className="text-xs py-2 hover:no-underline">
        <span className="flex items-center gap-2">
          {label}
          <Badge variant="secondary" className="text-[10px]">
            {items.length}
          </Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-3">
        <ul className="flex flex-col gap-1">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-muted-foreground border-l-2 pl-2">
              {item}
            </li>
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  )
}
