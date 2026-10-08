/**
 * Biometric app lock (expo-local-authentication).
 *
 * - Locks at launch and after `lockAfterMinutes` in the background, when enabled.
 * - Unlock with fingerprint / face, or the phone's PIN/pattern/password (device-credential fallback), so a phone with
 *   a screen lock but no enrolled biometrics still works.
 * - Graceful fallback: if the phone has NO screen lock at all, the lock is "suspended" with an explanation instead of
 *   locking the user out of their own data.
 * - Our own trips to other screens (camera, photo picker, file picker, system unlock screen) never trigger a lock.
 * The UI renders a lock screen while `status` is 'locked' or 'authenticating'.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { Paths } from 'expo-file-system';
import { DEFAULT_SECURITY_PREFS, lockMethodFrom, sanitizeSecurityPrefs, shouldLockOnResume, type LockMethod, type SecurityPrefs } from '../core/appLock.ts';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { createStore } from '../core/store.ts';
import { directoryIO } from './atomicIo.ts';

export type { LockMethod, SecurityPrefs } from '../core/appLock.ts';
export { LOCK_AFTER_CHOICES, DEFAULT_SECURITY_PREFS, sanitizeSecurityPrefs } from '../core/appLock.ts';

type AuthModule = typeof import('expo-local-authentication');

export type LockStatus = 'unlocked' | 'locked' | 'authenticating' | 'suspended';

export interface SecurityState extends SecurityPrefs {
  loaded: boolean;
  status: LockStatus;
  /** What this phone can unlock with (null until checked). */
  method: LockMethod | null;
  /** Enrolled biometric kinds, for labels ("Fingerprint", "Face"). */
  biometrics: Array<'fingerprint' | 'face' | 'iris'>;
  /** Why the last unlock failed or why the lock is suspended; null when nothing to say. */
  message: string | null;
}

export const securityStore = createStore<SecurityState>({
  ...DEFAULT_SECURITY_PREFS,
  loaded: false,
  status: 'unlocked',
  method: null,
  biometrics: [],
  message: null,
});

export function useSecurity(): SecurityState {
  return useSyncExternalStore(securityStore.subscribe, securityStore.getState);
}

const FILE_NAME = 'chiwiwi_security.json';
const io = () => directoryIO(() => Paths.document);
const NOT_IN_BUILD = 'App lock (expo-local-authentication) is not in this build of the app. Install the latest APK.';
const NO_SCREEN_LOCK = 'App lock is paused: this phone has no screen lock. Set a PIN, pattern or fingerprint in Android settings and it turns back on.';

function auth(): AuthModule | null {
  try {
    return require('expo-local-authentication') as AuthModule;
  } catch {
    return null;
  }
}

function prefsOf(s: SecurityState): SecurityPrefs {
  return { appLock: s.appLock, lockAfterMinutes: s.lockAfterMinutes };
}

function save(prefs: SecurityPrefs): void {
  try {
    writeAtomic(io(), FILE_NAME, JSON.stringify(prefs));
  } catch {
    // keep running with the in-memory value
  }
}

/** What the phone can unlock with right now (the user may add/remove a screen lock at any time). */
export async function detectLockMethod(): Promise<LockMethod> {
  const a = auth();
  if (!a) {
    securityStore.setState({ method: 'none', biometrics: [] });
    return 'none';
  }
  try {
    const [level, types] = await Promise.all([a.getEnrolledLevelAsync(), a.supportedAuthenticationTypesAsync()]);
    const method = lockMethodFrom(Number(level));
    const names = { 1: 'fingerprint', 2: 'face', 3: 'iris' } as const;
    const biometrics = method === 'biometric' ? types.map((t) => names[Number(t) as 1 | 2 | 3]).filter(Boolean) : [];
    securityStore.setState({ method, biometrics });
    return method;
  } catch {
    securityStore.setState({ method: 'none', biometrics: [] });
    return 'none';
  }
}

/** Lock now if enabled (or suspend with a reason when the phone cannot unlock). */
async function engageLock(): Promise<void> {
  if (!securityStore.getState().appLock) return;
  const method = await detectLockMethod();
  if (method === 'none') securityStore.setState({ status: 'suspended', message: auth() ? NO_SCREEN_LOCK : NOT_IN_BUILD });
  else securityStore.setState({ status: 'locked', message: null });
}

let backgroundAt: number | null = null;
let externalAt = 0;
let listening = false;
/** A trip to another screen only counts as ours if the app leaves the foreground this soon after we asked for it. */
const EXTERNAL_WINDOW_MS = 10_000;

/**
 * Call right before opening another app/screen on the user's behalf (camera, pickers, Android settings). The next
 * background -> foreground round trip then does not count as "left the app".
 */
export function expectExternalActivity(): void {
  externalAt = Date.now();
}

function installAppStateListener(): void {
  if (listening) return;
  listening = true;
  AppState.addEventListener('change', (next) => {
    const s = securityStore.getState();
    if (next === 'background') {
      if (s.status === 'authenticating' || Date.now() - externalAt < EXTERNAL_WINDOW_MS) return;
      backgroundAt = Date.now();
    } else if (next === 'active') {
      const away = backgroundAt;
      backgroundAt = null;
      externalAt = 0;
      if (s.status === 'unlocked' && shouldLockOnResume(prefsOf(s), away, Date.now())) void engageLock();
      else if (s.status === 'suspended' && s.appLock) void engageLock(); // a screen lock may have been set meanwhile
    }
  });
}

/** Boot step: load prefs and lock if the app lock is on. Call before showing any chat content. */
let initPromise: Promise<void> | null = null;
export function initSecurity(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      let prefs = DEFAULT_SECURITY_PREFS;
      try {
        prefs = (await readWithFallback(io(), FILE_NAME, (t) => sanitizeSecurityPrefs(JSON.parse(t)))) ?? DEFAULT_SECURITY_PREFS;
      } catch {
        // corrupt -> defaults (lock off) rather than a locked-out app
      }
      securityStore.setState({ ...prefs, loaded: true });
      installAppStateListener();
      await engageLock();
    })();
  }
  return initPromise;
}

function failureMessage(error: string): string {
  switch (error) {
    case 'user_cancel':
    case 'system_cancel':
    case 'app_cancel':
      return 'Unlock was cancelled.';
    case 'lockout':
      return 'Too many attempts. Use your phone PIN/pattern, or wait and try again.';
    case 'not_enrolled':
    case 'passcode_not_set':
    case 'not_available':
      return NO_SCREEN_LOCK;
    default:
      return `Could not unlock (${error}). Try again.`;
  }
}

async function authenticate(prompt: string): Promise<{ ok: true } | { ok: false; error: string; message: string }> {
  const a = auth();
  if (!a) return { ok: false, error: 'not_available', message: NOT_IN_BUILD };
  try {
    const r = await a.authenticateAsync({ promptMessage: prompt, disableDeviceFallback: false });
    return r.success ? { ok: true } : { ok: false, error: r.error, message: failureMessage(r.error) };
  } catch (e) {
    return { ok: false, error: 'unknown', message: `Could not unlock: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Show the system unlock prompt. Resolves true when unlocked. */
export async function unlock(): Promise<boolean> {
  const s = securityStore.getState();
  if (s.status === 'unlocked' || s.status === 'suspended') return true;
  if (s.status === 'authenticating') return false;
  securityStore.setState({ status: 'authenticating', message: null });
  const r = await authenticate('Unlock CHIWIWI');
  if (r.ok) {
    securityStore.setState({ status: 'unlocked', message: null });
    return true;
  }
  if (r.error === 'not_enrolled' || r.error === 'passcode_not_set' || r.error === 'not_available') {
    securityStore.setState({ status: 'suspended', message: r.message }); // never lock the owner out of their data
    return true;
  }
  securityStore.setState({ status: 'locked', message: r.message });
  return false;
}

export type SetLockResult = { ok: true } | { ok: false; message: string };

/** Turn the app lock on (requires a successful unlock first, proving the user can get back in) or off. */
export async function setAppLock(enabled: boolean): Promise<SetLockResult> {
  if (!enabled) {
    securityStore.setState({ appLock: false, status: 'unlocked', message: null });
    save(prefsOf(securityStore.getState()));
    return { ok: true };
  }
  const method = await detectLockMethod();
  if (method === 'none') return { ok: false, message: auth() ? 'Set a screen lock (PIN, pattern, fingerprint or face) on this phone first.' : NOT_IN_BUILD };
  const r = await authenticate('Confirm it is you to turn on app lock');
  if (!r.ok) return { ok: false, message: r.message };
  securityStore.setState({ appLock: true, status: 'unlocked', message: null });
  save(prefsOf(securityStore.getState()));
  return { ok: true };
}

export function setLockAfterMinutes(minutes: number): void {
  const prefs = sanitizeSecurityPrefs({ ...prefsOf(securityStore.getState()), lockAfterMinutes: minutes });
  securityStore.setState(prefs);
  save(prefs);
}

/** Lock immediately (e.g. a "Lock now" button). */
export async function lockNow(): Promise<void> {
  await engageLock();
}
