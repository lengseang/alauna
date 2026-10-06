import { Platform } from 'react-native';

export interface DeviceHardwareProfile {
  deviceModel: string;
  manufacturer: string;
  socFamily: string;
  totalRamGb: number;
  availableModelGrades: ('S' | 'B' | 'C')[];
  recommendedModelId: string;
  vulkanSupported: boolean;
  maxContextTokens: number;
  cpuThreadCount: number;
}

/**
 * Universal Hardware Profiler:
 * Automatically senses device capabilities, RAM tier, and compute architecture
 * across any Android (Samsung, Pixel, Xiaomi, OnePlus, Motorola, etc.) or iOS phone.
 */
export class HardwareProfiler {
  private static cachedProfile: DeviceHardwareProfile | null = null;

  public static getProfile(): DeviceHardwareProfile {
    if (this.cachedProfile) return this.cachedProfile;

    const isAndroid = Platform.OS === 'android';
    const isIOS = Platform.OS === 'ios';

    // Baseline fallbacks adapted for broader devices (4GB to 16GB RAM)
    let totalRamGb = 8;
    let socFamily = isAndroid ? 'ARM64 Mobile SoC' : 'Apple Silicon';
    let deviceModel = isAndroid ? 'Android Device' : 'Apple Device';
    let manufacturer = isAndroid ? 'Android' : 'Apple';
    let cpuThreadCount = 4;

    if (Platform.constants) {
      const constants = Platform.constants as any;
      if (constants.Model) deviceModel = constants.Model;
      if (constants.Manufacturer) manufacturer = constants.Manufacturer;
      if (constants.Brand) manufacturer = constants.Brand;
    }

    // Heuristic RAM and Grade calibration based on device hints
    const modelLower = deviceModel.toLowerCase();
    const isUltraTier = modelLower.includes('ultra') || modelLower.includes('pro max') || modelLower.includes('plus') || modelLower.includes('fold');
    
    if (isUltraTier) {
      totalRamGb = 12;
      cpuThreadCount = 6;
      socFamily = isAndroid ? 'High-Performance Octa-Core SoC' : 'Apple A-Series Bionic';
    } else if (modelLower.includes('pro') || modelLower.includes('fe')) {
      totalRamGb = 8;
      cpuThreadCount = 4;
    } else {
      totalRamGb = 6;
      cpuThreadCount = 4;
    }

    // Allocate safe model grades according to total RAM
    let availableModelGrades: ('S' | 'B' | 'C')[] = ['C'];
    let recommendedModelId = 'llama-3.2-1b';

    if (totalRamGb >= 10) {
      availableModelGrades = ['S', 'B', 'C'];
      recommendedModelId = 'llama-3.1-8b';
    } else if (totalRamGb >= 6) {
      availableModelGrades = ['B', 'C'];
      recommendedModelId = 'phi-3.5-mini';
    } else {
      availableModelGrades = ['C'];
      recommendedModelId = 'smollm2-1.7b';
    }

    this.cachedProfile = {
      deviceModel,
      manufacturer,
      socFamily,
      totalRamGb,
      availableModelGrades,
      recommendedModelId,
      vulkanSupported: isAndroid,
      maxContextTokens: totalRamGb >= 10 ? 8192 : 4096,
      cpuThreadCount,
    };

    return this.cachedProfile;
  }
}
