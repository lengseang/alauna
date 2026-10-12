import type { ImageSourcePropType } from 'react-native';

/**
 * Bundled high-resolution character portraits for built-in companions.
 * Sourced directly from local high-fidelity generation assets.
 */
export const CHARACTER_IMAGES: Record<string, ImageSourcePropType> = {
  alauna: require('../../../assets/characters/alauna.jpg'),
  soul_alauna: require('../../../assets/characters/alauna.jpg'),
  kaelen: require('../../../assets/characters/kaelen.jpg'),
  soul_kaelen: require('../../../assets/characters/kaelen.jpg'),
  seraphina: require('../../../assets/characters/seraphina.jpg'),
  soul_seraphina: require('../../../assets/characters/seraphina.jpg'),
  sraphina: require('../../../assets/characters/seraphina.jpg'),
  dante: require('../../../assets/characters/dante.jpg'),
  soul_dante: require('../../../assets/characters/dante.jpg'),
  luna: require('../../../assets/characters/luna.jpg'),
  soul_luna: require('../../../assets/characters/luna.jpg'),
  julian: require('../../../assets/characters/julian.jpg'),
  soul_julian: require('../../../assets/characters/julian.jpg'),
  elara: require('../../../assets/characters/elara.jpg'),
  soul_elara: require('../../../assets/characters/elara.jpg'),
  ellara: require('../../../assets/characters/elara.jpg'),
};

export function getCharacterImage(key?: string): ImageSourcePropType | null {
  if (!key) return null;
  const normalized = key.toLowerCase().trim();
  return CHARACTER_IMAGES[normalized] ?? null;
}
