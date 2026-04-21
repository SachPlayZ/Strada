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
  // Node names must not collide with state channel names in LangGraph v1,
  // so every node is suffixed `_node`.
  return new StateGraph(AnalysisState)
    .addNode('valueProp_node', valuePropNode)
    .addNode('cta_node', ctaNode)
    .addNode('jargon_node', jargonNode)
    .addNode('tone_node', toneNode)
    .addNode('readability_node', readabilityNode)
    .addNode('aggregator_node', aggregatorNode)
    .addEdge(START, 'valueProp_node')
    .addEdge(START, 'cta_node')
    .addEdge(START, 'jargon_node')
    .addEdge(START, 'tone_node')
    .addEdge(START, 'readability_node')
    .addEdge('valueProp_node', 'aggregator_node')
    .addEdge('cta_node', 'aggregator_node')
    .addEdge('jargon_node', 'aggregator_node')
    .addEdge('tone_node', 'aggregator_node')
    .addEdge('readability_node', 'aggregator_node')
    .addEdge('aggregator_node', END)
    .compile()
}

export async function analyzeExtractedCopy(extracted: ExtractedCopy) {
  const graph = buildGraph()
  const state = await graph.invoke({ extracted })
  return state.report
}
