import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, View } from 'react-native';
import { ALL_CAPABILITIES, CAPABILITY_INFO, MODEL_CATALOG, PARAM_BANDS, isSmallUncensored, libraryFacets, paramBand, type ModelGrade } from '../core/catalog.ts';
import { defaultContext, recommendModel } from '../core/fit.ts';
import { formatBytes, formatDuration, formatSpeed } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { refreshDownloads, useDownloadsHub } from '../services/downloads.ts';
import { useEngineState } from '../services/engine.ts';
import { useSettings } from '../services/settings.ts';
import { describeLocation, freeSpaceBytes, useStorage } from '../services/storage.ts';
import { makeStyles, useTheme } from '../theme';
import { Button } from './Button';
import { Divider } from './Divider';
import { SearchField } from './Field';
import { Icon } from './Icon';
import { ModelRow } from './ModelCards';
import { Row } from './Row';
import { Screen } from './Screen';
import { SectionHeader } from './SectionHeader';
import { Segmented } from './Segmented';
import { SetupCard } from './SetupCard';
import { Sheet } from './Sheet';
import { Tag } from './Tag';
import { Text } from './Text';
import { applySavedConcurrency } from './downloadPrefs';
import { goBack, push } from './nav';
import { useInstalledIds } from './useInstalled';
import {
  DEFAULT_FILTERS,
  IDLE_ENGINE,
  SORTS,
  activeFilterCount,
  fitVerdict,
  runVaultQuery,
  sectionsFor,
  sortInfo,
  toggle,
  type GroupBy,
  type VaultFilters,
} from './vaultLogic';

const GRADES: readonly ModelGrade[] = ['S', 'B', 'C'];

/**
 * Model Vault: the whole library (every tag, grade and policy of the old app plus Reasoning) with search, tag filters
 * with counts, all eight sort orders, grade groups, and one primary action per row. Detail opens on tap.
 */
export function ModelsScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const device = getDeviceProfile();
  const ram = device.totalRamBytes;
  const settings = useSettings();
  const storage = useStorage();
  const eng = useEngineState();
  const installedIds = useInstalledIds();
  const [f, setF] = useState<VaultFilters>(DEFAULT_FILTERS);
  const [sortOpen, setSortOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('grade');
  const nCtx = settings.compute.nCtx ?? defaultContext(ram);

  // Re-read the disk whenever this screen opens (installed models, resumable partials) and restore the saved parallelism.
  useEffect(() => {
    void applySavedConcurrency().then(refreshDownloads);
  }, [storage.config?.rootPath]);

  const facets = useMemo(() => libraryFacets(), []);
  const fitCount = useMemo(() => (ram ? MODEL_CATALOG.filter((m) => fitVerdict(m, ram, nCtx).rating !== 'too_heavy').length : 0), [ram, nCtx]);
  const models = useMemo(() => runVaultQuery(f, { ramBytes: ram, nCtx, installedIds }), [f, ram, nCtx, installedIds]);
  const sections = useMemo(() => sectionsFor(models, f.sort, { ramBytes: ram, nCtx }, groupBy), [models, f.sort, ram, nCtx, groupBy]);
  const smallCount = useMemo(() => MODEL_CATALOG.filter(isSmallUncensored).length, []);
  const bandCounts = useMemo(() => PARAM_BANDS.map((b) => MODEL_CATALOG.filter((m) => paramBand(m) === b.id).length), []);
  const recommended = useMemo(() => recommendModel(MODEL_CATALOG, ram), [ram]);
  const showRecommended = !!recommended && !installedIds.includes(recommended.id) && activeFilterCount(f) === 0 && !f.search.trim();
  const grouped = groupBy === 'params' || sortInfo(f.sort).grouped;

  const set = useCallback((patch: Partial<VaultFilters>) => setF((cur) => ({ ...cur, ...patch })), []);
  const open = useCallback((id: string) => push('models/detail', { id }), []);
  const clear = () => setF((cur) => ({ ...DEFAULT_FILTERS, sort: cur.sort }));

  const renderItem = useCallback(
    ({ item }: { item: (typeof models)[number] }) => (
      <ModelRow
        spec={item}
        eng={eng.modelId === item.id ? eng : IDLE_ENGINE}
        verified={!!settings.verified[item.id]}
        ramBytes={ram}
        nCtx={nCtx}
        showGrade={!grouped}
        onOpen={open}
      />
    ),
    [eng, settings.verified, ram, nCtx, grouped, open],
  );

  const toolbar = (
    <>
      <SearchField label="Search models" value={f.search} onChangeText={(search) => set({ search })} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.chipScroll} contentContainerStyle={s.chips}>
        <Tag label="Uncensored" count={facets.policy.Uncensored} selected={f.policies.includes('Uncensored')} onPress={() => set({ policies: toggle(f.policies, 'Uncensored') })} tone="accent" accessibilityHint="Shows only models with refusals removed" />
        <Tag label="Uncensored · small (≤4B)" count={smallCount} selected={f.smallUncensored} onPress={() => set({ smallUncensored: !f.smallUncensored })} tone="accent" accessibilityHint="Uncensored models of at most 4 billion parameters, quick on a phone" />
        {PARAM_BANDS.map((b, i) => (
          <Tag key={b.id} label={b.label} count={bandCounts[i]} selected={f.bands.includes(b.id)} onPress={() => set({ bands: toggle(f.bands, b.id) })} accessibilityHint={`Models with ${b.label} parameters`} />
        ))}
        {ALL_CAPABILITIES.map((c) => (
          <Tag key={c} label={CAPABILITY_INFO[c].label} count={facets.capabilities[c]} selected={f.caps.includes(c)} onPress={() => set({ caps: toggle(f.caps, c) })} accessibilityHint={CAPABILITY_INFO[c].meaning} />
        ))}
        {GRADES.map((g) => (
          <Tag key={g} label={`Grade ${g}`} count={facets.grades[g]} selected={f.grades.includes(g)} onPress={() => set({ grades: toggle(f.grades, g) })} />
        ))}
        <Tag label="Standard" count={facets.policy.Standard} selected={f.policies.includes('Standard')} onPress={() => set({ policies: toggle(f.policies, 'Standard') })} />
        {ram ? <Tag label="Fits this phone" count={fitCount} selected={f.fits} onPress={() => set({ fits: !f.fits })} accessibilityHint="Hides models that need more memory than this phone has" /> : null}
        <Tag label="Installed" count={installedIds.length} selected={f.installed} onPress={() => set({ installed: !f.installed })} />
      </ScrollView>
      {/* Spacious Sort Dropdown Selector */}
      <Pressable
        style={({ pressed }) => [
          s.sortDropdown,
          pressed && { opacity: 0.75 },
        ]}
        onPress={() => setSortOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Sort by: ${sortInfo(f.sort).label}`}
      >
        <View style={s.sortDropdownLeft}>
          <Icon name="sort" size={16} color={colors.accent} />
          <Text variant="small" tone="muted">SORT BY:</Text>
          <Text variant="strong" numberOfLines={1} style={s.sortValue}>
            {sortInfo(f.sort).label}
          </Text>
        </View>
        <Icon name="chevron" size={14} color={colors.muted} rotate={90} />
      </Pressable>

      {/* Spacious Grouping & Matching Controls */}
      <View style={s.controls}>
        <View style={s.match}>
          <Segmented
            label="Group by"
            options={[
              { value: 'grade', label: 'Group: Grade' },
              { value: 'params', label: 'Group: Parameters' },
            ]}
            value={groupBy}
            onChange={setGroupBy}
          />
        </View>
        <View style={s.match}>
          <Segmented
            label="Match tags"
            options={[
              { value: 'AND', label: 'All tags' },
              { value: 'OR', label: 'Any tag' },
            ]}
            value={f.match}
            onChange={(match) => set({ match })}
            disabled={f.caps.length < 2}
          />
        </View>
      </View>
    </>
  );

  const header = (
    <View style={s.header}>
      <Text variant="small">{`${device.name}${ram ? ` · ${formatBytes(ram)} memory` : ''}. ${models.length} of ${MODEL_CATALOG.length} models. They download once, then work offline.`}</Text>
      {showRecommended && recommended ? <SetupCard spec={recommended} deviceName={device.name} tone="recommended" /> : null}
      <View>
        <DownloadsLink />
        <Divider />
        <Row title="Speculative decoding" subtitle={settings.speculative.enabled ? 'On. Tap for the draft, live acceptance and speed-up.' : 'Off. A small draft guesses ahead so the big model answers faster.'} value={settings.speculative.enabled ? 'On' : 'Off'} onPress={() => push('speculative')} />
        <Divider />
      </View>
    </View>
  );

  const footer = (
    <View style={s.footer}>
      {storage.config ? <Row title="Saved in" subtitle={`${describeLocation(storage.config)}${freeSpaceBytes() ? ` · ${formatBytes(freeSpaceBytes() ?? 0)} free` : ''}`} onPress={() => push('settings/storage')} /> : null}
    </View>
  );


  const empty = (
    <View style={s.empty}>
      <Text variant="strong">{f.caps.includes('Video') && models.length === 0 ? 'No model can watch video yet' : 'No models match'}</Text>
      <Text variant="small">
        {f.caps.includes('Video') ? CAPABILITY_INFO.Video.meaning : f.installed && activeFilterCount(f) === 1 && !f.search.trim() ? 'Nothing is installed yet. Pick a model below.' : 'Try fewer tags or a different search.'}
      </Text>
      <Button label="Clear filters" variant="quiet" onPress={() => setF({ ...DEFAULT_FILTERS, sort: f.sort })} />
    </View>
  );

  return (
    <Screen title="Model Vault" onBack={goBack} toolbar={toolbar}>
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View style={s.sectionHead}>
            <SectionHeader title={section.title} hint={section.hint} />
          </View>
        )}
        ItemSeparatorComponent={Divider}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={empty}
        contentContainerStyle={s.list}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        windowSize={7}
        extraData={eng}
      />
      <Sheet visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort models" footer={activeFilterCount(f) > 0 ? <Button label="Clear all filters" variant="quiet" onPress={() => { clear(); setSortOpen(false); }} /> : undefined}>
        {SORTS.map((o, i) => (
          <React.Fragment key={o.value}>
            {i > 0 ? <Divider /> : null}
            <Row title={o.label} subtitle={o.hint} selected={f.sort === o.value} onPress={() => { set({ sort: o.value }); setSortOpen(false); }} />
          </React.Fragment>
        ))}
      </Sheet>
    </Screen>
  );
}

/** Live one-line state of the queue; subscribes on its own so progress ticks never re-render the list. */
function DownloadsLink() {
  const { summary } = useDownloadsHub();
  const busy = summary.active + summary.queued + summary.paused + summary.failed;
  const parts: string[] = [];
  if (summary.active) parts.push(`${summary.active} downloading${summary.speedBps > 0 ? ` at ${formatSpeed(summary.speedBps)}` : ''}${summary.etaSec > 0 ? `, ${formatDuration(summary.etaSec)} left` : ''}`);
  if (summary.queued) parts.push(`${summary.queued} queued`);
  if (summary.paused) parts.push(`${summary.paused} paused`);
  if (summary.failed) parts.push(`${summary.failed} failed`);
  return <Row title="Downloads" subtitle={busy ? parts.join(' · ') : 'Nothing downloading. Queue, speed and disk use live here.'} value={busy ? String(busy) : undefined} onPress={() => push('downloads')} />;
}

const useStyles = makeStyles(({ space, colors, line }) => ({
  chipScroll: { marginHorizontal: -space.lg, flexGrow: 0 },
  chips: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
  sortDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderWidth: line,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    minHeight: 44,
  },
  sortDropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  sortValue: {
    flexShrink: 1,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  match: { flex: 1 },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  header: { gap: space.lg, paddingTop: space.lg, paddingBottom: space.sm },
  sectionHead: { paddingTop: space.xl, paddingBottom: space.xs },
  footer: { paddingTop: space.xl },
  empty: { gap: space.md, paddingVertical: space.xl },
}));
