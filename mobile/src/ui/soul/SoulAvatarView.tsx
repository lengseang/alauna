import React from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import type { SoulAvatar } from '../../core/soulSchema.ts';
import { Icon, type IconName } from '../Icon';
import { getCharacterImage } from './characterAssets';

export interface SoulAvatarViewProps {
  avatar?: SoulAvatar;
  soulId?: string;
  name?: string;
  size?: number;
  active?: boolean;
  style?: StyleProp<ViewStyle>;
}

const PRESET_ICONS: Record<string, IconName> = {
  sage: 'persona',
  guardian: 'shield',
  rebel: 'bolt',
  analyst: 'chip',
  caregiver: 'sun',
  trickster: 'sun',
  explorer: 'moon',
  diplomat: 'chat',
  strategist: 'models',
  creator: 'edit',
};

/**
 * Temple Square Avatar renderer.
 * Strictly borderRadius: 0.
 * Prioritizes custom gallery photo -> bundled companion portrait -> preset icon.
 */
export function SoulAvatarView({
  avatar,
  soulId,
  name = 'Soul',
  size = 48,
  active,
  style,
}: SoulAvatarViewProps) {
  const { colors } = useTheme();
  const s = useStyles();

  const accent = active ? colors.accent : avatar?.accentColor || colors.accent;
  const borderCol = active ? colors.accent : avatar?.accentColor ? avatar.accentColor : colors.borderStrong;

  // 1. Custom gallery photo selected by user
  if (avatar?.type === 'file' && avatar.imageUri) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={`${name} avatar image`}
        style={[
          s.box,
          { width: size, height: size, borderColor: borderCol },
          active && s.activeBox,
          style,
        ]}
      >
        <Image
          source={{ uri: avatar.imageUri }}
          style={{ width: size - 2, height: size - 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  // 2. High-resolution bundled portrait for companion
  const characterImg =
    getCharacterImage(soulId) ||
    getCharacterImage(avatar?.presetId) ||
    getCharacterImage(name);

  if (characterImg) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={`${name} character portrait`}
        style={[
          s.box,
          { width: size, height: size, borderColor: borderCol },
          active && s.activeBox,
          style,
        ]}
      >
        <Image
          source={characterImg}
          style={{ width: size - 2, height: size - 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

  // 3. Fallback glyph / preset icon
  let glyphName: IconName = 'persona';
  if (avatar?.type === 'preset' && avatar.presetId && PRESET_ICONS[avatar.presetId]) {
    glyphName = PRESET_ICONS[avatar.presetId];
  } else if (avatar?.glyph) {
    glyphName = (avatar.glyph as IconName) || 'persona';
  }

  const iconSize = Math.max(16, Math.round(size * 0.52));

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${name} avatar`}
      style={[
        s.box,
        {
          width: size,
          height: size,
          borderColor: borderCol,
        },
        active && s.activeBox,
        style,
      ]}
    >
      <Icon name={glyphName} size={iconSize} color={accent} />
    </View>
  );
}

const useStyles = makeStyles(({ colors, line }) => ({
  box: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: line,
    borderRadius: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  activeBox: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
}));
