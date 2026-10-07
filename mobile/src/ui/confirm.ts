import { Alert } from 'react-native';

let dialogOpen = false;

/**
 * Promise wrapper around a two-button native confirmation. Resolves true only if the user confirms.
 * Only one dialog at a time: a second request while one is showing (double-tap on a trash icon) resolves
 * false instead of stacking a second dialog that would run the action twice.
 */
export function confirm(title: string, message: string, confirmLabel = 'Continue', destructive = false): Promise<boolean> {
  if (dialogOpen) return Promise.resolve(false);
  dialogOpen = true;
  return new Promise((resolve) => {
    const done = (answer: boolean) => {
      dialogOpen = false;
      resolve(answer);
    };
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => done(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => done(true) },
      ],
      { cancelable: true, onDismiss: () => done(false) },
    );
  });
}

export function notify(title: string, message: string): void {
  Alert.alert(title, message);
}
