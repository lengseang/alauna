import type React from 'react';
import { ModelsScreen } from './ModelsScreen';
import { MemoryScreen, PersonaScreen } from './PersonaScreen';
import { AboutSettings, AdvancedSettings, SettingsHome, StorageSettings } from './SettingsScreens';

/**
 * Route registry: name -> screen. Add ONE line per screen (wave 2: S1 chat extras, S2 vault/downloads/speculative,
 * S3 settings sub-screens). The name becomes a typed Route for push(); 'chat' is the always-mounted root.
 * Read params inside a screen with useParams() from ./nav.
 */
export const SCREENS = {
  models: ModelsScreen,
  persona: PersonaScreen,
  'persona/memory': MemoryScreen,
  settings: SettingsHome,
  'settings/storage': StorageSettings,
  'settings/advanced': AdvancedSettings,
  'settings/about': AboutSettings,
} satisfies Record<string, React.ComponentType>;

export type RouteName = keyof typeof SCREENS;
