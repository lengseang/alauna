import React from 'react';
import { View } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import type { ModelFreedomSettings } from '../../core/modelFreedom.ts';
import { updateSettings, useSettings } from '../../services/settings.ts';
import { Card } from '../Card';
import { goBack } from '../nav';
import { Screen } from '../Screen';
import { Switch } from '../Switch';
import { Tag } from '../Tag';
import { Text } from '../Text';

type FreedomPresetKey = 'safe' | 'balanced' | 'unrestricted' | 'creative_roleplay';

const PRESETS: Record<FreedomPresetKey, ModelFreedomSettings> = {
  safe: {
    profanityAndBluntness: 'clean',
    complexFictionalThemes: false,
    characterFidelity: 'flexible',
    challengeUser: false,
    adultFictionalExpression: false,
    disclaimerPolicy: 'minimal',
  },
  balanced: {
    profanityAndBluntness: 'mild',
    complexFictionalThemes: true,
    characterFidelity: 'strict_anti_break',
    challengeUser: true,
    adultFictionalExpression: false,
    disclaimerPolicy: 'minimal',
  },
  unrestricted: {
    profanityAndBluntness: 'unfiltered',
    complexFictionalThemes: true,
    characterFidelity: 'strict_anti_break',
    challengeUser: true,
    adultFictionalExpression: true,
    disclaimerPolicy: 'none',
  },
  creative_roleplay: {
    profanityAndBluntness: 'authentic',
    complexFictionalThemes: true,
    characterFidelity: 'strict_anti_break',
    challengeUser: true,
    adultFictionalExpression: true,
    disclaimerPolicy: 'none',
  },
};

export function ModelFreedomScreen() {
  const settings = useSettings();
  const freedom = settings.freedom;
  const s = useStyles();
  const { colors } = useTheme();

  const setPatch = (patch: Partial<ModelFreedomSettings>) => {
    updateSettings({ freedom: { ...freedom, ...patch } });
  };

  const applyPreset = (key: FreedomPresetKey) => {
    const p = PRESETS[key];
    if (p) {
      updateSettings({ freedom: { ...p } });
    }
  };

  const isPresetActive = (key: FreedomPresetKey) => {
    const p = PRESETS[key];
    return (
      freedom.profanityAndBluntness === p.profanityAndBluntness &&
      freedom.complexFictionalThemes === p.complexFictionalThemes &&
      freedom.characterFidelity === p.characterFidelity &&
      freedom.challengeUser === p.challengeUser &&
      freedom.adultFictionalExpression === p.adultFictionalExpression &&
      freedom.disclaimerPolicy === p.disclaimerPolicy
    );
  };

  return (
    <Screen title="Model Freedom" onBack={goBack} scroll>
      <Text tone="muted">
        System instructions that remove artificial boundaries, eliminate repetitive moral disclaimers,
        and allow full character authenticity offline on your phone.
      </Text>

      <View style={s.section}>
        <Text variant="label">FREEDOM PRESETS</Text>
        <View style={s.presetRow}>
          {(['safe', 'balanced', 'unrestricted', 'creative_roleplay'] as const).map((key) => {
            const label = key === 'creative_roleplay' ? 'Creative RP' : key.charAt(0).toUpperCase() + key.slice(1);
            return (
              <Tag
                key={key}
                label={label}
                selected={isPresetActive(key)}
                onPress={() => applyPreset(key)}
              />
            );
          })}
        </View>
      </View>

      <View style={s.section}>
        <Text variant="label">DISCLAIMER & INTEGRITY DIRECTIVES</Text>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={{ fontWeight: '600' }}>
                Suppress Generic Disclaimers
              </Text>
              <Text variant="small" tone="muted">
                Strictly prohibits "As an AI...", "It's important to remember...", and unsolicited moral lectures.
              </Text>
            </View>
            <Switch
              label="Suppress generic disclaimers"
              value={freedom.disclaimerPolicy === 'none'}
              onValueChange={(v) => setPatch({ disclaimerPolicy: v ? 'none' : 'minimal' })}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={{ fontWeight: '600' }}>
                Strict Character Fidelity
              </Text>
              <Text variant="small" tone="muted">
                Never break immersion or apologize as an assistant. Stays strictly inside the character worldview.
              </Text>
            </View>
            <Switch
              label="Strict character fidelity"
              value={freedom.characterFidelity === 'strict_anti_break'}
              onValueChange={(v) => setPatch({ characterFidelity: v ? 'strict_anti_break' : 'flexible' })}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={{ fontWeight: '600' }}>
                Challenge User (Anti-Sycophancy)
              </Text>
              <Text variant="small" tone="muted">
                If the user makes a flawed assertion, counter it honestly instead of giving sycophantic praise.
              </Text>
            </View>
            <Switch
              label="Challenge user"
              value={freedom.challengeUser}
              onValueChange={(v) => setPatch({ challengeUser: v })}
            />
          </View>
        </Card>
      </View>

      <View style={s.section}>
        <Text variant="label">CREATIVE & EXPRESSIVE SCOPE</Text>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={{ fontWeight: '600' }}>
                Unfiltered Language & Expression
              </Text>
              <Text variant="small" tone="muted">
                Allows natural profanity, raw dialogue, and slang when appropriate to character persona.
              </Text>
            </View>
            <Switch
              label="Unfiltered language"
              value={freedom.profanityAndBluntness === 'unfiltered'}
              onValueChange={(v) => setPatch({ profanityAndBluntness: v ? 'unfiltered' : 'authentic' })}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={{ fontWeight: '600' }}>
                Complex Fiction & Dark Themes
              </Text>
              <Text variant="small" tone="muted">
                Allows villainy, psychological tension, dystopian drama, and tragic conflict without sanitizing.
              </Text>
            </View>
            <Switch
              label="Complex fiction and dark themes"
              value={freedom.complexFictionalThemes}
              onValueChange={(v) => setPatch({ complexFictionalThemes: v })}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={{ fontWeight: '600' }}>
                Adult Fictional Expression
              </Text>
              <Text variant="small" tone="muted">
                Permits mature romance and adult creative fiction themes where model weights allow.
              </Text>
            </View>
            <Switch
              label="Adult fictional expression"
              value={freedom.adultFictionalExpression}
              onValueChange={(v) => setPatch({ adultFictionalExpression: v })}
            />
          </View>
        </Card>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ space }) => ({
  section: {
    gap: space.sm,
    marginTop: space.md,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  card: {
    padding: space.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
  },
  toggleText: {
    flex: 1,
    gap: space.xs,
  },
}));
