import React, { useState, useMemo } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
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
import { Divider } from '../Divider';
import { Field, SearchField } from '../Field';
import { goBack, push, resetTo } from '../nav';
import { Row } from '../Row';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { SoulAvatarView } from './SoulAvatarView';

type FilterTab = 'all' | 'female' | 'male' | 'nsfw' | 'romance' | 'archetype';
type SortOption = 'featured' | 'intimacy' | 'name';

const SORT_LABELS: Record<SortOption, string> = {
  featured: 'Featured',
  intimacy: 'Intimacy',
  name: 'A-Z',
};

export function SoulLibraryScreen() {
  const { customSouls, favoriteIds } = useSoulLibrary();
  const activeSoul = getActiveSoul();
  const s = useStyles();
  const { colors } = useTheme();

  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [sortOpen, setSortOpen] = useState(false);
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

      {/* Compact Search Field */}
      <SearchField
        label="Search companions"
        value={search}
        onChangeText={setSearch}
      />

      {/* Sleek Horizontal Filter Pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={s.chipScroll}
        contentContainerStyle={s.chips}
      >
        <Tag label="All" selected={filterTab === 'all'} onPress={() => setFilterTab('all')} tone={filterTab === 'all' ? 'accent' : undefined} />
        <Tag label="♀ Female" selected={filterTab === 'female'} onPress={() => setFilterTab('female')} tone={filterTab === 'female' ? 'accent' : undefined} />
        <Tag label="♂ Male" selected={filterTab === 'male'} onPress={() => setFilterTab('male')} tone={filterTab === 'male' ? 'accent' : undefined} />
        <Tag label="18+ Explicit" selected={filterTab === 'nsfw'} onPress={() => setFilterTab('nsfw')} tone={filterTab === 'nsfw' ? 'accent' : undefined} />
        <Tag label="Romance" selected={filterTab === 'romance'} onPress={() => setFilterTab('romance')} tone={filterTab === 'romance' ? 'accent' : undefined} />
        <Tag label="Archetypes" selected={filterTab === 'archetype'} onPress={() => setFilterTab('archetype')} tone={filterTab === 'archetype' ? 'accent' : undefined} />
      </ScrollView>

      {/* Compact Meta & Sort Bar */}
      <View style={s.metaBar}>
        <Text variant="small" tone="muted">
          {`${filteredSouls.length} ${filteredSouls.length === 1 ? 'companion' : 'companions'}`}
        </Text>
        <Pressable
          style={({ pressed }) => [s.sortPill, pressed && { opacity: 0.7 }]}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort by: ${SORT_LABELS[sortOption]}`}
        >
          <Icon name="sort" size={12} color={colors.accent} />
          <Text variant="small" tone="accent">{SORT_LABELS[sortOption]}</Text>
          <Icon name="chevron" size={10} color={colors.accent} rotate={90} />
        </Pressable>
      </View>

      {/* Encapsulated Companion Cards */}
      <View style={s.soulList}>
        {filteredSouls.map((soul) => {
          const isActive = activeSoul.id === soul.id;
          const isFav = favoriteIds.includes(soul.id);
          const isBuiltIn = soul.type === 'builtin';
          const gender = soul.identity.gender;
          const intimacy = soul.identity.intimacyLevel;

          return (
            <Card key={soul.id} style={s.modelCard} selected={isActive}>
              {/* Top Hero Row: Avatar + Name + Badges */}
              <View style={s.cardHero}>
                <Pressable
                  style={s.avatarWrapper}
                  onPress={() => handlePickAvatar(soul.id, soul.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Update photo for ${soul.name}`}
                >
                  <SoulAvatarView
                    avatar={soul.identity.avatar}
                    soulId={soul.id}
                    size={52}
                    name={soul.name}
                  />
                  <View style={s.photoBadgeSmall}>
                    <Icon name="camera" size={10} color={colors.accent} />
                  </View>
                </Pressable>

                <View style={s.heroDetails}>
                  <View style={s.nameRow}>
                    <Text variant="strong" style={s.nameText}>
                      {soul.name}
                    </Text>
                    <View style={s.tagCluster}>
                      {gender === 'female' ? <Tag label="♀" /> : gender === 'male' ? <Tag label="♂" /> : null}
                      {intimacy === 'explicit' ? (
                        <Tag label="18+" tone="danger" />
                      ) : intimacy === 'passionate' ? (
                        <Tag label="Sensual" tone="accent" />
                      ) : null}
                      {isActive ? <Tag label="ACTIVE" tone="accent" /> : null}
                    </View>
                  </View>

                  <Text variant="small" tone="muted" numberOfLines={2} style={s.taglineText}>
                    {soul.tagline}
                  </Text>
                </View>
              </View>

              {/* Encapsulated Bottom Row: Setting hint + Action buttons */}
              <View style={s.cardBottomRow}>
                {soul.identity.setting ? (
                  <Text variant="small" tone="muted" numberOfLines={1} style={s.settingSnippet}>
                    ✦ {soul.identity.setting}
                  </Text>
                ) : (
                  <View style={{ flex: 1 }} />
                )}

                <View style={s.cardActions}>
                  {isActive ? (
                    <Button
                      label="Chat"
                      variant="primary"
                      onPress={() => resetTo('chat')}
                    />
                  ) : (
                    <Button
                      label="Choose"
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

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={isFav ? 'Remove favorite' : 'Add favorite'}
                    onPress={() => toggleFavoriteSoul(soul.id)}
                    style={({ pressed }) => [s.favBtn, isFav && s.favBtnActive, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={[s.favIcon, { color: isFav ? colors.accent : colors.muted }]}>
                      {isFav ? '★' : '☆'}
                    </Text>
                  </Pressable>

                  {!isBuiltIn ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete custom companion"
                      onPress={() => handleDelete(soul.id)}
                      style={({ pressed }) => [s.deleteBtn, pressed && { opacity: 0.7 }]}
                    >
                      <Icon name="trash" size={14} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </Card>
          );
        })}
      </View>

      {/* Sort Sheet Modal */}
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort companions">
        <Row
          title="Featured"
          subtitle="Active companion and favorites first"
          selected={sortOption === 'featured'}
          onPress={() => {
            setSortOption('featured');
            setSortOpen(false);
          }}
        />
        <Divider />
        <Row
          title="Intimacy Level"
          subtitle="Explicit (18+) and passionate companions first"
          selected={sortOption === 'intimacy'}
          onPress={() => {
            setSortOption('intimacy');
            setSortOpen(false);
          }}
        />
        <Divider />
        <Row
          title="Name (A-Z)"
          subtitle="Alphabetical order"
          selected={sortOption === 'name'}
          onPress={() => {
            setSortOption('name');
            setSortOpen(false);
          }}
        />
      </Sheet>
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
  chipScroll: {
    marginHorizontal: -space.lg,
    flexGrow: 0,
    marginTop: space.xs,
  },
  chips: {
    paddingHorizontal: space.lg,
    gap: space.xs,
    alignItems: 'center',
  },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: line,
    borderColor: colors.border,
  },
  soulList: {
    gap: space.sm,
    marginTop: space.xs,
  },
  modelCard: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
  },
  cardHero: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
  },
  avatarWrapper: {
    position: 'relative',
  },
  photoBadgeSmall: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDetails: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.xs,
  },
  nameText: {
    fontSize: 16,
    letterSpacing: 0.2,
  },
  tagCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  taglineText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 1,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingTop: space.xs,
    borderTopWidth: line,
    borderTopColor: colors.border,
  },
  settingSnippet: {
    flex: 1,
    fontSize: 11,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  favBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: line,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favBtnActive: {
    borderColor: colors.accent,
  },
  favIcon: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: line,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
