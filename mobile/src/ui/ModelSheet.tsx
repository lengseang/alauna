import React from 'react';
import { Pressable, View } from 'react-native';
import { MODEL_CATALOG, getModel } from '../core/catalog.ts';
import { defaultContext, fitFor, FIT_LABEL } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { engine, useEngineStatus } from '../services/engine.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Icon } from './Icon';
import { push } from './nav';
import { Notice } from './Notice';
import { ListRow } from './Row';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useInstalledIds } from './useInstalled';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function describeEngine(
  eng: ReturnType<typeof useEngineStatus>,
  spec: ReturnType<typeof getModel>,
  installed: boolean,
): { kind: 'ready' | 'loading' | 'idle' | 'error'; text: string; tone: 'text' | 'accent' | 'muted' | 'danger' } {
  if (eng.state === 'ready' && spec && eng.modelId === spec.id) {
    const spd = eng.lastTokPerSec ? ` · ${eng.lastTokPerSec.toFixed(1)} tok/s` : '';
    return { kind: 'ready', text: `Loaded in memory${spd}`, tone: 'accent' };
  }
  if (eng.state === 'loading' || eng.state === 'warming') {
    return { kind: 'loading', text: 'Loading into memory...', tone: 'accent' };
  }
  if (eng.state === 'error') {
    return { kind: 'error', text: eng.error ?? 'Error loading model', tone: 'danger' };
  }
  if (!installed) {
    return { kind: 'idle', text: 'Not downloaded yet. Tap below to get it.', tone: 'muted' };
  }
  return { kind: 'idle', text: 'Downloaded · Tap to activate', tone: 'muted' };
}

/**
 * Quick model switch + proof of life. The top block says, from real engine numbers, whether the AI is loaded, on what,
 * and how fast it was. Load / Unload act on the chosen model; tapping another installed model loads it right away.
 */
export function ModelSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const s = useStyles();
  const eng = useEngineStatus();
  const settings = useSettings();
  const installedIds = useInstalledIds();
  const device = getDeviceProfile();
  const spec = getModel(settings.activeModelId);
  const installed = MODEL_CATALOG.filter((m) => installedIds.includes(m.id));
  const specInstalled = !!spec && installedIds.includes(spec.id);
  const line = describeEngine(eng, spec, specInstalled);
  const nCtx = settings.contextOverride ?? defaultContext(device.totalRamBytes);

  const load = async (id: string) => {
    const m = getModel(id);
    if (!m) return;
    updateSettings({ activeModelId: m.id });
    if (engine.isReady(m.id)) {
      onClose();
      return;
    }
    onClose();
    const r = await engine.mount(m);
    if (!r.ok) showToast(r.message);
  };

  const openVault = () => {
    onClose();
    push('models');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Companion Model">
      {/* Active Model Status Card */}
      <View style={s.activeCard}>
        <View style={s.head}>
          <View style={[s.statusDot, line.kind === 'ready' ? s.dotReady : line.kind === 'loading' ? s.dotLoading : s.dotIdle]} />
          <View style={s.fill}>
            <Text variant="strong">{spec ? spec.name : 'No model selected'}</Text>
            <Text variant="small" tone={line.tone}>
              {line.text}
            </Text>
          </View>
        </View>
        {line.kind === 'error' && eng.error ? (
          <Notice tone="danger">{eng.error}</Notice>
        ) : null}
      </View>

      {/* Installed Models Quick Select */}
      {installed.length > 0 ? (
        <View style={s.listContainer}>
          <Text variant="label" tone="muted" style={s.listHeader}>
            INSTALLED MODELS
          </Text>
          {installed.map((m) => {
            const isActive = settings.activeModelId === m.id;
            return (
              <ListRow
                key={m.id}
                title={m.name}
                subtitle={`${formatBytes(m.sizeBytes)} · ${m.contentPolicy === 'Uncensored' ? 'Uncensored' : 'Standard'}`}
                selected={isActive}
                onPress={() => void load(m.id)}
              />
            );
          })}
        </View>
      ) : null}

      {/* Explore Model Vault Action */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Explore Model Vault"
        onPress={openVault}
        style={({ pressed }) => [s.vaultRow, pressed && s.vaultRowPressed]}
      >
        <Icon name="models" size={20} color={s.accentColor.color} />
        <View style={s.vaultTextCol}>
          <Text variant="strong" tone="accent">
            {installed.length ? 'Browse All Models in Vault' : 'Download a Companion Model'}
          </Text>
          <Text variant="small" tone="muted">
            Uncensored roleplay, vision, and fast pocket models
          </Text>
        </View>
        <Icon name="chevron" size={16} color={s.mutedColor.color} />
      </Pressable>
    </Sheet>
  );
}

const useStyles = makeStyles(({ colors, space, line, radius, isDark }) => ({
  activeCard: {
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: line,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(99, 102, 241, 0.12)',
    gap: space.xs,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  fill: {
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  dotReady: {
    backgroundColor: '#10B981',
  },
  dotLoading: {
    backgroundColor: '#F59E0B',
  },
  dotIdle: {
    backgroundColor: colors.muted,
  },
  listContainer: {
    gap: space.xs,
    marginTop: space.xs,
  },
  listHeader: {
    fontSize: 11,
    letterSpacing: 0.8,
    paddingHorizontal: space.xs,
  },
  vaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: line,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(99, 102, 241, 0.12)',
    marginTop: space.xs,
  },
  vaultRowPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  vaultTextCol: {
    flex: 1,
  },
  accentColor: {
    color: colors.accent,
  },
  mutedColor: {
    color: colors.muted,
  },
}));
