/**
 * System Notification Manager for model downloads and integrity verification.
 * Directly integrates with native Android NotificationCompat to show real-time progress in the status bar.
 */
import { NativeModules, Platform } from 'react-native';
import { formatBytes } from '../../core/format.ts';

const NativeDownloadNotif = NativeModules.DownloadNotification;

export function showDownloadProgressNotification(
  key: string,
  modelName: string,
  receivedBytes: number,
  totalBytes: number,
  bytesPerSecond: number,
  etaSeconds: number
): void {
  if (Platform.OS !== 'android' || !NativeDownloadNotif) return;

  const percent = totalBytes > 0 ? Math.round((receivedBytes / totalBytes) * 100) : 0;
  const speedStr = bytesPerSecond > 0 ? `${formatBytes(bytesPerSecond)}/s` : '';
  const etaStr = etaSeconds > 0 ? `ETA ${etaSeconds}s` : '';
  const metaParts = [speedStr, etaStr].filter(Boolean).join(' • ');
  const text = `${formatBytes(receivedBytes)} / ${formatBytes(totalBytes)} (${percent}%)${metaParts ? ` • ${metaParts}` : ''}`;

  try {
    NativeDownloadNotif.showProgress(key, `Downloading ${modelName}`, text, percent, false);
  } catch {
    // safe fallback
  }
}

export function showVerifyingNotification(
  key: string,
  modelName: string,
  fraction: number
): void {
  if (Platform.OS !== 'android' || !NativeDownloadNotif) return;

  const percent = Math.round(fraction * 100);
  const text = `Verifying SHA-256 integrity (${percent}%)...`;

  try {
    NativeDownloadNotif.showProgress(key, `Verifying ${modelName}`, text, percent, false);
  } catch {
    // safe fallback
  }
}

export function showUnpackingNotification(
  key: string,
  modelName: string
): void {
  if (Platform.OS !== 'android' || !NativeDownloadNotif) return;

  try {
    NativeDownloadNotif.showProgress(key, `Unpacking ${modelName}`, 'Extracting neural weights & voice models...', 100, true);
  } catch {
    // safe fallback
  }
}

export function showDownloadCompleteNotification(
  key: string,
  modelName: string
): void {
  if (Platform.OS !== 'android' || !NativeDownloadNotif) return;

  try {
    NativeDownloadNotif.showComplete(key, `${modelName} Ready`, 'Download verified and ready on device.');
  } catch {
    // safe fallback
  }
}

export function cancelDownloadNotification(key: string): void {
  if (Platform.OS !== 'android' || !NativeDownloadNotif) return;

  try {
    NativeDownloadNotif.cancel(key);
  } catch {
    // safe fallback
  }
}
