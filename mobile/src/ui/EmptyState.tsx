import React from 'react';
import { View } from 'react-native';
import { makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { Button } from './Button';
import { Text } from './Text';
import { Wordmark } from './Wordmark';

export interface EmptyStateProps {
  title: string;
  body?: string;
  /** One primary action. */
  actionLabel?: string;
  onAction?: () => void;
  /** Show the CHIWIWI wordmark above the title. */
  brand?: boolean;
  /** Breathing wordmark: something is loading. */
  breathing?: boolean;
  /** Stars (Nyx) / sun (Helios) behind. */
  ambient?: boolean;
}

/** Nothing here yet: say why in one line and offer the single next step. Voice may borrow from myth ("The oracle is silent"). */
export function EmptyState({ title, body, actionLabel, onAction, brand, breathing, ambient }: EmptyStateProps) {
  const s = useStyles();
  return (
    <View style={s.root}>
      {ambient ? <Ambient /> : null}
      <View style={s.col}>
        {brand ? <Wordmark breathing={breathing} /> : null}
        <Text variant="title" style={s.center}>
          {title}
        </Text>
        {body ? (
          <Text variant="body" tone="muted" style={s.center}>
            {body}
          </Text>
        ) : null}
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} style={s.action} /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ space }) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  col: { alignItems: 'center', gap: space.md, maxWidth: 360 },
  center: { textAlign: 'center' },
  action: { marginTop: space.sm, alignSelf: 'stretch' },
}));
