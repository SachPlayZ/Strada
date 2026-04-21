import { Annotation } from '@langchain/langgraph'
import type { ExtractedCopy, NodeResult, AnalysisReport } from '../types'

export const AnalysisState = Annotation.Root({
  extracted: Annotation<ExtractedCopy>({
    reducer: (_, next) => next,
  }),
  valueProp: Annotation<NodeResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  cta: Annotation<NodeResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  jargon: Annotation<NodeResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  tone: Annotation<NodeResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  readability: Annotation<NodeResult | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
  report: Annotation<AnalysisReport | undefined>({
    reducer: (_, next) => next,
    default: () => undefined,
  }),
})

export type AnalysisStateType = typeof AnalysisState.State
