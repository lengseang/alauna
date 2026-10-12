import React from 'react';
import { Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import type { SoulAvatar } from '../../core/soulSchema.ts';
import { Icon, type IconName } from '../Icon';

export interface SoulAvatarViewProps {
  avatar?: SoulAvatar;
  name?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
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
 * Modern Liquid Glass Avatar renderer.
 * Rounded squircle curvature, liquid glass glow, and image support.
 */
export function SoulAvatarView({ avatar, name = 'Soul', size = 48, style, onPress }: SoulAvatarViewProps) {
  const { colors, radius } = useTheme();
  const s = useStyles();

  const accent = avatar?.accentColor || colors.accent;
  const borderCol = avatar?.accentColor ? avatar.accentColor : colors.border;
  const r = Math.round(size * 0.28);

  const content = avatar?.imageUri ? (
    <Image
      source={{ uri: avatar.imageUri }}
      style={{ width: '100%', height: '100%', borderRadius: r }}
      resizeMode="cover"
    />
  ) : (
    (() => {
      let glyphName: IconName = 'persona';
      if (avatar?.type === 'preset' && avatar.presetId && PRESET_ICONS[avatar.presetId]) {
        glyphName = PRESET_ICONS[avatar.presetId];
      } else if (avatar?.glyph) {
        glyphName = (avatar.glyph as IconName) || 'persona';
      }
      const iconSize = Math.max(16, Math.round(size * 0.52));
      return <Icon name={glyphName} size={iconSize} color={accent} />;
    })()
  );

  const element = (
    <View
      accessibilityRole={onPress ? 'button' : 'image'}
      accessibilityLabel={`${name} avatar`}
      style={[
        s.box,
        {
          width: size,
          height: size,
          borderRadius: r,
          borderColor: borderCol,
        },
        style,
      ]}
    >
      {content}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Change avatar for ${name}`}
        hitSlop={6}
      >
        {element}
      </Pressable>
    );
  }

  return element;
}

const useStyles = makeStyles(({ colors, line }) => ({
  box: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));
