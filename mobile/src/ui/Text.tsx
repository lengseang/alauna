import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme, type TextVariant } from '../theme';

export type Tone = 'text' | 'muted' | 'accent' | 'danger' | 'onAccent';

export interface TextProps extends RNTextProps {
  /** Size/weight role. Default 'body'. 'small' defaults to the muted tone. */
  variant?: TextVariant;
  tone?: Tone;
}

/**
 * The only way to render text. Sizes come from the type ramp (14/16/20/28), colors from the palette,
 * and system font scaling is honoured up to 1.6x so layouts bend instead of clip.
 * 'title' and 'display' announce themselves as headings to screen readers.
 */
export function Text({ variant = 'body', tone, style, accessibilityRole, ...rest }: TextProps) {
  const { colors, type } = useTheme();
  const color = colors[tone ?? (variant === 'small' ? 'muted' : 'text')];
  const heading = variant === 'title' || variant === 'display';
  return <RNText maxFontSizeMultiplier={1.6} accessibilityRole={accessibilityRole ?? (heading ? 'header' : undefined)} {...rest} style={[type[variant], { color }, style]} />;
}
