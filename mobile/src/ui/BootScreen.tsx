import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { Button } from './Button';
import type { BootStep } from './chatLogic';
import { Orb } from './Orb';
import { Text } from './Text';

interface Props {
  steps: BootStep[];
  /** 0..1 from finished steps + the model's real load progress. */
  fraction: number;
  /** Where the vault lives (real path/folder), once storage is known. */
  location?: string | null;
  /** Offered while the last model loads: open the chat now, the load continues behind it. */
  onContinue?: () => void;
}

/**
 * Modern, aesthetic loading screen featuring the 3D Holographic Iridescent Orb,
 * fluid progress pill, and friendly companion greeting.
 */
export function BootScreen({ steps, fraction, onContinue }: Props) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const current = steps.find((x) => x.state === 'active');
  const percent = Math.min(100, Math.max(5, Math.round(fraction * 100)));

  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Ambient />
      <View style={s.col}>
        {/* Floating 3D Iridescent Orb */}
        <Orb size={130} label="Alauna waking up" />

        <View style={s.textBox}>
          <Text variant="display" style={s.title}>ALAUNA</Text>
          <Text variant="body" tone="muted" style={s.subtitle}>
            {current ? current.label : 'Waking up your private sanctuary...'}
          </Text>
        </View>

        {/* Sleek rounded progress bar */}
        <View style={s.progressWrap}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${percent}%` }]} />
          </View>
          <Text variant="small" tone="accent" style={s.percentText}>
            {`${percent}%`}
          </Text>
        </View>

        {onContinue ? (
          <Button label="Open chat while it loads" variant="text" onPress={onContinue} />
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, radius }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  col: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.xl, padding: space.xl },
  textBox: { alignItems: 'center', gap: space.xs },
  title: { letterSpacing: 2, fontWeight: '700' },
  subtitle: { textAlign: 'center' },
  progressWrap: { width: 220, gap: space.xs, alignItems: 'center' },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  percentText: { fontWeight: '600', fontSize: 12 },
}));
