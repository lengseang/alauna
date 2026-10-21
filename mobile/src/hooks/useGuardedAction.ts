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
  const { debounceMs = 80, enableHaptics = true, onError } = options;
  const [isBusy, setIsBusy] = useState(false);
  const isExecutingRef = useRef(false);
  const lastExecutionTimeRef = useRef(0);
  const actionRef = useRef(action);
  actionRef.current = action;

  const execute = useCallback(
    async (...args: TArgs): Promise<TReturn | undefined> => {
      const now = Date.now();

      // Guard 1: Drop if already busy executing an async action
      if (isExecutingRef.current) {
        return undefined;
      }

      // Guard 2: Fast anti-bounce guard (80ms)
      if (now - lastExecutionTimeRef.current < debounceMs) {
        return undefined;
      }

      lastExecutionTimeRef.current = now;
      isExecutingRef.current = true;

      // Trigger tactile confirmation without blocking
      if (enableHaptics) {
        try {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        } catch {
          // Non-critical if platform haptics unavailable
        }
      }

      // Show spinner only if operation actually takes > 180ms
      let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        if (isExecutingRef.current) {
          setIsBusy(true);
        }
      }, 180);

      try {
        const result = actionRef.current(...args);
        if (result && typeof (result as Promise<TReturn>).then === 'function') {
          return await result;
        }
        return result as TReturn;
      } catch (err: unknown) {
        if (onError) {
          onError(err);
        } else {
          console.warn('[useGuardedAction] Action rejected:', err);
        }
        return undefined;
      } finally {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        isExecutingRef.current = false;
        setIsBusy(false);
      }
    },
    [debounceMs, enableHaptics, onError]
  );

  return { isBusy, execute };
}
