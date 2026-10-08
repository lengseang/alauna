import React from 'react';
import { View } from 'react-native';
import { MODEL_CATALOG, getModel } from '../core/catalog.ts';
import { defaultContext, fitFor, FIT_LABEL } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { engine, useEngineStatus } from '../services/engine.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { eclipseFor } from './chatLogic';
import { Divider } from './Divider';
import { Eclipse } from './Eclipse';
import { describeEngine } from './engineStatus';
import { push } from './nav';
import { Notice } from './Notice';
import { ListRow } from './Row';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useInstalledIds } from './useInstalled';

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

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
  const loaded = line.kind === 'ready' || line.kind === 'generating';

  const facts: string[] = [];
  if (loaded) {
    facts.push(`${eng.nCtx || nCtx} token memory`);
    if (eng.loadMs) facts.push(`loaded in ${secs(eng.loadMs)}`);
    if (eng.lastTokPerSec) facts.push(`last speed ${eng.lastTokPerSec.toFixed(1)} tok/s`);
    if (eng.ttftMs) facts.push(`first token ${secs(eng.ttftMs)}`);
    if (eng.vision) facts.push('sees images');
    if (eng.kvCache.status === 'loaded') facts.push(`KV cache reused ${eng.kvCache.tokens} tokens${eng.kvCache.warmTtftMs ? `, first token ${secs(eng.kvCache.warmTtftMs)}` : ''}`);
    else if (eng.kvCache.status === 'saved') facts.push(`KV cache saved (${eng.kvCache.tokens} tokens)`);
    if (eng.speculative.active) {
      const rate = eng.speculative.acceptanceRate;
      facts.push(`speculative on${rate !== null ? `, ${Math.round(rate * 100)}% accepted` : ''}${eng.speculative.speedup ? `, ${eng.speculative.speedup.toFixed(2)}x measured` : ''}`);
    }
  }

  const load = async (id: string) => {
    const m = getModel(id);
    if (!m) return;
    if (engine.isReady(m.id)) return onClose();
    onClose();
    const r = await engine.mount(m);
    if (!r.ok) showToast(r.message);
  };
  const openVault = () => {
    onClose();
    push('models');
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Model">
      <View style={s.head}>
        <Eclipse state={eclipseFor(line.kind)} progress={eng.progress} size={40} />
        <View style={s.fill}>
          <Text variant="strong">{spec ? spec.name : 'No model selected'}</Text>
          <Text variant="small" tone={line.tone}>
            {loaded && eng.backend ? `${line.text} (${eng.backend})` : line.text}
          </Text>
        </View>
      </View>
      {facts.length ? <Text variant="small">{facts.join(' · ')}</Text> : null}
      {loaded && eng.speculative.requested !== 'off' && !eng.speculative.active && eng.speculative.reason ? (
        <Text variant="small">{`Speculative decoding off: ${eng.speculative.reason}`}</Text>
      ) : null}
      {loaded ? eng.fallbacks.map((f) => <Text key={f} variant="small">{f}</Text>) : null}
      {line.kind === 'error' && eng.error ? <Notice tone="danger">{`${eng.error} ${eng.errorFix ?? ''}`.trim()}</Notice> : null}
      {line.kind === 'idle' && eng.unloadedReason ? <Text variant="small">It was unloaded to free memory and loads again when you send a message.</Text> : null}

      {spec && specInstalled ? (
        loaded ? (
          <Button label="Unload (free memory)" variant="quiet" disabled={line.kind === 'generating'} onPress={() => engine.unmount()} />
        ) : line.kind !== 'loading' ? (
          <Button label={line.kind === 'error' ? 'Try loading again' : `Load ${spec.name}`} variant="quiet" onPress={() => load(spec.id)} />
        ) : null
      ) : null}

      {installed.length > 0 ? <Divider /> : null}
      {installed.map((m) => (
        <ListRow
          key={m.id}
          title={m.name}
          subtitle={`${formatBytes(m.sizeBytes)} · ${FIT_LABEL[fitFor(m, device.totalRamBytes, nCtx)]}${engine.isReady(m.id) ? ' · loaded' : ''}`}
          selected={settings.activeModelId === m.id}
          onPress={() => void load(m.id)}
        />
      ))}

      {spec?.thinking === 'toggle' ? (
        <>
          <Divider />
          <ListRow
            title="Think before answering"
            subtitle="Slower, better on hard questions"
            switchValue={settings.thinkingEnabled}
            onSwitch={(v) => updateSettings({ thinkingEnabled: v })}
          />
        </>
      ) : null}

      <Button label={installed.length ? 'Open Model Vault' : 'Get a model'} icon="models" variant={installed.length ? 'quiet' : 'primary'} onPress={openVault} />
    </Sheet>
  );
}

const useStyles = makeStyles(({ space }) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fill: { flex: 1 },
}));
