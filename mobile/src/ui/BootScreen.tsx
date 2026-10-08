import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatBytes } from '../core/format.ts';
import { getDeviceProfile } from '../services/device.ts';
import { makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { Button } from './Button';
import type { BootStep } from './chatLogic';
import { Eclipse } from './Eclipse';
import { Icon } from './Icon';
import { PulseDot } from './Motion';
import { Text } from './Text';
import { Wordmark } from './Wordmark';

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
 * Boot HUD: the real startup steps as they run (no timers), the Eclipse waxing with them, and true facts about this
 * phone where the old splash had invented ones.
 */
export function BootScreen({ steps, fraction, location, onContinue }: Props) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const device = getDeviceProfile();
  const current = steps.find((x) => x.state === 'active');
  const facts = [device.name, device.totalRamBytes ? `${formatBytes(device.totalRamBytes)} RAM` : null, location ?? null].filter(Boolean) as string[];
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Ambient />
      <View style={s.col}>
        <Wordmark />
        <Eclipse state="loading" progress={fraction} size={88} label={`Starting, ${Math.round(fraction * 100)} percent`} />
        <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
          {current ? current.label : 'Ready'}
        </Text>
        <View style={s.steps}>
          {steps.map((st) => (
            <View key={st.key} style={s.step}>
              <View style={s.mark}>{st.state === 'done' ? <Icon name="check" size={16} /> : st.state === 'active' ? <PulseDot size={6} /> : null}</View>
              <Text variant="small" tone={st.state === 'pending' ? 'muted' : 'text'}>
                {st.label}
              </Text>
            </View>
          ))}
        </View>
        {facts.length ? (
          <Text variant="small" style={s.center}>
            {facts.join(' · ')}
          </Text>
        ) : null}
        {onContinue ? <Button label="Open chat while it loads" variant="text" onPress={onContinue} /> : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors, space }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  col: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg, padding: space.xl },
  steps: { gap: space.xs, alignSelf: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 24 },
  mark: { width: 16, alignItems: 'center' },
  center: { textAlign: 'center' },
}));
