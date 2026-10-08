import React from 'react';
import { MODEL_CATALOG, getModel } from '../core/catalog.ts';
import { defaultContext, fitFor, FIT_LABEL } from '../core/fit.ts';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { engine, useEngineStatus } from '../services/engine.ts';
import { updateSettings, useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { Button } from './Button';
import { Divider } from './Divider';
import { describeEngine } from './engineStatus';
import { push } from './nav';
import { Notice } from './Notice';
import { Row } from './Row';
import { Sheet } from './Sheet';
import { Text } from './Text';
import { useInstalledIds } from './useInstalled';

/**
 * Model switcher + proof of life. The top block says, from real engine numbers, whether the AI is loaded and how fast it was.
 * Picking another installed model loads it right away (the status line in the top bar shows the progress).
 */
export function ModelSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const eng = useEngineStatus();
  const settings = useSettings();
  const installedIds = useInstalledIds();
  const device = getDeviceProfile();
  const spec = getModel(settings.activeModelId);
  const installed = MODEL_CATALOG.filter((m) => installedIds.includes(m.id));
  const line = describeEngine(eng, spec, !!spec && installedIds.includes(spec.id));
  const nCtx = settings.contextOverride ?? defaultContext(device.totalRamBytes);

  const facts: string[] = [];
  if (line.kind === 'ready' || line.kind === 'generating') {
    facts.push(`${eng.nCtx || nCtx} token memory`);
    if (eng.loadMs) facts.push(`loaded in ${(eng.loadMs / 1000).toFixed(1)}s`);
    if (eng.lastTokPerSec) facts.push(`last speed ${eng.lastTokPerSec.toFixed(1)} tok/s`);
    if (eng.ttftMs) facts.push(`first token ${(eng.ttftMs / 1000).toFixed(1)}s`);
  }

  const choose = async (id: string) => {
    const m = getModel(id);
    if (!m) return;
    onClose();
    if (engine.isReady(m.id)) return;
    const r = await engine.mount(m);
    if (!r.ok) showToast(r.message);
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Model">
      <Text variant="strong">{spec ? spec.name : 'No model selected'}</Text>
      <Text variant="small" tone={line.tone}>
        {[line.text, ...facts].join(' · ')}
      </Text>
      {line.kind === 'error' && eng.error ? <Notice tone="danger">{`${eng.error} ${eng.errorFix ?? ''}`.trim()}</Notice> : null}
      {line.kind === 'idle' && eng.unloadedReason ? <Text variant="small">It was unloaded to free memory and loads again when you send a message.</Text> : null}

      {installed.length > 0 ? <Divider /> : null}
      {installed.map((m) => (
        <Row
          key={m.id}
          title={m.name}
          subtitle={`${formatBytes(m.sizeBytes)} · ${FIT_LABEL[fitFor(m, device.totalRamBytes, nCtx)]}`}
          selected={settings.activeModelId === m.id}
          onPress={() => void choose(m.id)}
        />
      ))}

      {spec?.thinking === 'toggle' ? (
        <>
          <Divider />
          <Row
            title="Think before answering"
            subtitle="Slower, better on hard questions"
            right={
              <Text variant="label" tone="accent">
                {settings.thinkingEnabled ? 'On' : 'Off'}
              </Text>
            }
            onPress={() => updateSettings({ thinkingEnabled: !settings.thinkingEnabled })}
          />
        </>
      ) : null}

      <Button
        label={installed.length ? 'Get more models' : 'Get a model'}
        variant={installed.length ? 'quiet' : 'primary'}
        onPress={() => {
          onClose();
          push('models');
        }}
      />
    </Sheet>
  );
}
