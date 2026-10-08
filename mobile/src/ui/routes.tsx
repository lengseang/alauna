import type React from 'react';
import { DownloadsScreen } from './DownloadsScreen';
import { ModelDetailScreen } from './ModelDetailScreen';
import { ModelsScreen } from './ModelsScreen';
import { SpeculativeScreen } from './SpeculativeScreen';
import { AboutScreen, AdvancedComputeScreen, AppearanceScreen, AudioVoiceScreen, MemoryScreen, SecurityScreen, SettingsHome, SoulScreen, StorageScreen, ThreadSoulSheet } from './SettingsScreens';

/**
 * Route registry: name -> screen. Add ONE line per screen (wave 2: S1 chat extras, S2 vault/downloads/speculative,
 * S3 settings sub-screens). The name becomes a typed Route for push(); 'chat' is the always-mounted root.
 * Read params inside a screen with useParams() from ./nav.
 */
export const SCREENS = {
  models: ModelsScreen,
  'models/detail': ModelDetailScreen,
  downloads: DownloadsScreen,
  speculative: SpeculativeScreen,
  persona: SoulScreen,
  'persona/memory': MemoryScreen,
  settings: SettingsHome,
  'settings/soul': SoulScreen,
  'settings/memory': MemoryScreen,
  'settings/storage': StorageScreen,
  'settings/audio': AudioVoiceScreen,
  'settings/security': SecurityScreen,
  'settings/advanced': AdvancedComputeScreen,
  'settings/appearance': AppearanceScreen,
  'settings/about': AboutScreen,
  threadSoul: ThreadSoulSheet,
} satisfies Record<string, React.ComponentType>;

export type RouteName = keyof typeof SCREENS;
