import React from 'react';
import { textScales, useThemePref, type ThemePref, type TextScale } from '../../theme';
import { Card } from '../Card';
import { goBack } from '../nav';
import { ListRow } from '../Row';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Text } from '../Text';
import { Group, Rows } from './parts';

const THEMES: Array<{ pref: ThemePref; title: string; subtitle: string }> = [
  { pref: 'system', title: 'Follow my phone', subtitle: 'Nyx at night, Helios by day' },
  { pref: 'dark', title: 'Nyx', subtitle: 'Starry night: indigo sky, gold leaf' },
  { pref: 'light', title: 'Helios', subtitle: 'Sunlit day: marble and bronze' },
];
const SIZE_LABEL: Record<string, string> = { '1': 'Default', '1.15': 'Large', '1.3': 'Largest' };

/** Settings > Appearance: theme (System / Nyx / Helios), text size, haptics, reduced motion. Saved by the theme provider. */
export function AppearanceScreen() {
  const { pref, setPref, textScale, setTextScale, motion, setMotion, haptics, setHaptics, systemReduceMotion } = useThemePref();
  return (
    <Screen title="Appearance" onBack={goBack} scroll>
      <Group index={1} title="Theme" hint="Nyx is the night sky, Helios the sun. Both keep the same sharp corners.">
        <Rows>
          {THEMES.map((t) => (
            <ListRow key={t.pref} title={t.title} subtitle={t.subtitle} selected={pref === t.pref} onPress={() => setPref(t.pref)} />
          ))}
        </Rows>
      </Group>

      <Group index={2} title="Text size" hint="Scales every line in the app. Nothing goes below 14 points.">
        <Segmented
          label="Text size"
          options={textScales.map((v) => ({ value: String(v), label: SIZE_LABEL[String(v)] ?? String(v) }))}
          value={String(textScale)}
          onChange={(v) => setTextScale(Number(v) as TextScale)}
        />
        <Card>
          <Text variant="title">Sample</Text>
          <Text>This is how your chats read at this size. A longer line shows how it wraps on your screen.</Text>
          <Text variant="small">Small text, like this status line.</Text>
        </Card>
      </Group>

      <Group index={3} title="Feel">
        <Rows>
          <ListRow title="Haptics" subtitle="A small tap on buttons and switches." switchValue={haptics} onSwitch={setHaptics} />
          <ListRow
            title="Reduce motion"
            subtitle={systemReduceMotion ? 'Your phone already asks for less motion, so the stars and slides are off.' : 'Stops the drifting stars, sun rays and slide animations.'}
            switchValue={motion === 'reduce' || systemReduceMotion}
            onSwitch={(v) => setMotion(v ? 'reduce' : 'system')}
            disabled={systemReduceMotion}
          />
        </Rows>
      </Group>
    </Screen>
  );
}
