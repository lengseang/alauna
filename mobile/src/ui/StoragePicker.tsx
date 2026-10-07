import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { applyPickedFolder, canPickExternalFolder, chooseExternalFolder, openAllFilesAccessSettings, useInternalStorage, type ExternalResult } from '../services/storage.ts';
import { makeStyles } from '../theme';
import { Button } from './Button';
import { Card } from './Card';
import { Notice } from './Notice';
import { Text } from './Text';

type Phase = { kind: 'idle' } | { kind: 'needs_permission'; pickedUri: string; rootPath?: string; message: string } | { kind: 'error'; message: string };

interface Props {
  /** Called after a location has been accepted AND proven writable. */
  onDone: () => void | Promise<void>;
}

/**
 * Choose where CHIWIWI keeps models and chats (docs/REQUIREMENTS.md ST-1..ST-5).
 * A folder is only accepted after a real write/read test; if Android needs "All files access" we walk the user
 * through it and re-check automatically when they come back.
 */
export function StoragePicker({ onDone }: Props) {
  const s = useStyles();
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

  const external = canPickExternalFolder();
  return (
    <View style={s.root}>
      <Card>
        <Text variant="title">App storage</Text>
        <Text tone="muted">The simplest option. Needs no permission and always works. Files are private to CHIWIWI and are deleted if you uninstall the app.</Text>
        <Button label="Use app storage" variant={external ? 'quiet' : 'primary'} busyLabel="Setting up..." onPress={useApp} />
      </Card>

      {external ? (
        <Card>
          <Text variant="title">Your own folder</Text>
          <Text tone="muted">
            Pick a folder on your phone or SD card. CHIWIWI creates a "CHIWIWI" folder inside it, and your models stay even if you uninstall the app. Android will ask you to allow "All files access"
            so the engine can read the model files.
          </Text>
          <Button label="Choose folder" variant="quiet" busyLabel="Waiting for you to pick..." onPress={chooseFolder} />
        </Card>
      ) : null}

      {phase.kind === 'needs_permission' ? (
        <Notice action={<Button label="Open Android settings" busyLabel="Checking..." onPress={grantAccess} />}>
          {`One more step. ${phase.message} In the screen that opens, turn on "Allow access to manage all files" for CHIWIWI, then press Back. CHIWIWI checks the folder again by itself.`}
        </Notice>
      ) : null}

      {phase.kind === 'error' ? <Notice tone="danger">{`That did not work. ${phase.message}`}</Notice> : null}

      <Text variant="small">You can change this later in Settings, Storage. Models are large (1 to 7 GB), so make sure there is free space.</Text>
    </View>
  );
}

const useStyles = makeStyles(({ space }) => ({
  root: { gap: space.lg },
}));
