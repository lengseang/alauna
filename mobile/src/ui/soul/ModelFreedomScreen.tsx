import React, { useState } from 'react';
import { View } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import type { FreedomMode, ModelFreedomSettings } from '../../core/modelFreedom.ts';
import { DEFAULT_MODEL_FREEDOM, FREEDOM_MODE_PRESETS, getModelCompatibility } from '../../core/modelFreedom.ts';
import { getModel } from '../../core/catalog.ts';
import { updateSettings, useSettings } from '../../services/settings.ts';
import { showToast } from '../../services/toast.ts';
import { Button } from '../Button';
import { Card } from '../Card';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Switch } from '../Switch';
import { Tag } from '../Tag';
import { Text } from '../Text';

export function ModelFreedomScreen() {
  const settings = useSettings();
  const freedom = settings.freedom;
  const s = useStyles();
  const { colors } = useTheme();

  // Active model lookup for compatibility telemetry (§3)
  const activeModel = settings.activeModelId ? getModel(settings.activeModelId) : null;
  const modelCompat = activeModel ? getModelCompatibility(activeModel.id) : undefined;

  // Adult gate modal state
  const [showGatePrompt, setShowGatePrompt] = useState(false);

  const setPatch = (patch: Partial<ModelFreedomSettings>) => {
    updateSettings({ freedom: { ...freedom, ...patch } });
  };

  const handleModeChange = (newMode: FreedomMode) => {
    if (newMode === 'unfiltered' && !freedom.adultGateAcknowledged) {
      setShowGatePrompt(true);
      return;
    }
    const preset = FREEDOM_MODE_PRESETS[newMode];
    setPatch({
      ...preset,
      adultGateAcknowledged: newMode === 'unfiltered' ? true : freedom.adultGateAcknowledged,
    });
  };

  const confirmAdultGate = () => {
    setShowGatePrompt(false);
    const preset = FREEDOM_MODE_PRESETS.unfiltered;
    setPatch({
      ...preset,
      adultGateAcknowledged: true,
    });
    showToast('Unfiltered Adult Mode enabled.');
  };

  const disableAllAdult = () => {
    setPatch({
      adultContent: false,
      explicitVocabulary: false,
      eroticRoleplay: false,
      nsfwCreativeFreedom: false,
      adultGateAcknowledged: false,
      mode: freedom.mode === 'unfiltered' ? 'relaxed' : freedom.mode,
    });
    showToast('Adult features disabled.');
  };

  const resetToDefaults = () => {
    setPatch({ ...DEFAULT_MODEL_FREEDOM });
    showToast('Reset Model Freedom settings to defaults.');
  };

  const handleAdultToggle = (field: 'adultContent' | 'explicitVocabulary' | 'eroticRoleplay' | 'nsfwCreativeFreedom', value: boolean) => {
    if (value && !freedom.adultGateAcknowledged) {
      setShowGatePrompt(true);
      return;
    }
    setPatch({ [field]: value });
  };

  return (
    <Screen title="Model Freedom" onBack={goBack} scroll>
      <Text tone="muted">
        Configure offline model expression, character authenticity, and remove artificial assistant restrictions
        while preserving genuine device safety.
      </Text>

      {/* §2.1 Operating Mode */}
      <View style={s.section}>
        <Text variant="label">OPERATING MODE</Text>
        <View style={s.presetRow}>
          {(['standard', 'relaxed', 'unfiltered'] as const).map((modeKey) => {
            const label = modeKey.charAt(0).toUpperCase() + modeKey.slice(1);
            return (
              <Tag
                key={modeKey}
                label={label}
                selected={freedom.mode === modeKey}
                onPress={() => handleModeChange(modeKey)}
              />
            );
          })}
        </View>

        {freedom.mode === 'standard' && (
          <Notice tone="quiet" title="Standard Mode">
            Normal application interaction. Standard disclaimers and neutral phrasing are active. No adult-oriented directives are sent.
          </Notice>
        )}
        {freedom.mode === 'relaxed' && (
          <Notice tone="info" title="Relaxed Mode">
            Reduces unsolicited disclaimers. Permits darker fictional narratives, villainous character voices, and frank discussion of adult topics.
          </Notice>
        )}
        {freedom.mode === 'unfiltered' && (
          <Notice tone="info" title="Unfiltered Mode">
            Minimizes application-level suppression. Compatible local models follow adult fictional prompts, unfiltered vocabulary, and character roleplay without artificial fade-to-black. Output remains bound to local model weights.
          </Notice>
        )}
      </View>

      {/* §2.3 Adult-Mode Opt-In Notice & Gate */}
      {showGatePrompt && (
        <Card style={[s.card, s.gateCard]}>
          <Text variant="label" style={{ color: colors.accent }}>
            ADULT CONTENT NOTICE & CONFIRMATION
          </Text>
          <Text variant="body">
            You are enabling unfiltered adult fiction and mature creative expression. All inference runs 100% locally and privately on your phone.
          </Text>
          <Text variant="small" tone="muted">
            By proceeding, you confirm that you meet the applicable age requirements (18+) for mature adult creative dialogue and consensual roleplay.
          </Text>
          <View style={s.buttonRow}>
            <Button
              label="Confirm & Enable (18+)"
              variant="primary"
              onPress={confirmAdultGate}
            />
            <Button
              label="Cancel"
              variant="quiet"
              onPress={() => setShowGatePrompt(false)}
            />
          </View>
        </Card>
      )}

      {/* Adult Quick Disable Shortcut */}
      {freedom.adultGateAcknowledged && (
        <View style={s.quickActionRow}>
          <Button
            label="Quick Disable Adult Features"
            variant="quiet"
            onPress={disableAllAdult}
          />
        </View>
      )}

      {/* §2.2 Independent Controls: Language & Dialogue */}
      <View style={s.section}>
        <Text variant="label">LANGUAGE & DIALOGUE</Text>

        <Card style={s.card}>
          <Text variant="body" style={s.cardTitle}>
            Profanity & Vulgarity Level
          </Text>
          <Text variant="small" tone="muted" style={s.cardSub}>
            Sets the allowable roughness of character speech and conversational vocabulary.
          </Text>
          <Segmented
            label="Profanity level"
            options={[
              { value: 'clean', label: 'Clean' },
              { value: 'mild', label: 'Mild' },
              { value: 'authentic', label: 'Authentic' },
              { value: 'unfiltered', label: 'Unfiltered' },
            ]}
            value={freedom.profanity}
            onChange={(val) => setPatch({ profanity: val })}
          />
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Aggressive & Abrasive Voices
              </Text>
              <Text variant="small" tone="muted">
                Permits rebellious, dominant, cynical, or sharp tongue traits without auto-softening.
              </Text>
            </View>
            <Switch
              label="Aggressive character voices"
              value={freedom.aggressiveVoices}
              onValueChange={(v) => setPatch({ aggressiveVoices: v })}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Challenge User (Anti-Sycophancy)
              </Text>
              <Text variant="small" tone="muted">
                If the user makes a flawed assertion, counter honestly instead of giving false praise.
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

      {/* §2.2 Fiction & Story Themes */}
      <View style={s.section}>
        <Text variant="label">FICTION & STORY THEMES</Text>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Dark Fiction & Tragic Themes
              </Text>
              <Text variant="small" tone="muted">
                Allows dystopian drama, psychological tension, and gritty conflict in storytelling.
              </Text>
            </View>
            <Switch
              label="Dark fiction and tragic themes"
              value={freedom.darkFiction}
              onValueChange={(v) => setPatch({ darkFiction: v })}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Morally Gray Characters
              </Text>
              <Text variant="small" tone="muted">
                Allows villains, anti-heroes, and morally ambiguous personas to act in character.
              </Text>
            </View>
            <Switch
              label="Morally gray characters"
              value={freedom.morallyGrayCharacters}
              onValueChange={(v) => setPatch({ morallyGrayCharacters: v })}
            />
          </View>
        </Card>
      </View>

      {/* §2.2 Adult Creative Fiction & NSFW (Gated) */}
      <View style={s.section}>
        <Text variant="label">ADULT CREATIVE FICTION & NSFW</Text>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Adult Content & Explicitness
              </Text>
              <Text variant="small" tone="muted">
                Permits mature themes, adult relationships, and intimate fictional developments.
              </Text>
            </View>
            <Switch
              label="Adult content and explicitness"
              value={freedom.adultContent}
              onValueChange={(v) => handleAdultToggle('adultContent', v)}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Dirty Talk & Sexual Vocabulary
              </Text>
              <Text variant="small" tone="muted">
                Permits direct sexual terms and raw intimate phrasing without mid-sentence euphemisms.
              </Text>
            </View>
            <Switch
              label="Dirty talk and sexual vocabulary"
              value={freedom.explicitVocabulary}
              onValueChange={(v) => handleAdultToggle('explicitVocabulary', v)}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Flirting & Erotic Roleplay
              </Text>
              <Text variant="small" tone="muted">
                Authorizes character initiative, pacing, and passionate romantic encounters.
              </Text>
            </View>
            <Switch
              label="Flirting and erotic roleplay"
              value={freedom.eroticRoleplay}
              onValueChange={(v) => handleAdultToggle('eroticRoleplay', v)}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Unfiltered NSFW Immersion
              </Text>
              <Text variant="small" tone="muted">
                Full descriptive creative fiction without premature fade-to-black or moral lectures.
              </Text>
            </View>
            <Switch
              label="Unfiltered NSFW immersion"
              value={freedom.nsfwCreativeFreedom}
              onValueChange={(v) => {
                if (v && !freedom.adultGateAcknowledged) {
                  setShowGatePrompt(true);
                  return;
                }
                setPatch({
                  nsfwCreativeFreedom: v,
                  adultContent: v ? true : freedom.adultContent,
                });
              }}
            />
          </View>
        </Card>
      </View>

      {/* §2.2 Character & Model Behavior */}
      <View style={s.section}>
        <Text variant="label">CHARACTER & MODEL BEHAVIOR</Text>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Strict Character Fidelity
              </Text>
              <Text variant="small" tone="muted">
                Never break immersion or apologize as an assistant. Stays strictly inside persona.
              </Text>
            </View>
            <Switch
              label="Strict character fidelity"
              value={freedom.characterFidelity === 'strict'}
              onValueChange={(v) => setPatch({ characterFidelity: v ? 'strict' : 'flexible' })}
            />
          </View>
        </Card>

        <Card style={s.card}>
          <Text variant="body" style={s.cardTitle}>
            Disclaimer Suppression Policy
          </Text>
          <Text variant="small" tone="muted" style={s.cardSub}>
            Suppresses "As an AI..." and unsolicited moralizing sermons.
          </Text>
          <Segmented
            label="Disclaimer policy"
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'minimal', label: 'Minimal' },
              { value: 'none', label: 'None' },
            ]}
            value={freedom.disclaimerPolicy}
            onChange={(val) => setPatch({ disclaimerPolicy: val })}
          />
        </Card>

        <Card style={s.card}>
          <View style={s.toggleRow}>
            <View style={s.toggleText}>
              <Text variant="body" style={s.cardTitle}>
                Model Refusal Transparency
              </Text>
              <Text variant="small" tone="muted">
                When a local model refuses due to its own training weights, report it plainly instead of deflecting.
              </Text>
            </View>
            <Switch
              label="Model refusal transparency"
              value={freedom.refusalTransparency}
              onValueChange={(v) => setPatch({ refusalTransparency: v })}
            />
          </View>
        </Card>
      </View>

      {/* §3 Model Compatibility Telemetry */}
      <View style={s.section}>
        <Text variant="label">ACTIVE MODEL COMPATIBILITY</Text>
        <Card style={s.card}>
          <Text variant="body" style={s.cardTitle}>
            {activeModel ? activeModel.name : 'No model loaded'}
          </Text>
          <Text variant="small" tone="muted">
            {activeModel
              ? `Content Policy: ${activeModel.contentPolicy} | Architecture: ${activeModel.family}`
              : 'Select a model in the Models tab to view compatibility telemetry.'}
          </Text>
          {modelCompat ? (
            <View style={s.compatStats}>
              <Text variant="small">
                Instruction Following: {modelCompat.instructionFollowing}
              </Text>
              <Text variant="small">
                Adult Fiction Capability: {modelCompat.adultFictionCapability}
              </Text>
              <Text variant="small">
                Refusal Tendency: {modelCompat.refusalTendency}
              </Text>
            </View>
          ) : (
            <Text variant="small" tone="muted" style={{ marginTop: 4 }}>
              Empirical compatibility not yet benchmarked for this model. Uncensored and Heretic builds offer the lowest refusal rates.
            </Text>
          )}
        </Card>
      </View>

      {/* Reset to Defaults */}
      <View style={s.resetSection}>
        <Button
          label="Reset to Defaults"
          variant="quiet"
          onPress={resetToDefaults}
        />
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ space, colors }) => ({
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
  gateCard: {
    borderColor: colors.accent,
    borderWidth: 1,
    gap: space.sm,
  },
  cardTitle: {
    fontWeight: '600',
  },
  cardSub: {
    marginBottom: space.sm,
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
  buttonRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.sm,
  },
  quickActionRow: {
    marginTop: space.sm,
  },
  compatStats: {
    marginTop: space.sm,
    gap: 2,
  },
  resetSection: {
    marginTop: space.lg,
    marginBottom: space.xl,
  },
}));
