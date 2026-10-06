import { useState, useCallback, useRef } from 'react';
import * as Haptics from 'expo-haptics';

export interface GuardedActionOptions {
  /** Debounce / cooldown window in milliseconds after completion (default: 400ms) */
  debounceMs?: number;
  /** Whether to trigger subtle haptic feedback on invocation (default: true) */
  enableHaptics?: boolean;
  /** Custom error handler to prevent unhandled promise rejections */
  onError?: (error: unknown) => void;
}

export interface GuardedActionReturn<TArgs extends any[], TReturn> {
  isBusy: boolean;
  execute: (...args: TArgs) => Promise<TReturn | undefined>;
}

/**
 * Enterprise Interaction Guard Hook
 * Prevents rapid multi-taps, race conditions, and unhandled promise rejections.
 */
export function useGuardedAction<TArgs extends any[] = any[], TReturn = any>(
  action: (...args: TArgs) => Promise<TReturn> | TReturn,
  options: GuardedActionOptions = {}
): GuardedActionReturn<TArgs, TReturn> {
  const { debounceMs = 400, enableHaptics = true, onError } = options;
  const [isBusy, setIsBusy] = useState(false);
  const isExecutingRef = useRef(false);
  const lastExecutionTimeRef = useRef(0);

  const execute = useCallback(
    async (...args: TArgs): Promise<TReturn | undefined> => {
      const now = Date.now();

      // Guard 1: Drop if already busy executing
      if (isExecutingRef.current) {
        return undefined;
      }

      // Guard 2: Drop if within debounce window
      if (now - lastExecutionTimeRef.current < debounceMs) {
        return undefined;
      }

      isExecutingRef.current = true;
      setIsBusy(true);

      // Trigger tactile confirmation
      if (enableHaptics) {
        try {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } catch {
          // Non-critical if platform haptics unavailable
        }
      }

      try {
        const result = await action(...args);
        lastExecutionTimeRef.current = Date.now();
        return result;
      } catch (err: unknown) {
        lastExecutionTimeRef.current = Date.now();
        if (onError) {
          onError(err);
        } else {
          console.warn('[useGuardedAction] Action rejected:', err);
        }
        return undefined;
      } finally {
        isExecutingRef.current = false;
        setIsBusy(false);
      }
    },
    [action, debounceMs, enableHaptics, onError]
  );

  return { isBusy, execute };
}
