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

  type VaultTab = 'all' | 'uncensored' | 'vision' | 'pocket' | 'installed';
  const [tab, setTab] = useState<VaultTab>('all');

  const onSelectTab = (t: VaultTab) => {
    setTab(t);
    if (t === 'all') {
      set({ policies: [], caps: [], smallUncensored: false, installed: false });
    } else if (t === 'uncensored') {
      set({ policies: ['Uncensored'], caps: [], smallUncensored: false, installed: false });
    } else if (t === 'vision') {
      set({ policies: [], caps: ['Image'], smallUncensored: false, installed: false });
    } else if (t === 'pocket') {
      set({ policies: [], caps: [], smallUncensored: true, installed: false });
    } else if (t === 'installed') {
      set({ policies: [], caps: [], smallUncensored: false, installed: true });
    }
  };

  const toolbar = (
    <View style={s.toolbar}>
      <View style={s.searchRow}>
        <View style={s.searchFieldWrapper}>
          <SearchField label="Search companion models" value={f.search} onChangeText={(search) => set({ search })} />
        </View>
        <DownloadsIconButton />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={s.chipScroll} contentContainerStyle={s.chips}>
        <Tag label="All Models" count={MODEL_CATALOG.length} selected={tab === 'all'} onPress={() => onSelectTab('all')} tone={tab === 'all' ? 'accent' : undefined} />
        <Tag label="Uncensored Roleplay" count={facets.policy.Uncensored} selected={tab === 'uncensored'} onPress={() => onSelectTab('uncensored')} tone={tab === 'uncensored' ? 'accent' : undefined} />
        <Tag label="Vision & Photos" count={facets.capabilities.Image} selected={tab === 'vision'} onPress={() => onSelectTab('vision')} tone={tab === 'vision' ? 'accent' : undefined} />
        <Tag label="Fast Pocket" count={smallCount} selected={tab === 'pocket'} onPress={() => onSelectTab('pocket')} tone={tab === 'pocket' ? 'accent' : undefined} />
        <Tag label="Installed" count={installedIds.length} selected={tab === 'installed'} onPress={() => onSelectTab('installed')} tone={tab === 'installed' ? 'accent' : undefined} />
      </ScrollView>

      {/* Sleek Minimalist Meta & Sort Bar */}
      <View style={s.metaBar}>
        <Text variant="small" tone="muted">{`${models.length} ${models.length === 1 ? 'model' : 'models'} available`}</Text>
        <Pressable
          style={({ pressed }) => [s.sortPill, pressed && { opacity: 0.7 }]}
          onPress={() => setSortOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`Sort by: ${sortInfo(f.sort).label}`}
        >
          <Icon name="sort" size={12} color={colors.accent} />
          <Text variant="small" tone="accent">{sortInfo(f.sort).label}</Text>
          <Icon name="chevron" size={10} color={colors.accent} rotate={90} />
        </Pressable>
      </View>
    </View>
  );

  const header = (
    <View style={s.header}>
      <View style={s.devicePill}>
        <View style={s.deviceDot} />
        <Text variant="small" tone="muted">
          {`${device.name}${ram ? ` · ${formatBytes(ram)} RAM` : ''} · 100% Offline & Sovereign`}
        </Text>
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

/** Compact download queue button with live counter badge to the right of the search bar. */
function DownloadsIconButton() {
  const { summary } = useDownloadsHub();
  const { colors } = useTheme();
  const s = useStyles();
  const busy = summary.active + summary.queued + summary.paused + summary.failed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Downloads${busy ? `, ${busy} items` : ''}`}
      accessibilityHint="Open downloads queue"
      onPress={() => push('downloads')}
      style={({ pressed }) => [s.downloadsIconBtn, pressed && s.downloadsIconBtnPressed]}
    >
      <Icon name="download" size={20} color={busy ? colors.accent : colors.text} />
      {busy > 0 ? (
        <View style={s.downloadsBadge}>
          <Text style={s.downloadsBadgeText}>{busy > 9 ? '9+' : busy}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const useStyles = makeStyles(({ space, colors, line, radius }) => ({
  toolbar: { gap: space.sm },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
  },
  searchFieldWrapper: {
    flex: 1,
  },
  downloadsIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: line,
    borderColor: colors.border,
  },
  downloadsIconBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  downloadsBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  downloadsBadgeText: {
    color: colors.onAccent,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
  chipScroll: { marginHorizontal: -space.lg, flexGrow: 0 },
  chips: { paddingHorizontal: space.lg, gap: space.sm, alignItems: 'center' },
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
  header: { gap: space.md, paddingTop: space.md, paddingBottom: space.sm },
  devicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: line,
    borderColor: colors.border,
  },
  deviceDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  sectionHead: { paddingTop: space.lg, paddingBottom: space.xs },
  footer: { paddingTop: space.xl },
  empty: { gap: space.md, paddingVertical: space.xl },
}));
