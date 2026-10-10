import React, { useEffect } from 'react';
import { getModel } from '../../core/catalog.ts';
import { defaultContext, estimateRamBytes, fitFor, FIT_LABEL } from '../../core/fit.ts';
import { formatBytes } from '../../core/format.ts';
import { KV_CACHE_TYPES } from '../../core/settingsModel.ts';
import { getDeviceProfile } from '../../services/device.ts';
import { engine, refreshBackendDevices, useBackendDevices, useEngineStatus } from '../../services/engine.ts';
import { resetSettings, updateSection, updateSettings, useSettings } from '../../services/settings.ts';
import { showToast } from '../../services/toast.ts';
import { Button } from '../Button';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Slider } from '../Slider';
import { Stat } from '../Stat';
import { Text } from '../Text';
import { BATCH_CHOICES, CTX_CHOICES, labelThreads, labelTokens, labelVisionTokens, oneDecimal, THREAD_CHOICES, VISION_TOKEN_CHOICES, wholeMs } from './logic';
import { ChoiceRow, Group, ResetButton, Rows, StatRow } from './parts';

const KV_LABEL = (t: string): string => (t === 'f16' ? 'f16 (default, full quality)' : t === 'f32' ? 'f32 (largest, no benefit)' : t.startsWith('q') || t.startsWith('iq') ? `${t} (smaller, slightly less exact)` : t);
const KV_STATUS: Record<string, string> = {
  off: 'Off',
  idle: 'Ready: nothing saved yet',
  saved: 'Saved the persona prefix',
  loaded: 'Restored the persona prefix from disk',
  error: 'Could not use the saved prefix',
};

/** Settings > Advanced compute: live telemetry, backend, processor, KV cache, sampling. Everything applies on the next model load. */
export function AdvancedComputeScreen() {
  const s = useSettings();
  const eng = useEngineStatus();
  const devices = useBackendDevices();
  const device = getDeviceProfile();
  const c = s.compute;
  useEffect(() => {
    void refreshBackendDevices();
  }, []);

  const auto = defaultContext(device.totalRamBytes);
  const nCtx = c.nCtx ?? auto;
  const active = getModel(s.activeModelId);
  const fit = active ? fitFor(active, device.totalRamBytes, nCtx) : null;
  const loaded = eng.state === 'ready' || eng.state === 'generating';
  const kv = eng.kvCache;
  const gpuAsked = c.backend === 'gpu';

  return (
    <Screen title="Advanced compute" onBack={goBack} scroll>
      <Notice>Changes apply the next time a model loads. The defaults suit your phone, so most people never change them.</Notice>
      {s.computeNotice ? (
        <Notice tone="danger" title="Changed for you" action={<Button label="Got it" variant="quiet" onPress={() => updateSettings({ computeNotice: null })} />}>
          {s.computeNotice}
        </Notice>
      ) : null}
      {eng.fallbacks.map((f) => (
        <Notice key={f} tone="quiet" title="Switched off during the last load">
          {f}
        </Notice>
      ))}

      <Group index={1} title="Live telemetry" hint={`From this phone and the engine just now. ${eng.headline}`}>
        <StatRow>
          <Stat label="Phone memory" value={device.totalRamBytes ? formatBytes(device.totalRamBytes) : null} hint={device.name} />
          <Stat label="Model needs" value={eng.ramEstimateMb !== null ? formatBytes(eng.ramEstimateMb * 1e6) : null} hint="estimate" />
          <Stat label="Context used" value={eng.ctxUsed !== null && eng.nCtx > 0 ? `${eng.ctxUsed} / ${eng.nCtx}` : null} unit="tokens" />
        </StatRow>
        <StatRow>
          <Stat label="Backend" value={eng.backend} />
          <Stat label="Speed" value={oneDecimal(eng.lastTokPerSec)} unit="tok/s" hint="last reply" />
          <Stat label="First token" value={wholeMs(eng.ttftMs)} unit="ms" hint="last reply" />
        </StatRow>
        <StatRow>
          <Stat label="Load time" value={wholeMs(eng.loadMs)} unit="ms" />
          <Stat label="First reply, cold" value={wholeMs(kv.coldTtftMs)} unit="ms" hint="prefix evaluated" />
          <Stat label="First reply, warm" value={wholeMs(kv.warmTtftMs)} unit="ms" hint="prefix restored" />
        </StatRow>
        {eng.speculative.active ? (
          <StatRow>
            <Stat label="Speculative accepted" value={eng.speculative.acceptanceRate !== null ? `${Math.round(eng.speculative.acceptanceRate * 100)}%` : null} />
            <Stat label="Speed-up" value={eng.speculative.speedup !== null ? `${eng.speculative.speedup.toFixed(2)}x` : null} hint="measured" />
          </StatRow>
        ) : null}
      </Group>

      <Group index={2} title="Backend" hint="Where the maths runs. CPU is the reliable choice.">
        <Segmented
          label="Compute backend"
          options={[
            { value: 'cpu', label: 'CPU' },
            { value: 'gpu', label: 'GPU (experimental)' },
          ]}
          value={c.backend}
          onChange={(backend) => updateSection('compute', { backend })}
        />
        {gpuAsked ? <Notice>GPU can be faster on some phones and slower or unstable on others. If a model fails to load or the app is killed, CHIWIWI switches back to CPU by itself and tells you why.</Notice> : null}
        {devices.status === 'ready' && !devices.gpuAvailable ? (
          <Notice tone="quiet" title="No GPU found">
            The engine found no usable GPU in this build on this phone, so it runs on the CPU even if GPU is selected.
          </Notice>
        ) : null}
        {gpuAsked && loaded && !eng.gpu && eng.reasonNoGPU ? (
          <Notice tone="quiet" title="Not on the GPU">
            {`The loaded model runs on the CPU. The engine says: ${eng.reasonNoGPU}`}
          </Notice>
        ) : null}
        {devices.status === 'error' ? (
          <Notice tone="danger" action={<Button label="Try again" variant="quiet" onPress={() => refreshBackendDevices(true)} />}>
            {`Could not ask the engine for its devices: ${devices.error ?? 'unknown error'}`}
          </Notice>
        ) : null}
        {devices.status === 'loading' || devices.status === 'unknown' ? <Text variant="small">Asking the engine which devices exist...</Text> : null}
        <Rows>
          {devices.devices.map((d) => (
            <ListRow key={`${d.backend}:${d.deviceName}`} title={d.deviceName} subtitle={`${d.backend} · ${d.type}`} value={d.maxMemorySize > 0 ? formatBytes(d.maxMemorySize) : undefined} />
          ))}
        </Rows>
        {gpuAsked ? <Slider label="Layers on the GPU" value={Math.min(c.nGpuLayers, 99)} min={0} max={99} step={1} format={(v) => (v >= 99 ? 'All' : String(v))} hint="99 puts every layer on the GPU." onChange={(v) => updateSection('compute', { nGpuLayers: v })} /> : null}
      </Group>

      <Group index={3} title="Processor">
        <Rows>
          <ChoiceRow title="CPU threads" subtitle="Worker threads for the maths. Auto pins the fast cores." options={THREAD_CHOICES} value={c.threads} onChange={(threads) => updateSection('compute', { threads })} label={labelThreads} />
          <ChoiceRow title="Context length" subtitle="How much of the chat the model can see at once." options={CTX_CHOICES} value={c.nCtx} onChange={(v) => updateSection('compute', { nCtx: v })} label={(v) => labelTokens(v, auto)} />
          <ChoiceRow title="Prompt batch" subtitle="Tokens read per step. Larger is faster to start, needs more memory." options={BATCH_CHOICES} value={c.nBatch} onChange={(nBatch) => updateSection('compute', { nBatch })} label={(v) => String(v)} />
          <ChoiceRow title="Vision token budget" subtitle="Auto uses each model family's own range (Qwen-VL 256-1280, Gemma 4 140-560; fixed-size projectors keep their default). A number caps tokens per photo: more reads finer detail but needs more memory and time. Applies when the model loads." options={VISION_TOKEN_CHOICES} value={c.imageMaxTokens ?? 0} onChange={(imageMaxTokens) => updateSection('compute', { imageMaxTokens })} label={labelVisionTokens} />
        </Rows>
        {active && fit ? <Text variant="small">{`${active.name} at ${nCtx} tokens needs about ${formatBytes(estimateRamBytes(active, nCtx))} of memory: ${FIT_LABEL[fit]}.`}</Text> : null}
        <Text variant="label">Flash attention</Text>
        <Segmented
          label="Flash attention"
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={c.flashAttn}
          onChange={(flashAttn) => updateSection('compute', { flashAttn })}
        />
        <Rows>
          <ListRow title="Map the model file (mmap)" subtitle="Reads the model straight from storage instead of copying it into memory. Keep on unless a model fails to load." switchValue={c.useMmap} onSwitch={(useMmap) => updateSection('compute', { useMmap })} />
          <ListRow title="Lock the model in memory (mlock)" subtitle="Stops Android swapping it out, but can get the app killed on phones with little memory." switchValue={c.useMlock} onSwitch={(useMlock) => updateSection('compute', { useMlock })} />
        </Rows>
      </Group>

      <Group index={4} title="KV cache" hint="The model's short-term memory of the chat.">
        <Rows>
          <ChoiceRow title="Keys type" options={KV_CACHE_TYPES} value={c.cacheTypeK} onChange={(cacheTypeK) => updateSection('compute', { cacheTypeK })} label={KV_LABEL} />
          <ChoiceRow title="Values type" options={KV_CACHE_TYPES} value={c.cacheTypeV} onChange={(cacheTypeV) => updateSection('compute', { cacheTypeV })} label={KV_LABEL} />
          <ListRow
            title="Save the persona prefix to disk"
            subtitle={`${KV_STATUS[kv.status] ?? kv.status}${kv.tokens > 0 ? ` (${kv.tokens} tokens${kv.ms !== null ? `, ${Math.round(kv.ms)} ms` : ''})` : ''}. The next load restores it instead of reading it again.`}
            switchValue={c.kvSessionCache}
            onSwitch={(kvSessionCache) => updateSection('compute', { kvSessionCache })}
          />
        </Rows>
        <Text variant="small">Smaller types save memory on long chats. A quantised values type needs flash attention; if a load fails with it, CHIWIWI retries with f16 and says so.</Text>
        {kv.reason ? <Text variant="small">{kv.reason}</Text> : null}
      </Group>

      <Group index={5} title="Generation" hint="Base sampling. The Soul nudges these a little per chat.">
        <Rows>
          <ListRow title="Let reasoning models think" subtitle="Better answers to hard questions, but slower. Also in the model sheet in Chat." switchValue={s.thinkingEnabled} onSwitch={(thinkingEnabled) => updateSettings({ thinkingEnabled })} />
        </Rows>
        <Slider label="Temperature" value={s.sampling.temperature} min={0} max={2} step={0.05} poles={['Focused', 'Creative']} onChange={(temperature) => updateSection('sampling', { temperature })} />
        <Slider label="Top-p" value={s.sampling.topP} min={0.05} max={1} step={0.05} onChange={(topP) => updateSection('sampling', { topP })} />
        <Slider label="Top-k" value={s.sampling.topK} min={0} max={200} step={1} format={(v) => (v === 0 ? 'Off' : String(v))} onChange={(topK) => updateSection('sampling', { topK })} />
        <Slider label="Min-p" value={s.sampling.minP} min={0} max={1} step={0.01} onChange={(minP) => updateSection('sampling', { minP })} />
        <Slider label="Repeat penalty" value={s.sampling.repeatPenalty} min={1} max={2} step={0.01} onChange={(repeatPenalty) => updateSection('sampling', { repeatPenalty })} />
        <ResetButton
          label="Reset sampling"
          onPress={() => {
            resetSettings('sampling');
            showToast('Sampling reset');
          }}
        />
      </Group>

      <Group index={6} title="Apply">
        {loaded && active ? (
          <Button
            label={`Reload ${active.name}`}
            variant="quiet"
            busyLabel="Reloading..."
            onPress={async () => {
              await engine.unmount();
              const r = await engine.mount(active);
              showToast(r.ok ? 'Model reloaded with the new settings' : r.message);
            }}
          />
        ) : (
          <Text variant="small">No model is loaded. The settings are used when the next one loads.</Text>
        )}
        <Button
          label="Reset all compute settings"
          variant="text"
          onPress={() => {
            resetSettings('compute');
            showToast('Compute settings reset');
          }}
        />
      </Group>
    </Screen>
  );
}
