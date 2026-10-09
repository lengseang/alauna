import React, { useState, useMemo } from 'react';
import { View } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import {
  useKnowledgeGraph,
  addGraphNode,
  addGraphEdge,
  clearGraphStore,
} from '../../services/graphStore.ts';
import type { GraphNode, GraphEdge } from '../../core/knowledgeGraph.ts';
import { Button } from '../Button';
import { Card } from '../Card';
import { Field, SearchField } from '../Field';
import { goBack } from '../nav';
import { Screen } from '../Screen';
import { Tag } from '../Tag';
import { Text } from '../Text';

export function KnowledgeGraphScreen() {
  const { graph } = useKnowledgeGraph();
  const s = useStyles();
  const { colors } = useTheme();

  const [search, setSearch] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [predicate, setPredicate] = useState('knows');
  const [object, setObject] = useState('');

  const nodesList = useMemo<GraphNode[]>(() => Object.values(graph.nodes), [graph.nodes]);
  const edgesList = useMemo<GraphEdge[]>(() => Object.values(graph.edges), [graph.edges]);

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nodesList;
    return nodesList.filter(
      (n) => n.label.toLowerCase().includes(q) || n.category.toLowerCase().includes(q),
    );
  }, [nodesList, search]);

  const handleAddTriple = () => {
    const subLabel = subject.trim();
    const predLabel = predicate.trim();
    const objLabel = object.trim();
    if (!subLabel || !predLabel || !objLabel) return;

    const source = addGraphNode({
      id: `node_${subLabel.toLowerCase().replace(/\s+/g, '_')}`,
      label: subLabel,
      category: 'concept',
      aliases: [],
      attributes: {},
    });

    const target = addGraphNode({
      id: `node_${objLabel.toLowerCase().replace(/\s+/g, '_')}`,
      label: objLabel,
      category: 'concept',
      aliases: [],
      attributes: {},
    });

    addGraphEdge({
      source: source.id,
      target: target.id,
      relation: predLabel,
      weight: 1.0,
    });

    setSubject('');
    setObject('');
    setShowAddForm(false);
  };

  return (
    <Screen
      title="Knowledge Brain"
      onBack={goBack}
      scroll
      right={
        <Button
          label={showAddForm ? 'Close' : 'Add Triple'}
          variant="quiet"
          onPress={() => setShowAddForm(!showAddForm)}
        />
      }
    >
      <Text tone="muted">
        Local-first knowledge graph ("Graphify"). Connects entity facts, preferences, and world knowledge
        without inflating LLM token contexts.
      </Text>

      {/* Stats Cards */}
      <View style={s.statsRow}>
        <Card style={s.statCard}>
          <Text variant="heading">{nodesList.length}</Text>
          <Text variant="small" tone="muted">
            Entities
          </Text>
        </Card>
        <Card style={s.statCard}>
          <Text variant="heading">{edgesList.length}</Text>
          <Text variant="small" tone="muted">
            Connections
          </Text>
        </Card>
        <Card style={s.statCard}>
          <Text variant="heading">On-Device</Text>
          <Text variant="small" tone="muted">
            Zero Network
          </Text>
        </Card>
      </View>

      {/* Add Triple Panel */}
      {showAddForm ? (
        <Card style={s.addCard} framed>
          <Text variant="label">ADD KNOWLEDGE CONNECTION</Text>
          <Field
            label="Subject"
            hint="Entity name (e.g. Leng, Python, Coffee)"
            value={subject}
            onChangeText={setSubject}
          />
          <Field
            label="Predicate"
            hint="Relationship (e.g. livesIn, createdBy, prefers)"
            value={predicate}
            onChangeText={setPredicate}
          />
          <Field
            label="Object"
            hint="Target entity or fact value"
            value={object}
            onChangeText={setObject}
          />
          <Button label="Save Connection" variant="primary" onPress={handleAddTriple} />
        </Card>
      ) : null}

      {/* Search Field */}
      <SearchField
        label="Search entities..."
        value={search}
        onChangeText={setSearch}
      />

      {/* Graph Items List */}
      <View style={s.nodeList}>
        {filteredNodes.length === 0 ? (
          <Card style={s.emptyCard}>
            <Text tone="muted" style={{ textAlign: 'center' }}>
              {nodesList.length === 0
                ? 'Knowledge graph is empty. Add a connection above or chat with CHIWIWI.'
                : 'No entities match search.'}
            </Text>
          </Card>
        ) : (
          filteredNodes.map((n) => {
            const outgoingEdges = edgesList.filter((e) => e.source === n.id);
            return (
              <Card key={n.id} style={s.nodeCard}>
                <View style={s.nodeHeader}>
                  <Text variant="body" style={{ fontWeight: '600' }}>
                    {n.label}
                  </Text>
                  <Tag label={n.category.toUpperCase()} tone="accent" />
                </View>

                {outgoingEdges.length > 0 ? (
                  <View style={s.edgeContainer}>
                    {outgoingEdges.map((e) => {
                      const tgt = graph.nodes[e.target];
                      return (
                        <View key={e.id} style={s.edgeRow}>
                          <Text variant="small" tone="muted">
                            --[{e.relation}]--{'>'}
                          </Text>
                          <Text variant="small" style={{ fontWeight: '600' }}>
                            {tgt ? tgt.label : e.target}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text variant="small" tone="muted">
                    No active connections
                  </Text>
                )}
              </Card>
            );
          })
        )}
      </View>

      {/* Graph Actions */}
      {nodesList.length > 0 ? (
        <View style={s.footer}>
          <Button
            label="Clear Knowledge Graph"
            variant="danger"
            onPress={clearGraphStore}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles(({ space, colors }) => ({
  statsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: space.md,
  },
  addCard: {
    gap: space.md,
    marginTop: space.md,
  },
  nodeList: {
    gap: space.sm,
    marginTop: space.md,
  },
  emptyCard: {
    padding: space.xl,
    alignItems: 'center',
  },
  nodeCard: {
    padding: space.md,
    gap: space.sm,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  edgeContainer: {
    gap: space.xs,
    paddingLeft: space.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.borderStrong,
  },
  edgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  footer: {
    marginTop: space.xl,
    marginBottom: space.lg,
  },
}));
