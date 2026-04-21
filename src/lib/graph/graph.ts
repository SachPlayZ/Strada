import { StateGraph, START, END } from '@langchain/langgraph'
import { AnalysisState } from './state'
import { valuePropNode } from './nodes/valueProp'
import { ctaNode } from './nodes/cta'
import { jargonNode } from './nodes/jargon'
import { toneNode } from './nodes/tone'
import { readabilityNode } from './nodes/readability'
import { aggregatorNode } from './nodes/aggregator'
import type { ExtractedCopy } from '../types'

export function buildGraph() {
  return new StateGraph(AnalysisState)
    .addNode('valueProp', valuePropNode)
    .addNode('cta', ctaNode)
    .addNode('jargon', jargonNode)
    .addNode('tone', toneNode)
    .addNode('readability', readabilityNode)
    .addNode('aggregator', aggregatorNode)
    .addEdge(START, 'valueProp')
    .addEdge(START, 'cta')
    .addEdge(START, 'jargon')
    .addEdge(START, 'tone')
    .addEdge(START, 'readability')
    .addEdge('valueProp', 'aggregator')
    .addEdge('cta', 'aggregator')
    .addEdge('jargon', 'aggregator')
    .addEdge('tone', 'aggregator')
    .addEdge('readability', 'aggregator')
    .addEdge('aggregator', END)
    .compile()
}

export async function analyzeExtractedCopy(extracted: ExtractedCopy) {
  const graph = buildGraph()
  const state = await graph.invoke({ extracted })
  return state.report
}
