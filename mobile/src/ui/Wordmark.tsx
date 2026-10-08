import React from 'react';
import { Breathe } from './Motion';
import { Text } from './Text';

/** "CHIWIWI" in Cinzel, the only place that font appears. `breathing` = a model is loading / the app is booting. */
export function Wordmark({ breathing = false }: { breathing?: boolean }) {
  return (
    <Breathe active={breathing}>
      <Text variant="wordmark" tone="accent" accessibilityRole="header">
        CHIWIWI
      </Text>
    </Breathe>
  );
}
