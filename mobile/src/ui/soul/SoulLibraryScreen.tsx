import React, { useState, useMemo } from 'react';
import { View } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import {
  SOUL_CATEGORIES,
  type SoulCategory,
  type SoulDefinition,
} from '../../core/soulSchema.ts';
import {
  useSoulLibrary,
  getActiveSoul,
  setActiveSoul,
  deleteCustomSoul,
  duplicateSoul,
  toggleFavoriteSoul,
  importSoulJson,
  exportSoulJson,
} from '../../services/soulStore.ts';
import { BUILT_IN_SOULS } from '../../core/builtInSouls.ts';
import { showToast } from '../../services/toast.ts';
import { Button } from '../Button';
import { Card } from '../Card';
import { Field, SearchField } from '../Field';
import { goBack, push } from '../nav';
import { Screen } from '../Screen';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { SoulAvatarView } from './SoulAvatarView';

export function SoulLibraryScreen() {
  const { customSouls, favoriteIds } = useSoulLibrary();
  const activeSoul = getActiveSoul();
  const s = useStyles();
  const { colors } = useTheme();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');

  const allSouls = useMemo<SoulDefinition[]>(() => {
    const list: SoulDefinition[] = [...BUILT_IN_SOULS];
    for (const c of Object.values(customSouls)) {
      if (c) list.push(c as SoulDefinition);
    }
    return list;
  }, [customSouls]);

  const filteredSouls = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSouls.filter((soul) => {
      if (selectedCategory !== 'all' && soul.category !== selectedCategory) {
        return false;
      }
      if (q) {
        const matchName = soul.name.toLowerCase().includes(q);
        const matchTag = soul.tagline.toLowerCase().includes(q);
        const matchBg = soul.identity.background.toLowerCase().includes(q);
        if (!matchName && !matchTag && !matchBg) return false;
      }
      return true;
    });
  }, [allSouls, selectedCategory, search]);

  const handleDuplicate = (id: string) => {
    const cloned = duplicateSoul(id);
    if (cloned) {
      showToast(`Duplicated into "${cloned.name}".`);
      push('soul/studio', { soulId: cloned.id });
    }
  };

  const handleDelete = (id: string) => {
    if (deleteCustomSoul(id)) {
      showToast('Deleted custom soul.');
    }
  };

  const handleExport = (id: string) => {
    const json = exportSoulJson(id);
    if (json) {
      showToast('Exported soul JSON.');
    }
  };

  const handleImport = () => {
    const trimmed = importText.trim();
    if (!trimmed) return;
    const imported = importSoulJson(trimmed);
    if (imported) {
      showToast(`Imported "${imported.name}" successfully.`);
      setShowImport(false);
      setImportText('');
      push('soul/studio', { soulId: imported.id });
    } else {
      showToast('Invalid soul JSON format.');
    }
  };

  return (
    <Screen
      title="Soul Library"
      onBack={goBack}
      scroll
      right={
        <Button
          label="New Soul"
          variant="primary"
          onPress={() => push('soul/studio')}
        />
      }
    >
      <Text tone="muted">
        Reusable character templates and personas. Choose a persona for your chats or build your own.
      </Text>

      {/* Import Modal / Field */}
      {showImport ? (
        <Card style={s.importCard} framed>
          <Text variant="label">IMPORT PORTABLE SOUL JSON</Text>
          <Field
            label="JSON Document"
            multiline
            numberOfLines={4}
            value={importText}
            onChangeText={setImportText}
            placeholder="Paste exported Soul JSON here..."
          />
          <View style={s.importActions}>
            <Button label="Cancel" variant="quiet" onPress={() => setShowImport(false)} />
            <Button label="Import" variant="primary" onPress={handleImport} />
          </View>
        </Card>
      ) : (
        <View style={s.topActions}>
          <Button
            label="Import Soul JSON"
            variant="quiet"
            onPress={() => setShowImport(true)}
          />
          <Button
            label="Model Freedom Directives"
            variant="quiet"
            onPress={() => push('soul/freedom')}
          />
        </View>
      )}

      {/* Search Input */}
      <SearchField
        label="Search souls by name, role, background..."
        value={search}
        onChangeText={setSearch}
      />

      {/* Category filter chips */}
      <View style={s.categoryChips}>
        <Tag
          label="All"
          selected={selectedCategory === 'all'}
          onPress={() => setSelectedCategory('all')}
        />
        {SOUL_CATEGORIES.map((cat) => (
          <Tag
            key={cat}
            label={cat.charAt(0).toUpperCase() + cat.slice(1)}
            selected={selectedCategory === cat}
            onPress={() => setSelectedCategory(cat)}
          />
        ))}
      </View>

      {/* Soul Cards List */}
      <View style={s.soulList}>
        {filteredSouls.map((soul) => {
          const isActive = activeSoul.id === soul.id;
          const isFav = favoriteIds.includes(soul.id);
          const isBuiltIn = soul.type === 'builtin';

          return (
            <Card key={soul.id} style={s.soulCard} selected={isActive}>
              <View style={s.cardTop}>
                <SoulAvatarView avatar={soul.identity.avatar} size={48} name={soul.name} />
                <View style={s.cardMeta}>
                  <View style={s.titleRow}>
                    <Text variant="body" style={{ fontWeight: '600' }}>
                      {soul.name}
                    </Text>
                    {isActive ? <Tag label="ACTIVE" tone="accent" /> : null}
                  </View>
                  <Text variant="small" tone="muted" numberOfLines={2}>
                    {soul.tagline}
                  </Text>
                </View>
              </View>

              <View style={s.tagRow}>
                <Tag label={soul.category.toUpperCase()} />
                <Tag label={soul.type.toUpperCase()} />
                {isFav ? <Tag label="FAVORITE" tone="accent" /> : null}
              </View>

              <View style={s.cardActions}>
                {!isActive ? (
                  <Button
                    label="Set Active"
                    variant="primary"
                    onPress={() => {
                      setActiveSoul(soul.id);
                      showToast(`Set "${soul.name}" as active.`);
                    }}
                  />
                ) : null}

                <Button
                  label="Studio"
                  variant="quiet"
                  onPress={() => push('soul/studio', { soulId: soul.id })}
                />

                <Button
                  label="Duplicate"
                  variant="quiet"
                  onPress={() => handleDuplicate(soul.id)}
                />

                <Button
                  label={isFav ? 'Unfavorite' : 'Favorite'}
                  variant="quiet"
                  onPress={() => toggleFavoriteSoul(soul.id)}
                />

                {!isBuiltIn ? (
                  <Button
                    label="Delete"
                    variant="danger"
                    onPress={() => handleDelete(soul.id)}
                  />
                ) : null}
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ space }) => ({
  topActions: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  importCard: {
    gap: space.sm,
    marginTop: space.sm,
  },
  importActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  categoryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.sm,
  },
  soulList: {
    gap: space.md,
    marginTop: space.md,
  },
  soulCard: {
    gap: space.sm,
    padding: space.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  cardMeta: {
    flex: 1,
    gap: space.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  tagRow: {
    flexDirection: 'row',
    gap: space.xs,
    flexWrap: 'wrap',
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
}));
