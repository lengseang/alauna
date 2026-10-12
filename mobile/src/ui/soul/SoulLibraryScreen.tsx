import React, { useState, useMemo } from 'react';
import { View, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { makeStyles, useTheme } from '../../theme';
import type { SoulDefinition } from '../../core/soulSchema.ts';
import {
  useSoulLibrary,
  getActiveSoul,
  setActiveSoul,
  updateSoulAvatar,
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
import { goBack, push, resetTo } from '../nav';
import { Screen } from '../Screen';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { SoulAvatarView } from './SoulAvatarView';

type FilterTab = 'all' | 'female' | 'male' | 'nsfw' | 'romance' | 'archetype';
type SortOption = 'featured' | 'intimacy' | 'name';

export function SoulLibraryScreen() {
  const { customSouls, favoriteIds } = useSoulLibrary();
  const activeSoul = getActiveSoul();
  const s = useStyles();
  const { colors } = useTheme();

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortOption, setSortOption] = useState<SortOption>('featured');
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

    const matches = allSouls.filter((soul) => {
      // Category / Gender filter
      if (filterTab === 'female') {
        if (soul.identity.gender !== 'female') return false;
      } else if (filterTab === 'male') {
        if (soul.identity.gender !== 'male') return false;
      } else if (filterTab === 'nsfw') {
        const isExplicit =
          soul.identity.intimacyLevel === 'explicit' ||
          soul.speech.slangProfanity === 'unfiltered' ||
          soul.id === 'soul_seraphina' ||
          soul.id === 'soul_dante';
        if (!isExplicit) return false;
      } else if (filterTab === 'romance') {
        const isRomance =
          soul.category === 'companion' ||
          soul.identity.intimacyLevel === 'passionate' ||
          soul.identity.intimacyLevel === 'romantic';
        if (!isRomance) return false;
      } else if (filterTab === 'archetype') {
        if (soul.category === 'companion') return false;
      }

      // Text query
      if (q) {
        const matchName = soul.name.toLowerCase().includes(q);
        const matchTag = soul.tagline.toLowerCase().includes(q);
        const matchBg = soul.identity.background.toLowerCase().includes(q);
        const matchSetting = soul.identity.setting.toLowerCase().includes(q);
        if (!matchName && !matchTag && !matchBg && !matchSetting) return false;
      }
      return true;
    });

    // Sorting
    return matches.sort((a, b) => {
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortOption === 'intimacy') {
        const rank = (s: SoulDefinition) => {
          if (s.identity.intimacyLevel === 'explicit') return 4;
          if (s.identity.intimacyLevel === 'passionate') return 3;
          if (s.identity.intimacyLevel === 'romantic') return 2;
          return 1;
        };
        return rank(b) - rank(a);
      }
      // 'featured'
      const isFavA = favoriteIds.includes(a.id) ? 1 : 0;
      const isFavB = favoriteIds.includes(b.id) ? 1 : 0;
      if (isFavB !== isFavA) return isFavB - isFavA;
      return 0;
    });
  }, [allSouls, filterTab, search, sortOption, favoriteIds]);

  const handlePickAvatar = async (soulId: string, soulName: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        updateSoulAvatar(soulId, uri);
        showToast(`Updated portrait for ${soulName}!`);
      }
    } catch {
      showToast('Could not access image library.');
    }
  };

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
      title="Companions & Souls"
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
        Curated AI companions and roleplay personas. Choose your partner, pick custom portraits, or create your own persona.
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

      {/* Compact Search Bar */}
      <SearchField
        label="Search companions by name, romance style, setting..."
        value={search}
        onChangeText={setSearch}
      />

      {/* Filter and Sort Pills */}
      <View style={s.controlsRow}>
        <View style={s.filterRow}>
          <Tag
            label="All"
            selected={filterTab === 'all'}
            onPress={() => setFilterTab('all')}
          />
          <Tag
            label="♀ Female"
            selected={filterTab === 'female'}
            onPress={() => setFilterTab('female')}
          />
          <Tag
            label="♂ Male"
            selected={filterTab === 'male'}
            onPress={() => setFilterTab('male')}
          />
          <Tag
            label="18+ Explicit"
            selected={filterTab === 'nsfw'}
            onPress={() => setFilterTab('nsfw')}
          />
          <Tag
            label="Romance"
            selected={filterTab === 'romance'}
            onPress={() => setFilterTab('romance')}
          />
          <Tag
            label="Archetypes"
            selected={filterTab === 'archetype'}
            onPress={() => setFilterTab('archetype')}
          />
        </View>

        <View style={s.sortRow}>
          <Text variant="small" tone="muted">Sort:</Text>
          <Tag
            label="Featured"
            selected={sortOption === 'featured'}
            onPress={() => setSortOption('featured')}
          />
          <Tag
            label="Intimacy"
            selected={sortOption === 'intimacy'}
            onPress={() => setSortOption('intimacy')}
          />
          <Tag
            label="A-Z"
            selected={sortOption === 'name'}
            onPress={() => setSortOption('name')}
          />
        </View>
      </View>

      {/* Companion Model Cards */}
      <View style={s.soulList}>
        {filteredSouls.map((soul) => {
          const isActive = activeSoul.id === soul.id;
          const isFav = favoriteIds.includes(soul.id);
          const isBuiltIn = soul.type === 'builtin';
          const gender = soul.identity.gender;
          const intimacy = soul.identity.intimacyLevel;

          return (
            <Card
              key={soul.id}
              style={s.modelCard}
              selected={isActive}
            >
              {/* Card Header & Avatar Area */}
              <View style={s.cardHero}>
                <View style={s.avatarContainer}>
                  <SoulAvatarView
                    avatar={soul.identity.avatar}
                    size={64}
                    name={soul.name}
                    onPress={() => handlePickAvatar(soul.id, soul.name)}
                  />
                  <Pressable
                    style={s.photoBadge}
                    onPress={() => handlePickAvatar(soul.id, soul.name)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`Choose photo for ${soul.name}`}
                  >
                    <Icon name="camera" size={14} color={colors.accent} />
                    <Text variant="small" style={{ fontSize: 10, color: colors.accent, fontWeight: '700' }}>
                      PHOTO
                    </Text>
                  </Pressable>
                </View>

                <View style={s.heroDetails}>
                  <View style={s.nameRow}>
                    <Text variant="body" style={{ fontWeight: '700', fontSize: 17 }}>
                      {soul.name}
                    </Text>
                    {isActive ? (
                      <Tag label="ACTIVE COMPANION" tone="accent" />
                    ) : null}
                  </View>

                  <View style={s.badgePills}>
                    {gender === 'female' ? (
                      <Tag label="♀ Female" />
                    ) : gender === 'male' ? (
                      <Tag label="♂ Male" />
                    ) : null}

                    {intimacy === 'explicit' ? (
                      <Tag label="18+ Explicit" tone="danger" />
                    ) : intimacy === 'passionate' ? (
                      <Tag label="Sensual" tone="accent" />
                    ) : intimacy === 'romantic' ? (
                      <Tag label="Romance" />
                    ) : null}

                    {isFav ? <Tag label="★ Favorite" tone="accent" /> : null}
                  </View>

                  {soul.identity.setting ? (
                    <Text variant="small" tone="muted" numberOfLines={1} style={s.settingText}>
                      ✦ {soul.identity.setting}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* Tagline / Premise */}
              <View style={s.taglineBox}>
                <Text variant="small" tone="muted" numberOfLines={3} style={{ fontStyle: 'italic', lineHeight: 18 }}>
                  &ldquo;{soul.tagline}&rdquo;
                </Text>
              </View>

              {/* Action Buttons */}
              <View style={s.cardActions}>
                {isActive ? (
                  <Button
                    label="Chat Now"
                    variant="primary"
                    onPress={() => resetTo('chat')}
                  />
                ) : (
                  <Button
                    label="Set Active"
                    variant="primary"
                    onPress={() => {
                      setActiveSoul(soul.id);
                      showToast(`Set "${soul.name}" as active companion.`);
                    }}
                  />
                )}

                <Button
                  label="Studio"
                  variant="quiet"
                  onPress={() => push('soul/studio', { soulId: soul.id })}
                />

                <Button
                  label={isFav ? '★ Saved' : '☆ Favorite'}
                  variant="quiet"
                  onPress={() => toggleFavoriteSoul(soul.id)}
                />

                <Button
                  label="Duplicate"
                  variant="quiet"
                  onPress={() => handleDuplicate(soul.id)}
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

const useStyles = makeStyles(({ space, colors, radius, line }) => ({
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
  controlsRow: {
    gap: space.sm,
    marginTop: space.sm,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    flexWrap: 'wrap',
  },
  soulList: {
    gap: space.md,
    marginTop: space.md,
  },
  modelCard: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  cardHero: {
    flexDirection: 'row',
    gap: space.md,
  },
  avatarContainer: {
    alignItems: 'center',
    gap: space.xs,
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: line,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  heroDetails: {
    flex: 1,
    gap: space.xs,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  badgePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  settingText: {
    marginTop: 2,
  },
  taglineBox: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.xs,
    backgroundColor: colors.surfaceAlt,
  },
  cardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
    alignItems: 'center',
  },
}));
