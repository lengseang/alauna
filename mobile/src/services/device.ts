import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { formatBytes } from '../core/format.ts';

export interface DeviceProfile {
  /** "Samsung SM-S918B" - what the OS reports, never a hard-coded phone. */
  name: string;
  brand: string | null;
  modelName: string | null;
  osName: string;
  osVersion: string | null;
  apiLevel: number | null;
  /** Physical RAM as reported by the OS (a "12 GB" phone reports ~11.2 GB). */
  totalRamBytes: number | null;
  cpuArchitectures: string[];
  is64Bit: boolean;
  /** False when this build cannot run the engine at all (e.g. 32-bit only phone). */
  supported: boolean;
  unsupportedReason?: string;
  /** One-line summary for headers. */
  summary: string;
}

let cached: DeviceProfile | null = null;

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export function getDeviceProfile(): DeviceProfile {
  if (cached) return cached;

  const brand = Device.brand ?? Device.manufacturer ?? null;
  const modelName = Device.modelName ?? null;
  const osName = Device.osName ?? Platform.OS;
  const archs = Device.supportedCpuArchitectures ?? [];
  const is64Bit = Platform.OS !== 'android' || archs.length === 0 || archs.some((a) => /64/.test(a));
  const total = typeof Device.totalMemory === 'number' && Device.totalMemory > 0 ? Device.totalMemory : null;

  let supported = true;
  let unsupportedReason: string | undefined;
  if (Platform.OS === 'web') {
    supported = false;
    unsupportedReason = 'CHIWIWI needs a phone. The on-device AI engine does not run in a browser.';
  } else if (!is64Bit) {
    supported = false;
    unsupportedReason = 'This phone is 32-bit only. The AI engine needs a 64-bit (arm64) phone.';
  }

  const name = [brand ? capitalize(brand) : null, modelName].filter(Boolean).join(' ') || (Platform.OS === 'ios' ? 'iPhone' : 'Android phone');
  const bits: string[] = [name];
  bits.push(`${osName} ${Device.osVersion ?? ''}`.trim());
  if (total) bits.push(`${formatBytes(total)} RAM`);
  if (archs.length > 0) bits.push(archs[0]);

  cached = {
    name,
    brand,
    modelName,
    osName,
    osVersion: Device.osVersion ?? null,
    apiLevel: Device.platformApiLevel ?? null,
    totalRamBytes: total,
    cpuArchitectures: archs,
    is64Bit,
    supported,
    unsupportedReason,
    summary: bits.join(' · '),
  };
  return cached;
}
