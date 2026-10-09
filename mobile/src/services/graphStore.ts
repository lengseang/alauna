/**
 * Persisted On-Device Knowledge Graph ("Graphify") Store.
 *
 * Provides reactive observable store for in-memory graph operations,
 * atomic local JSON persistence, and fast context retrieval.
 */
import { useSyncExternalStore } from 'react';
import { Paths } from 'expo-file-system';
import { createStore } from '../core/store.ts';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { directoryIO } from './atomicIo.ts';
import type { KnowledgeGraph, GraphNode, GraphEdge, SubgraphTriple } from '../core/knowledgeGraph.ts';
import {
  createEmptyGraph,
  upsertNode,
  upsertEdge,
  removeNode,
  querySubgraph,
  sanitizeGraph,
} from '../core/knowledgeGraph.ts';

export const GRAPH_FILE = 'chiwiwi_knowledge_graph.json';

export interface GraphStoreState {
  graph: KnowledgeGraph;
  loaded: boolean;
}

export const graphStore = createStore<GraphStoreState>({
  graph: createEmptyGraph(),
  loaded: false,
});

const io = () => directoryIO(() => Paths.document);

let writeTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon(): void {
  if (writeTimer) return;
  writeTimer = setTimeout(() => {
    writeTimer = null;
    try {
      writeAtomic(io(), GRAPH_FILE, JSON.stringify(graphStore.getState().graph));
    } catch {
      // Storage write error handled gracefully
    }
  }, 500);
}

let loadPromise: Promise<void> | null = null;
export function initGraphStore(): Promise<void> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const parsed = await readWithFallback(io(), GRAPH_FILE, (text) => {
          try {
            return sanitizeGraph(JSON.parse(text));
          } catch {
            return null;
          }
        });
        if (parsed) {
          graphStore.setState({ graph: parsed, loaded: true });
          return;
        }
      } catch {
        // Fallback to empty graph
      }
      graphStore.setState({ graph: createEmptyGraph(), loaded: true });
    })();
  }
  return loadPromise;
}

export function useKnowledgeGraph(): GraphStoreState {
  return useSyncExternalStore(graphStore.subscribe, graphStore.getState);
}

export function addGraphNode(node: Omit<GraphNode, 'lastAccessedAt' | 'accessCount' | 'createdAt'>): GraphNode {
  const g = { ...graphStore.getState().graph };
  const res = upsertNode(g, node);
  graphStore.setState({ graph: g });
  persistSoon();
  return res;
}

export function addGraphEdge(edge: Omit<GraphEdge, 'id' | 'createdAt'> & { id?: string }): GraphEdge | null {
  const g = { ...graphStore.getState().graph };
  const res = upsertEdge(g, edge);
  graphStore.setState({ graph: g });
  persistSoon();
  return res;
}

export function deleteGraphNode(nodeId: string): void {
  const g = { ...graphStore.getState().graph };
  removeNode(g, nodeId);
  graphStore.setState({ graph: g });
  persistSoon();
}

/**
 * Fast subgraph lookup for context prompt injection.
 */
export function queryGraphContext(text: string, options: { maxTriples?: number; maxHops?: number } = {}): SubgraphTriple[] {
  return querySubgraph(graphStore.getState().graph, text, options);
}

export function clearGraphStore(): void {
  graphStore.setState({ graph: createEmptyGraph() });
  persistSoon();
}

