import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { AlertIcon, FolderIcon, InfoIcon, StorageIcon } from '../components/Icons';
import {
  applyPickedFolder,
  canPickExternalFolder,
  chooseExternalFolder,
  openAllFilesAccessSettings,
  useInternalStorage,
  type ExternalResult,
} from '../services/storage.ts';
import { Btn } from './Btn';
import { Card } from './kit';
import { colors, font } from './theme';

type Phase =
  | { kind: 'idle' }
  | { kind: 'needs_permission'; pickedUri: string; rootPath?: string; message: string }
  | { kind: 'error'; message: string };

interface Props {
  /** Called after a location has been accepted AND proven writable. */
  onDone: () => void | Promise<void>;
}

/**
 * Choose where CHIWIWI keeps models and chats (docs/REQUIREMENTS.md ST-1..ST-5).
 * A folder is only accepted after a real write/read test; if Android needs
 * "All files access" we walk the user through it and re-check automatically when
 * they come back.
 */
export function StoragePicker({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const handle = useCallback(
    async (r: ExternalResult) => {
      if (r.ok) {
        setPhase({ kind: 'idle' });
        await onDone();
      } else if (r.reason === 'cancelled') {
        setPhase({ kind: 'idle' });
      } else if (r.reason === 'needs_permission' && r.pickedUri) {
        setPhase({ kind: 'needs_permission', pickedUri: r.pickedUri, rootPath: r.rootPath, message: r.message });
      } else {
        setPhase({ kind: 'error', message: r.message });
      }
    },
    [onDone],
  );

  const chooseFolder = useCallback(async () => handle(await chooseExternalFolder()), [handle]);

  const grantAccess = useCallback(async () => {
    const p = phaseRef.current;
    if (p.kind !== 'needs_permission') return;
    await openAllFilesAccessSettings();
    await handle(await applyPickedFolder(p.pickedUri));
  }, [handle]);

  const useApp = useCallback(async () => {
    await useInternalStorage();
    setPhase({ kind: 'idle' });
    await onDone();
  }, [onDone]);

  // Coming back from the system "All files access" screen: re-check without another tap.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const p = phaseRef.current;
      if (state === 'active' && p.kind === 'needs_permission') void applyPickedFolder(p.pickedUri).then(handle);
    });
    return () => sub.remove();
  }, [handle]);

  return (
    <View style={{ gap: 12 }}>
      {canPickExternalFolder() ? (
        <Card>
          <View style={styles.titleRow}>
            <FolderIcon size={22} color={colors.accent} />
            <Text style={styles.title}>Choose a folder</Text>
          </View>
          <Text style={styles.body}>
            Pick a folder on your phone or SD card. CHIWIWI creates a "CHIWIWI" folder inside it for your models and chats. Your models stay even if you uninstall the app.
          </Text>
          <Text style={styles.hint}>Android will ask you to allow "All files access" so the AI engine can read the model files.</Text>
          <Btn variant="primary" label="Choose folder" icon={<FolderIcon size={16} color={colors.black} />} busyLabel="Waiting for you to pick..." onPress={chooseFolder} />
        </Card>
      ) : null}

      {phase.kind === 'needs_permission' ? (
        <Card style={{ borderColor: colors.warn }}>
          <View style={styles.titleRow}>
            <AlertIcon size={18} />
            <Text style={[styles.title, { color: colors.warn }]}>One more step</Text>
          </View>
          <Text style={styles.body}>{phase.message}</Text>
          <Text style={styles.hint}>In the screen that opens, turn on "Allow access to manage all files" for CHIWIWI, then press Back. CHIWIWI checks the folder again automatically.</Text>
          <Btn variant="primary" label="Open Android settings" busyLabel="Checking..." onPress={grantAccess} />
        </Card>
      ) : null}

      {phase.kind === 'error' ? (
        <Card style={{ borderColor: colors.bad }}>
          <View style={styles.titleRow}>
            <AlertIcon size={18} color={colors.bad} />
            <Text style={[styles.title, { color: colors.bad }]}>That did not work</Text>
          </View>
          <Text style={styles.body}>{phase.message}</Text>
        </Card>
      ) : null}

      <Card>
        <View style={styles.titleRow}>
          <StorageIcon size={22} color={colors.good} />
          <Text style={styles.title}>Use app storage</Text>
        </View>
        <Text style={styles.body}>The simplest option. Needs no permission and always works. Files are private to CHIWIWI and are deleted if you uninstall the app.</Text>
        <Btn variant={canPickExternalFolder() ? 'secondary' : 'primary'} label="Use app storage" busyLabel="Setting up..." onPress={useApp} />
      </Card>

      <View style={styles.note}>
        <InfoIcon size={14} />
        <Text style={styles.hint}>You can change this later in Settings → Storage. Models are large (1–7 GB), so make sure there is free space.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: font.lg, fontWeight: '700' },
  body: { color: colors.muted, fontSize: font.md, lineHeight: 21 },
  hint: { color: colors.faint, fontSize: font.sm, lineHeight: 18, flex: 1 },
  note: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, alignItems: 'flex-start' },
});
