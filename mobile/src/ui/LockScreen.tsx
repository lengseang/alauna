import React, { useEffect } from 'react';
import { BackHandler, Modal, View } from 'react-native';
import { unlock, useSecurity } from '../services/security.ts';
import { makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { Button } from './Button';
import { Icon } from './Icon';
import { Notice } from './Notice';
import { Text } from './Text';
import { Wordmark } from './Wordmark';

/**
 * Biometric app lock. A Modal, so it also covers any open sheet or the voice overlay. Asks once on appear; the button
 * asks again (fingerprint / face, or the phone PIN / pattern). Android Back leaves the app, never past the lock.
 */
export function LockScreen() {
  const s = useStyles();
  const sec = useSecurity();
  const visible = sec.status === 'locked' || sec.status === 'authenticating';

  // Ask once each time the lock appears; later attempts come from the button.
  useEffect(() => {
    if (visible) void unlock();
  }, [visible]);

  if (!visible) return null;
  const how = sec.biometrics.includes('face') ? 'face' : sec.biometrics.includes('fingerprint') ? 'fingerprint' : 'screen lock';
  return (
    <Modal visible transparent={false} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => BackHandler.exitApp()}>
      <View style={s.root}>
        <Ambient />
        <View style={s.col}>
          <Wordmark />
          <Icon name="lock" size={32} />
          <Text variant="title" style={s.center}>
            CHIWIWI is locked
          </Text>
          <Text variant="small" style={s.center}>
            {`Unlock with your ${how} to see your chats.`}
          </Text>
          {sec.message ? <Notice tone="danger">{sec.message}</Notice> : null}
          <Button label="Unlock" icon="lock" loading={sec.status === 'authenticating'} busyLabel="Waiting for unlock" onPress={() => unlock()} />
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, space }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  col: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  center: { textAlign: 'center' },
}));
