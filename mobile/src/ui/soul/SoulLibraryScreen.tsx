import React, { useState, useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { makeStyles, useTheme } from '../../theme';
import {
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
  updateSoulAvatar,
} from '../../services/soulStore.ts';
import { BUILT_IN_SOULS } from '../../core/builtInSouls.ts';
import { getVoicePersona } from '../../core/voicePersonas.ts';
import { showToast } from '../../services/toast.ts';
import { Button } from '../Button';
import { Card } from '../Card';
import { Field, SearchField } from '../Field';
import { Segmented } from '../Segmented';
import { goBack, push, resetTo } from '../nav';
import { Screen } from '../Screen';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { Icon } from '../Icon';
import { SoulAvatarView } from './SoulAvatarView';

type FilterTab = 'all' | 'female' | 'male' | 'nsfw' | 'romance' | 'archetype' | 'custom';
type SortOption = 'featured' | 'favorite' | 'name';

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
      // 1. Tab filters
      if (filterTab === 'female' && soul.identity.gender !== 'female') return false;
      if (filterTab === 'male' && soul.identity.gender !== 'male') return false;
      if (filterTab === 'nsfw' && soul.identity.intimacyLevel !== 'explicit' && soul.identity.intimacyLevel !== 'passionate') return false;
      if (filterTab === 'romance' && soul.category !== 'companion' && soul.identity.intimacyLevel !== 'romantic' && soul.identity.intimacyLevel !== 'passionate') return false;
      if (filterTab === 'archetype' && soul.category === 'companion') return false;
      if (filterTab === 'custom' && soul.type !== 'custom') return false;

      // 2. Query search
      if (q) {
        const matchName = soul.name.toLowerCase().includes(q);
        const matchTag = soul.tagline.toLowerCase().includes(q);
        const matchBg = soul.identity.background?.toLowerCase().includes(q);
        const matchSetting = soul.identity.setting?.toLowerCase().includes(q);
        if (!matchName && !matchTag && !matchBg && !matchSetting) return false;
      }
      return true;
    });

    // 3. Sorting
    return matches.sort((a, b) => {
      if (sortOption === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortOption === 'favorite') {
        const aFav = favoriteIds.includes(a.id) ? 1 : 0;
        const bFav = favoriteIds.includes(b.id) ? 1 : 0;
        return bFav - aFav || a.name.localeCompare(b.name);
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

  const handleExport = (id: string) => {
    const json = exportSoulJson(id);
    if (json) {
      showToast('Exported soul JSON to clipboard.');
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

  const handleSelectSoul = (soul: SoulDefinition) => {
    setActiveSoul(soul.id);
    showToast(`"${soul.name}" is now your active partner.`);
  };

  const handleChatWithSoul = (soul: SoulDefinition) => {
    setActiveSoul(soul.id);
    showToast(`Chatting with ${soul.name}.`);
    resetTo('chat');
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
        Curated AI companions and roleplay personas with custom portraits, voice profiles, and adult intimacy.
      </Text>

      {/* Spotlight: Current Active Companion Hero Card */}
      {activeSoul ? (
        <Card style={s.heroCard} framed>
          <View style={s.heroTopRow}>
            <View style={s.heroBadgeWrap}>
              <View style={s.activeDot} />
              <Text variant="label" style={s.heroActiveText}>ACTIVE PARTNER</Text>
            </View>
            {activeSoul.identity.intimacyLevel === 'explicit' ? (
              <Tag label="18+ Adult" tone="danger" />
            ) : activeSoul.identity.intimacyLevel === 'passionate' ? (
              <Tag label="Sensual" tone="accent" />
            ) : null}
          </View>

          <View style={s.heroBody}>
            <Pressable
              onPress={() => handlePickAvatar(activeSoul.id, activeSoul.name)}
              accessibilityRole="button"
              accessibilityLabel={`Update photo for ${activeSoul.name}`}
              unstable_pressDelay={0}
              style={s.heroAvatarWrap}
            >
              <SoulAvatarView
                avatar={activeSoul.identity.avatar}
                soulId={activeSoul.id}
                size={68}
                name={activeSoul.name}
                active={true}
              />
              <View style={s.cameraBadge}>
                <Icon name="camera" size={10} color={colors.accent} />
              </View>
            </Pressable>

            <View style={s.heroContent}>
              <View style={s.heroNameRow}>
                <Text variant="heading" style={s.heroNameText}>
                  {activeSoul.name}
                </Text>
                {activeSoul.identity.gender === 'female' ? (
                  <Tag label="♀ Female" />
                ) : activeSoul.identity.gender === 'male' ? (
                  <Tag label="♂ Male" />
                ) : null}
              </View>
              <Text variant="small" tone="muted" numberOfLines={2} style={s.heroTagline}>
                {activeSoul.tagline}
              </Text>
              {(() => {
                const voicePersona = getVoicePersona(activeSoul.identity.voicePersonaId);
                return voicePersona ? (
                  <View style={s.heroVoiceTag}>
                    <Text variant="small" style={{ color: colors.accent, fontWeight: '600' }}>
                      🎙️ Voice: {voicePersona.name}
                    </Text>
                  </View>
                ) : null;
              })()}
            </View>
          </View>

          <View style={s.heroDivider} />

          <View style={s.heroActions}>
            <Button
              label="Start Chat"
              variant="primary"
              icon="chat"
              style={s.heroPrimaryBtn}
              onPress={() => handleChatWithSoul(activeSoul)}
            />
            <Button
              label="Studio"
              variant="quiet"
              icon="edit"
              onPress={() => push('soul/studio', { soulId: activeSoul.id })}
            />
          </View>
        </Card>
      ) : null}

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
            label="Directives"
            variant="quiet"
            onPress={() => push('soul/freedom')}
          />
        </View>
      )}

      {/* Search Bar & Sort Segment */}
      <View style={s.searchSortRow}>
        <View style={s.searchWrap}>
          <SearchField
            label="Search companions"
            placeholder="Search by name, personality..."
            value={search}
            onChangeText={setSearch}
          />
        </View>
        <View style={s.sortWrap}>
          <Segmented
            label="Sort companions"
            options={[
              { value: 'featured', label: 'All' },
              { value: 'favorite', label: '★ Fav' },
              { value: 'name', label: 'A-Z' },
            ]}
            value={sortOption}
            onChange={setSortOption}
          />
        </View>
      </View>

      {/* Horizontal Filter Chips */}
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
        <Tag label="18+ Adult" selected={filterTab === 'nsfw'} onPress={() => setFilterTab('nsfw')} tone={filterTab === 'nsfw' ? 'accent' : undefined} />
        <Tag label="Romance" selected={filterTab === 'romance'} onPress={() => setFilterTab('romance')} tone={filterTab === 'romance' ? 'accent' : undefined} />
        <Tag label="Archetypes" selected={filterTab === 'archetype'} onPress={() => setFilterTab('archetype')} tone={filterTab === 'archetype' ? 'accent' : undefined} />
        <Tag label="Custom" selected={filterTab === 'custom'} onPress={() => setFilterTab('custom')} tone={filterTab === 'custom' ? 'accent' : undefined} />
      </ScrollView>

      {/* Companions Library List */}
      <View style={s.soulList}>
        {filteredSouls.map((soul) => {
          const isActive = activeSoul?.id === soul.id;
          const isFav = favoriteIds.includes(soul.id);
          const isBuiltIn = soul.type === 'builtin';
          const gender = soul.identity.gender;
          const intimacy = soul.identity.intimacyLevel;
          const voicePersona = getVoicePersona(soul.identity.voicePersonaId);

          return (
            <Card
              key={soul.id}
              style={[s.modelCard, isActive && s.modelCardActive]}
              selected={isActive}
            >
              {/* Header: Portrait + Meta + Favorite Button */}
              <View style={s.cardHero}>
                <Pressable
                  style={s.avatarWrapper}
                  onPress={() => handlePickAvatar(soul.id, soul.name)}
                  accessibilityRole="button"
                  accessibilityLabel={`Update photo for ${soul.name}`}
                  unstable_pressDelay={0}
                >
                  <SoulAvatarView
                    avatar={soul.identity.avatar}
                    soulId={soul.id}
                    size={56}
                    name={soul.name}
                    active={isActive}
                  />
                  <View style={s.photoBadgeSmall}>
                    <Icon name="camera" size={9} color={colors.accent} />
                  </View>
                </Pressable>

                <View style={s.heroDetails}>
                  <View style={s.nameRow}>
                    <Text variant="strong" style={s.nameText} numberOfLines={1}>
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

                {/* Favorite Star Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isFav ? `Remove ${soul.name} from favorites` : `Add ${soul.name} to favorites`}
                  onPress={() => toggleFavoriteSoul(soul.id)}
                  unstable_pressDelay={0}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[s.favButton, isFav && s.favButtonActive]}
                >
                  <Text style={[s.favStar, { color: isFav ? colors.accent : colors.muted }]}>
                    {isFav ? '★' : '☆'}
                  </Text>
                </Pressable>
              </View>

              {/* Setting / Temperament Snippet */}
              {soul.identity.setting ? (
                <View style={s.settingBox}>
                  <Text variant="small" tone="muted" numberOfLines={2}>
                    <Text variant="small" style={{ color: colors.accent, fontWeight: '600' }}>
                      Setting:{' '}
                    </Text>
                    {soul.identity.setting}
                  </Text>
                </View>
              ) : null}

              {/* Voice Persona Indicator */}
              {voicePersona ? (
                <View style={s.voiceIndicatorRow}>
                  <Icon name="speaker" size={11} color={colors.accent} />
                  <Text variant="small" style={{ color: colors.accent, marginLeft: 4 }}>
                    Voice: {voicePersona.name}
                  </Text>
                </View>
              ) : null}

              {/* Hairline Divider */}
              <View style={s.cardDivider} />

              {/* Action Buttons */}
              <View style={s.cardActions}>
                {isActive ? (
                  <View style={s.activeActionRow}>
                    <Button
                      label="Chat Now"
                      variant="primary"
                      icon="chat"
                      style={s.fillButton}
                      onPress={() => handleChatWithSoul(soul)}
                    />
                  </View>
                ) : (
                  <View style={s.inactiveActionRow}>
                    <Button
                      label="Select Partner"
                      variant="primary"
                      style={s.selectButton}
                      onPress={() => handleSelectSoul(soul)}
                    />
                    <Button
                      label="Chat"
                      variant="quiet"
                      icon="chat"
                      style={s.chatButton}
                      onPress={() => handleChatWithSoul(soul)}
                    />
                  </View>
                )}

                {/* Auxiliary tools */}
                <View style={s.toolsRow}>
                  <Button
                    label="Studio"
                    variant="quiet"
                    icon="edit"
                    onPress={() => push('soul/studio', { soulId: soul.id })}
                  />
                  <Button
                    label="Clone"
                    variant="quiet"
                    onPress={() => handleDuplicate(soul.id)}
                  />
                  <Button
                    label="Export"
                    variant="quiet"
                    onPress={() => handleExport(soul.id)}
                  />
                  {!isBuiltIn ? (
                    <Button
                      label="Delete"
                      variant="quiet"
                      onPress={() => handleDelete(soul.id)}
                    />
                  ) : null}
                </View>
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ colors, line, space }) => ({
  topActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.sm,
    marginTop: space.sm,
  },
  importCard: {
    marginTop: space.sm,
    padding: space.md,
    gap: space.sm,
  },
  importActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginTop: space.xs,
  },
  // Hero Active Card
  heroCard: {
    marginTop: space.sm,
    padding: space.md,
    borderColor: colors.accent,
    borderWidth: line * 1.5,
    backgroundColor: colors.surface,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  heroBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    backgroundColor: colors.accent,
  },
  heroActiveText: {
    color: colors.accent,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  heroBody: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'center',
  },
  heroAvatarWrap: {
    position: 'relative',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderWidth: line,
    padding: 3,
  },
  heroContent: {
    flex: 1,
    gap: 4,
  },
  heroNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  heroNameText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  heroTagline: {
    fontSize: 12,
    lineHeight: 16,
  },
  heroVoiceTag: {
    marginTop: 2,
  },
  heroDivider: {
    height: line,
    backgroundColor: colors.border,
    marginVertical: space.sm,
  },
  heroActions: {
    flexDirection: 'row',
    gap: space.sm,
  },
  heroPrimaryBtn: {
    flex: 1,
  },
  // Controls
  searchSortRow: {
    marginTop: space.sm,
    gap: space.sm,
  },
  searchWrap: {
    flex: 1,
  },
  sortWrap: {
    width: '100%',
  },
  chipScroll: {
    marginTop: space.xs,
    maxHeight: 38,
  },
  chips: {
    gap: space.xs,
    paddingRight: space.md,
  },
  soulList: {
    marginTop: space.md,
    gap: space.md,
    paddingBottom: space.xl,
  },
  // Companion Cards
  modelCard: {
    padding: space.md,
    borderColor: colors.borderStrong,
    borderWidth: line,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 0,
  },
  modelCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    borderWidth: line * 1.5,
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: line,
    padding: 2,
  },
  heroDetails: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  nameText: {
    fontSize: 16,
    color: colors.text,
  },
  tagCluster: {
    flexDirection: 'row',
    gap: 4,
  },
  taglineText: {
    fontSize: 12,
    lineHeight: 16,
  },
  favButton: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  favButtonActive: {
    opacity: 1,
  },
  favStar: {
    fontSize: 18,
    lineHeight: 18,
  },
  settingBox: {
    marginTop: space.xs,
    padding: space.xs,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: line,
  },
  voiceIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xs,
  },
  cardDivider: {
    height: line,
    backgroundColor: colors.border,
    marginVertical: space.sm,
  },
  cardActions: {
    gap: space.xs,
  },
  activeActionRow: {
    flexDirection: 'row',
  },
  fillButton: {
    flex: 1,
  },
  inactiveActionRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  selectButton: {
    flex: 2,
  },
  chatButton: {
    flex: 1,
  },
  toolsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.xs,
    marginTop: 2,
  },
}));
