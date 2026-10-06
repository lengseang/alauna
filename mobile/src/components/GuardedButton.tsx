import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { useGuardedAction, GuardedActionOptions } from '../hooks/useGuardedAction';

export interface GuardedButtonProps extends Omit<TouchableOpacityProps, 'onPress'> {
  onPress: () => Promise<void> | void;
  debounceMs?: number;
  enableHaptics?: boolean;
  onError?: (err: unknown) => void;
  loadingIndicatorColor?: string;
  showLoadingSpinner?: boolean;
  children: React.ReactNode;
}

/**
 * Production Guarded Button Component
 * Enforces busy debouncing, disabling during async execution, visual opacity feedback,
 * and error boundary catch logic.
 */
export const GuardedButton: React.FC<GuardedButtonProps> = ({
  onPress,
  debounceMs = 450,
  enableHaptics = true,
  onError,
  loadingIndicatorColor = '#ffffff',
  showLoadingSpinner = false,
  disabled,
  style,
  children,
  ...rest
}) => {
  const { isBusy, execute } = useGuardedAction(onPress, {
    debounceMs,
    enableHaptics,
    onError,
  });

  const isDisabled = disabled || isBusy;

  return (
    <TouchableOpacity
      {...rest}
      onPress={execute}
      disabled={isDisabled}
      activeOpacity={0.7}
      style={[
        style,
        isDisabled && styles.disabledStyle,
      ]}
    >
      {isBusy && showLoadingSpinner ? (
        <View style={styles.spinnerContainer}>
          <ActivityIndicator size="small" color={loadingIndicatorColor} />
        </View>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  disabledStyle: {
    opacity: 0.55,
  },
  spinnerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default GuardedButton;
