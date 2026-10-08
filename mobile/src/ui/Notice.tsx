import React from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme';
import { Text } from './Text';

export interface NoticeProps {
  /** The message itself, in plain words (the edge color is only a hint, the text carries the meaning). */
  children: string;
  /** info = accent edge + wash; danger = red edge + wash; quiet = hairline only (honest "not available" states). */
  tone?: 'info' | 'danger' | 'quiet';
  /** Optional bold first line, e.g. "Needs a vision model". */
  title?: string;
  /** Optional recovery control, e.g. a quiet <Button label="Try again" />. */
  action?: React.ReactNode;
}

/** Inline message with a square colored edge. Replaces banners, inline errors and blocking Alerts for non-destructive info. */
export function Notice({ children, tone = 'info', title, action }: NoticeProps) {
  const s = useStyles();
  return (
    <View accessibilityLiveRegion="polite" style={[s.box, s[tone]]}>
      {title ? <Text variant="label">{title}</Text> : null}
      <Text variant="small" tone="text">
        {children}
      </Text>
      {action}
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  box: { borderLeftWidth: 2, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.sm },
  info: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
  danger: { backgroundColor: colors.dangerSoft, borderLeftColor: colors.danger },
  quiet: { borderWidth: line, borderLeftWidth: 2, borderColor: colors.border, borderLeftColor: colors.borderStrong },
}));
