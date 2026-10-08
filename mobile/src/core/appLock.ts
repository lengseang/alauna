/**
 * App lock policy (pure). services/security.ts adds expo-local-authentication and AppState.
 * W2 may fold SecurityPrefs into Settings: DEFAULT_SECURITY_PREFS + sanitizeSecurityPrefs are the helper for that.
 */

export interface SecurityPrefs {
  /** Ask for fingerprint / face / screen lock when CHIWIWI opens. */
  appLock: boolean;
  /** Lock again after this many minutes in the background (0 = as soon as it leaves the screen). */
  lockAfterMinutes: number;
}

export const LOCK_AFTER_CHOICES = [0, 1, 5, 15, 30] as const;

export const DEFAULT_SECURITY_PREFS: SecurityPrefs = { appLock: false, lockAfterMinutes: 1 };

export function sanitizeSecurityPrefs(raw: unknown): SecurityPrefs {
  const out = { ...DEFAULT_SECURITY_PREFS };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.appLock === 'boolean') out.appLock = r.appLock;
  if (typeof r.lockAfterMinutes === 'number' && Number.isFinite(r.lockAfterMinutes)) {
    out.lockAfterMinutes = Math.min(24 * 60, Math.max(0, Math.round(r.lockAfterMinutes)));
  }
  return out;
}

/**
 * What the phone can unlock with. From expo-local-authentication's SecurityLevel:
 * 0 NONE, 1 SECRET (PIN/pattern/password), 2 BIOMETRIC_WEAK, 3 BIOMETRIC_STRONG.
 */
export type LockMethod = 'biometric' | 'screen-lock' | 'none';

export function lockMethodFrom(securityLevel: number): LockMethod {
  if (securityLevel >= 2) return 'biometric';
  if (securityLevel === 1) return 'screen-lock';
  return 'none';
}

/** Lock when coming back to the foreground? `backgroundAt` = when the app left the screen (null = it never did). */
export function shouldLockOnResume(prefs: SecurityPrefs, backgroundAt: number | null, now: number): boolean {
  if (!prefs.appLock || backgroundAt === null) return false;
  return now - backgroundAt >= prefs.lockAfterMinutes * 60_000;
}
