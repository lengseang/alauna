import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyGraph,
  upsertNode,
  upsertEdge,
  removeNode,
  matchEntitiesInText,
  querySubgraph,
  formatTriplesForPrompt,
  sanitizeGraph,
} from '../src/core/knowledgeGraph.ts';

test('knowledgeGraph: upsert nodes and edges with adjacency tracking', () => {
  const g = createEmptyGraph();
  const n1 = upsertNode(g, { id: 'ent_user', label: 'User', category: 'person', aliases: ['Leng', 'Seang'], attributes: {} });
  const n2 = upsertNode(g, { id: 'ent_chiwiwi', label: 'Chiwiwi', category: 'project', aliases: ['the app'], attributes: { version: '2.0' } });
  const n3 = upsertNode(g, { id: 'ent_s23', label: 'Galaxy S23 Ultra', category: 'system', aliases: ['S23', 'phone'], attributes: {} });

  assert.equal(Object.keys(g.nodes).length, 3);
  assert.equal(n1.accessCount, 1);

  const e1 = upsertEdge(g, { source: 'ent_user', target: 'ent_chiwiwi', relation: 'builds', weight: 0.95 });
  const e2 = upsertEdge(g, { source: 'ent_chiwiwi', target: 'ent_s23', relation: 'runs_on', weight: 0.9 });

  assert.ok(e1);
  assert.ok(e2);
  assert.deepEqual(g.outEdges['ent_user'], [e1.id]);
  assert.deepEqual(g.inEdges['ent_chiwiwi'], [e1.id]);
  assert.deepEqual(g.outEdges['ent_chiwiwi'], [e2.id]);
});

test('knowledgeGraph: entity matching identifies aliases in text', () => {
  const g = createEmptyGraph();
  upsertNode(g, { id: 'ent_user', label: 'User', category: 'person', aliases: ['Leng Seang'], attributes: {} });
  upsertNode(g, { id: 'ent_s23', label: 'Galaxy S23 Ultra', category: 'system', aliases: ['S23'], attributes: {} });

  const matched = matchEntitiesInText(g, 'Did Leng Seang install the release APK on S23?');
  const ids = matched.map((m) => m.id).sort();
  assert.deepEqual(ids, ['ent_s23', 'ent_user']);
});

test('knowledgeGraph: querySubgraph traverses 1-to-2 hops and extracts relevant triples', () => {
  const g = createEmptyGraph();
  upsertNode(g, { id: 'ent_user', label: 'User', category: 'person', aliases: [], attributes: {} });
  upsertNode(g, { id: 'ent_chiwiwi', label: 'Chiwiwi', category: 'project', aliases: [], attributes: {} });
  upsertNode(g, { id: 'ent_llama', label: 'llama.rn', category: 'system', aliases: [], attributes: {} });

  upsertEdge(g, { source: 'ent_user', target: 'ent_chiwiwi', relation: 'creates', weight: 0.9 });
  upsertEdge(g, { source: 'ent_chiwiwi', target: 'ent_llama', relation: 'integrates', weight: 0.95 });

  // 1-hop query around "Chiwiwi"
  const triples1 = querySubgraph(g, 'Tell me about Chiwiwi architecture', { maxHops: 1 });
  assert.equal(triples1.length, 2);

  const promptBlock = formatTriplesForPrompt(triples1);
  assert.ok(promptBlock.includes('Chiwiwi (integrates) llama.rn'));
  assert.ok(promptBlock.includes('User (creates) Chiwiwi'));
});

test('knowledgeGraph: removing node cascades to connected edges', () => {
  const g = createEmptyGraph();
  upsertNode(g, { id: 'a', label: 'A', category: 'concept', aliases: [], attributes: {} });
  upsertNode(g, { id: 'b', label: 'B', category: 'concept', aliases: [], attributes: {} });
  upsertEdge(g, { source: 'a', target: 'b', relation: 'connects', weight: 1.0 });

  assert.equal(Object.keys(g.edges).length, 1);
  removeNode(g, 'a');
  assert.equal(Object.keys(g.nodes).length, 1);
  assert.equal(Object.keys(g.edges).length, 0);
  assert.equal(g.inEdges['b'].length, 0);
});

test('knowledgeGraph: sanitizeGraph recovers valid graph from arbitrary JSON', () => {
  const raw = {
    nodes: {
      n1: { label: 'Node 1', category: 'lore', aliases: ['One'], attributes: { key: 'val' } },
      bad: null,
    },
    edges: {
      e1: { source: 'n1', target: 'n1', relation: 'loops', weight: 0.5 },
      eBad: { source: 123 },
    },
  };
  const g = sanitizeGraph(raw);
  assert.equal(Object.keys(g.nodes).length, 1);
  assert.equal(Object.keys(g.edges).length, 1);
  assert.equal(g.nodes['n1'].label, 'Node 1');
});
