import React from 'react';
import { Image, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import type { SoulAvatar } from '../../core/soulSchema.ts';
import { Icon, type IconName } from '../Icon';

export interface SoulAvatarViewProps {
  avatar?: SoulAvatar;
  name?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const PRESET_ICONS: Record<string, IconName> = {
  sage: 'persona',
  guardian: 'shield',
  rebel: 'bolt',
  analyst: 'chip',
  caregiver: 'spark' as IconName,
  trickster: 'sun',
  explorer: 'moon',
  diplomat: 'chat',
  strategist: 'models',
  creator: 'edit',
};

/**
 * Temple Square Avatar renderer.
 * Strictly borderRadius: 0. Renders glyphs, presets, or local file URIs.
 */
export function SoulAvatarView({ avatar, name = 'Soul', size = 48, style }: SoulAvatarViewProps) {
  const { colors } = useTheme();
  const s = useStyles();

  const accent = avatar?.accentColor || colors.accent;
  const borderCol = avatar?.accentColor ? avatar.accentColor : colors.border;

  if (avatar?.type === 'file' && avatar.imageUri) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={`${name} avatar image`}
        style={[s.box, { width: size, height: size, borderColor: borderCol }, style]}
      >
        <Image
          source={{ uri: avatar.imageUri }}
          style={{ width: size - 2, height: size - 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }

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
}));
