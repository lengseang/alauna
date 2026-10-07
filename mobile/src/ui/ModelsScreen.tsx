import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MODEL_CATALOG, queryCatalog, type ModelCapability, type ModelGrade } from '../core/catalog.ts';
import { defaultContext, recommendModel } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { CrossIcon, SearchIcon } from '../components/Icons';
import { getDeviceProfile } from '../services/device.ts';
import { refreshDownloads } from '../services/downloads.ts';
import { useSettings } from '../services/settings.ts';
import { describeLocation, freeSpaceBytes, useStorage } from '../services/storage.ts';
import { Banner } from './kit';
import { ModelCard } from './ModelCard';
import { Screen } from './Screen';
import { goBack, push } from './nav';
import { colors, font, radius } from './theme';

const SORTS = [
  { key: 'size_asc', label: 'Size: small first' },
  { key: 'size_desc', label: 'Size: large first' },
  { key: 'name_asc', label: 'Name A-Z' },
] as const;

function Chip({ label, active, onPress, tone }: { label: string; active: boolean; onPress: () => void; tone?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && { backgroundColor: tone ?? colors.white, borderColor: tone ?? colors.white }]}>
      <Text style={[styles.chipText, active && { color: colors.black, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function ModelsScreen() {
  const device = getDeviceProfile();
  const settings = useSettings();
  const storage = useStorage();
  const [search, setSearch] = useState('');
  const [grade, setGrade] = useState<ModelGrade | 'ALL'>('ALL');
  const [caps, setCaps] = useState<ModelCapability[]>([]);
  const [match, setMatch] = useState<'ANY' | 'ALL'>('ANY');
  const [uncensored, setUncensored] = useState(false);
  const [sortIdx, setSortIdx] = useState(0);

  // Re-read the disk whenever the Hub opens (installed models, resumable partials).
  useEffect(() => {
    refreshDownloads();
  }, [storage.config?.rootPath]);

  const recommended = useMemo(() => recommendModel(MODEL_CATALOG, device.totalRamBytes), [device.totalRamBytes]);
  const list = useMemo(
    () => queryCatalog({ search, grade, capabilities: caps, match, onlyUncensored: uncensored, sort: SORTS[sortIdx].key }),
    [search, grade, caps, match, uncensored, sortIdx],
  );
  const toggleCap = (c: ModelCapability) => setCaps((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const free = freeSpaceBytes();
  const nCtx = settings.contextOverride ?? defaultContext(device.totalRamBytes);

  const header = (
    <View style={{ gap: 10, paddingBottom: 6 }}>
      <Banner tone="accent">
        Your phone: {device.name}
        {device.totalRamBytes ? ` · ${formatBytes(device.totalRamBytes)} RAM` : ''}. Each model shows how well it fits.
        {recommended ? ` Recommended: ${recommended.name}.` : ''}
      </Banner>
      {storage.config ? (
        <Pressable accessibilityRole="button" onPress={() => push('settings/storage')} style={styles.storageRow}>
          <Text style={styles.storageText} numberOfLines={1}>
            Saving to: {describeLocation(storage.config)}
            {free ? ` · ${formatBytes(free)} free` : ''}
          </Text>
          <Text style={styles.storageLink}>Change</Text>
        </Pressable>
      ) : null}

      <View style={styles.search}>
        <SearchIcon size={16} color={colors.faint} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Search models..." placeholderTextColor={colors.faint} style={styles.searchInput} autoCorrect={false} accessibilityLabel="Search models" />
        {search ? (
          <Pressable accessibilityLabel="Clear search" hitSlop={8} onPress={() => setSearch('')}>
            <CrossIcon size={14} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.chips}>
        {(['ALL', 'S', 'B', 'C'] as const).map((g) => (
          <Chip key={g} label={g === 'ALL' ? 'All sizes' : `Grade ${g}`} active={grade === g} onPress={() => setGrade(g)} />
        ))}
        <Chip label="Uncensored" active={uncensored} tone={colors.bad} onPress={() => setUncensored((v) => !v)} />
      </View>
      <View style={styles.chips}>
        {(['Code', 'Reasoning'] as const).map((c) => (
          <Chip key={c} label={c} active={caps.includes(c)} tone={colors.accent} onPress={() => toggleCap(c)} />
        ))}
        {caps.length > 1 ? <Chip label={match === 'ANY' ? 'Match: any' : 'Match: all'} active={false} onPress={() => setMatch((m) => (m === 'ANY' ? 'ALL' : 'ANY'))} /> : null}
        <Chip label={SORTS[sortIdx].label} active={false} onPress={() => setSortIdx((i) => (i + 1) % SORTS.length)} />
      </View>
      <Text style={styles.count}>{list.length} of {MODEL_CATALOG.length} models · context {nCtx} tokens</Text>
    </View>
  );

  return (
    <Screen title="Model Hub" subtitle="Download once, run offline" onBack={goBack}>
      <FlatList
        data={list}
        keyExtractor={(m) => m.id}
        ListHeaderComponent={header}
        ListEmptyComponent={<Text style={styles.empty}>No models match these filters.</Text>}
        renderItem={({ item }) => <ModelCard spec={item} recommended={recommended?.id === item.id} />}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={6}
        windowSize={7}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  storageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, paddingHorizontal: 12 },
  storageText: { color: colors.muted, fontSize: font.sm, flex: 1 },
  storageLink: { color: colors.accent, fontSize: font.sm, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, minHeight: 44 },
  searchInput: { flex: 1, color: colors.text, fontSize: font.md, paddingVertical: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: 6, paddingHorizontal: 12 },
  chipText: { color: colors.muted, fontSize: font.sm },
  count: { color: colors.faint, fontSize: font.xs },
  empty: { color: colors.faint, textAlign: 'center', marginTop: 40 },
});
