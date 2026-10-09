import React, { useRef } from 'react';
import { getModel } from '../../core/catalog.ts';
import { useNetworkGate } from '../../services/networkGate.ts';
import { runIntegrityCheck, useIntegrity, type IntegrityReport } from '../../services/privacy.ts';
import { LOCK_AFTER_CHOICES, lockNow, setAppLock, setLockAfterMinutes, useSecurity } from '../../services/security.ts';
import { updateSettings, useSettings } from '../../services/settings.ts';
import { showToast } from '../../services/toast.ts';
import { Button } from '../Button';
import { confirm } from '../confirm';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ProgressBar } from '../ProgressBar';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Stat } from '../Stat';
import { Text } from '../Text';
import { labelDays, labelMinutes, PURGE_DAYS_CHOICES } from './logic';
import { ChoiceRow, galleryHidden, Group, PurgeActions, Rows, StatRow } from './parts';

const KIND: Record<string, string> = { fingerprint: 'Fingerprint', face: 'Face', iris: 'Iris' };

const MEMORY_WORDS = { ok: 'Readable', missing: 'No file yet (nothing saved)', corrupt: 'Damaged' } as const;

function reportRows(r: IntegrityReport): Array<[string, string, boolean]> {
  const chats = r.chats;
  const rows: Array<[string, string, boolean]> = [
    ['Chats', `${chats.ok} readable${chats.recovered.length ? `, ${chats.recovered.length} recovered from the backup copy` : ''}${chats.corrupt.length ? `, ${chats.corrupt.length} unreadable` : ''}`, chats.corrupt.length === 0],
    ['Memory', MEMORY_WORDS[r.memory], r.memory !== 'corrupt'],
    ['Settings', MEMORY_WORDS[r.settings], r.settings !== 'corrupt'],
  ];
  for (const m of r.models) rows.push([getModel(m.modelId)?.name ?? m.name, m.cancelled ? 'Cancelled' : m.ok ? 'Matches the official file' : 'Does NOT match the official file: delete and download it again', m.ok || m.cancelled]);
  return rows;
}

/** Settings > Security and privacy: app lock, incognito, offline-strict, auto-purge, integrity check, erase. */
export function SecurityScreen() {
  const settings = useSettings();
  const sec = useSecurity();
  const gate = useNetworkGate();
  const integrity = useIntegrity();
  const token = useRef({ cancelled: false });

  const lockDetail =
    sec.method === 'biometric'
      ? `Unlocks with ${sec.biometrics.map((b) => KIND[b] ?? b).join(' or ').toLowerCase() || 'your biometrics'}; your PIN works too.`
      : sec.method === 'screen-lock'
        ? 'Unlocks with your phone PIN, pattern or password.'
        : sec.method === 'none'
          ? 'This phone has no screen lock. Set one in Android settings first.'
          : 'Asks for your fingerprint, face or phone PIN when you open the app.';
  const hidden = galleryHidden();
  const stepName = integrity.step === 'chats' || integrity.step === 'memory' || integrity.step === 'settings' ? `your ${integrity.step}` : (getModel(integrity.step)?.name ?? 'a model');

  const check = async (models: boolean) => {
    token.current = { cancelled: false };
    const r = await runIntegrityCheck({ models, token: token.current });
    showToast(r.summary);
  };

  return (
    <Screen title="Security" onBack={goBack} scroll>
      <Group index={1} title="App lock" hint="Protects the app on this phone; it is not encryption.">
        {sec.status === 'suspended' && sec.message ? <Notice tone="quiet">{sec.message}</Notice> : null}
        {sec.status !== 'suspended' && sec.message ? <Notice tone="danger">{sec.message}</Notice> : null}
        <Rows>
          <ListRow
            title="Lock with fingerprint or screen lock"
            subtitle={lockDetail}
            switchValue={sec.appLock}
            onSwitch={async (on) => {
              const r = await setAppLock(on);
              if (!r.ok) showToast(r.message);
            }}
          />
          <ChoiceRow title="Lock again" options={LOCK_AFTER_CHOICES} value={sec.lockAfterMinutes as (typeof LOCK_AFTER_CHOICES)[number]} onChange={setLockAfterMinutes} label={labelMinutes} disabled={!sec.appLock} />
        </Rows>
        {sec.appLock && sec.status === 'unlocked' ? <Button label="Lock now" variant="quiet" icon="lock" onPress={lockNow} /> : null}
      </Group>

      <Group index={2} title="Privacy" hint="What stays on the phone and what may leave it.">
        <Rows>
          <ListRow title="Incognito by default" subtitle="New chats are never written to disk and are gone when you leave them." icon="incognito" switchValue={settings.incognitoDefault} onSwitch={(v) => updateSettings({ incognitoDefault: v })} />
          <ListRow
            title="Offline only (strict)"
            subtitle="Blocks every network request except downloads you start yourself."
            icon="shield"
            switchValue={settings.offlineStrict}
            onSwitch={(v) => updateSettings({ offlineStrict: v })}
          />
          <ListRow title="Hidden from gallery apps" subtitle="A .nomedia marker keeps photo and cloud apps out of your chats' images." value={hidden === null ? 'unknown' : hidden ? 'Always on' : 'Not found'} />
        </Rows>
        <StatRow>
          <Stat label="Blocked this session" value={gate.blockedCount} unit="requests" />
          <Stat label="Last blocked" value={gate.lastBlocked ? new Date(gate.lastBlocked.at).toLocaleTimeString() : null} hint={gate.lastBlocked ? gate.lastBlocked.purpose : 'nothing yet'} />
        </StatRow>
      </Group>

      <Group index={3} title="Auto-delete" hint="Old chats are deleted when the app opens. Pinned chats are kept.">
        <ChoiceRow
          title="Delete chats not used for"
          options={PURGE_DAYS_CHOICES}
          value={(PURGE_DAYS_CHOICES as readonly number[]).includes(settings.autoPurgeDays) ? (settings.autoPurgeDays as (typeof PURGE_DAYS_CHOICES)[number]) : 0}
          label={labelDays}
          onChange={async (d) => {
            if (d === 0 || (await confirm('Delete old chats automatically?', `Chats you have not opened for ${labelDays(d)} will be deleted the next time the app opens, starting now. Pinned chats are kept.`, 'Turn on', true))) updateSettings({ autoPurgeDays: d });
          }}
        />
      </Group>

      <Group index={4} title="Integrity check" hint="Reads your chats, memory and settings files and reports damage. The model check compares each file with its official SHA-256 and takes minutes per gigabyte.">
        {integrity.running ? (
          <>
            <Text>{`Checking ${stepName}...`}</Text>
            <ProgressBar fraction={integrity.fraction} label="Integrity check progress" />
            <Button
              label="Cancel"
              variant="quiet"
              onPress={() => {
                token.current.cancelled = true;
              }}
            />
          </>
        ) : (
          <>
            <Button label="Check my data" variant="quiet" busyLabel="Checking..." onPress={() => check(false)} />
            <Button label="Also verify model files (slow)" variant="quiet" onPress={() => check(true)} />
          </>
        )}
        {integrity.report ? (
          <>
            <Text variant="strong">{integrity.report.summary}</Text>
            <Rows>
              {reportRows(integrity.report).map(([k, v, good]) => (
                <ListRow key={k} title={k} subtitle={v} value={good ? 'OK' : 'Problem'} />
              ))}
            </Rows>
            <Text variant="small">{`Finished ${new Date(integrity.report.finishedAt).toLocaleTimeString()} in ${((integrity.report.finishedAt - integrity.report.startedAt) / 1000).toFixed(1)} s.`}</Text>
          </>
        ) : null}
      </Group>

      <Group index={5} title="Erase" hint="Each action asks first.">
        <PurgeActions kinds={['chats', 'memory', 'all']} />
      </Group>
    </Screen>
  );
}
