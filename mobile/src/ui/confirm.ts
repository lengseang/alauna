import { Alert } from 'react-native';

/** Promise wrapper around a two-button native confirmation. Resolves true only if the user confirms. */
export function confirm(title: string, message: string, confirmLabel = 'Continue', destructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message: string): void {
  Alert.alert(title, message);
}
