import React from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme';
import { Text } from './Text';

export interface NoticeProps {
  /** The message itself, in plain words (the bar color is only a hint, the text carries the meaning). */
  children: string;
  tone?: 'info' | 'danger';
  /** Optional recovery control, e.g. a quiet <Button label="Try again" />. */
  action?: React.ReactNode;
}

/** Inline message with a colored edge. Replaces banners, inline errors and blocking Alerts for non-destructive info. */
export function Notice({ children, tone = 'info', action }: NoticeProps) {
  const s = useStyles();
  return (
    <View accessibilityLiveRegion="polite" style={[s.box, tone === 'danger' ? s.danger : s.info]}>
      <Text variant="small" tone="text">
        {children}
      </Text>
      {action}
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, radius }) => ({
  box: { borderRadius: radius.md, borderLeftWidth: 3, paddingVertical: space.md, paddingHorizontal: space.lg, gap: space.sm },
  info: { backgroundColor: colors.accentSoft, borderLeftColor: colors.accent },
  danger: { backgroundColor: colors.dangerSoft, borderLeftColor: colors.danger },
}));
