import React, { useState } from 'react';
import { View, ScrollView } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import {
  type SoulDefinition,
  type SoulCategory,
  SOUL_CATEGORIES,
  sanitizeSoul,
  duplicateSoulDef,
} from '../../core/soulSchema.ts';
import { getSoul, saveCustomSoul, useSoulLibrary } from '../../services/soulStore.ts';
import { getBuiltInSoul, BUILT_IN_SOULS } from '../../core/builtInSouls.ts';
import { evaluateLabResponse, STANDARD_LAB_SCENARIOS, type LabTestReport } from '../../core/soulLab.ts';
import { compileSoulPrompt } from '../../core/soulCompiler.ts';
import { showToast } from '../../services/toast.ts';
import { Button } from '../Button';
import { Card } from '../Card';
import { Field } from '../Field';
import { goBack, useParams } from '../nav';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Slider } from '../Slider';
import { Switch } from '../Switch';
import { Tag } from '../Tag';
import { Text } from '../Text';
import { SoulAvatarView } from './SoulAvatarView';

type StudioTab = 'simple' | 'workbook' | 'lab';

export function SoulStudioScreen() {
  const { soulId } = useParams<{ soulId?: string }>();
  const initialSoul = soulId ? getSoul(soulId) : BUILT_IN_SOULS[0];

  const [soul, setSoul] = useState<SoulDefinition>(() => {
    if (initialSoul) {
      if (initialSoul.type === 'builtin') {
        return duplicateSoulDef(initialSoul, `${initialSoul.name} (Custom)`);
      }
      return JSON.parse(JSON.stringify(initialSoul)) as SoulDefinition;
    }
    return duplicateSoulDef(BUILT_IN_SOULS[0], 'New Custom Soul');
  });

  const [activeTab, setActiveTab] = useState<StudioTab>('simple');
  const [activeChapter, setActiveChapter] = useState<number>(1);
  const [labPromptIndex, setLabPromptIndex] = useState<number>(0);
  const [labResult, setLabResult] = useState<LabTestReport | null>(null);

  const s = useStyles();
  const { colors } = useTheme();

  const handleSave = () => {
    const saved = saveCustomSoul(soul);
    setSoul(saved);
    showToast(`Saved "${saved.name}" to library.`);
  };

  const runLabTest = () => {
    const scenario = STANDARD_LAB_SCENARIOS[labPromptIndex];
    const compiled = compileSoulPrompt({ soul });
    const simulatedAnswer = `[In character as ${soul.name}] Understood. Let us address the root question with direct clarity.`;
    const evalResult = evaluateLabResponse(soul, scenario, simulatedAnswer);
    setLabResult(evalResult);
  };

  return (
    <Screen
      title={soul.name || 'Soul Studio'}
      onBack={goBack}
      scroll
      right={<Button label="Save" variant="primary" onPress={handleSave} />}
    >
      {/* Studio Mode Selector */}
      <Segmented
        label="Studio Mode"
        options={[
          { value: 'simple', label: 'Simple' },
          { value: 'workbook', label: 'Workbook (9 Ch)' },
          { value: 'lab', label: 'Soul Lab' },
        ]}
        value={activeTab}
        onChange={(v) => setActiveTab(v as StudioTab)}
      />

      {/* --- TAB 1: SIMPLE MODE --- */}
      {activeTab === 'simple' && (
        <View style={s.tabContent}>
          <Card style={s.heroCard} framed>
            <View style={s.heroRow}>
              <SoulAvatarView avatar={soul.identity.avatar} size={56} name={soul.name} />
              <View style={s.heroMeta}>
                <Text variant="heading">{soul.name}</Text>
                <Text variant="small" tone="muted">
                  {soul.tagline}
                </Text>
              </View>
            </View>
          </Card>

          <Card style={s.slidersCard}>
            <Text variant="label">CHARACTER SLIDERS</Text>
            <Slider
              label="Sociability & Warmth"
              value={soul.psychology.temperament.sociability}
              min={0}
              max={100}
              step={5}
              poles={['Reserved', 'Warm']}
              onChange={(v) =>
                setSoul((prev) => ({
                  ...prev,
                  psychology: {
                    ...prev.psychology,
                    temperament: { ...prev.psychology.temperament, sociability: v },
                  },
                }))
              }
            />
            <Slider
              label="Emotional Stability"
              value={soul.psychology.temperament.stability}
              min={0}
              max={100}
              step={5}
              poles={['Reactive', 'Stoic']}
              onChange={(v) =>
                setSoul((prev) => ({
                  ...prev,
                  psychology: {
                    ...prev.psychology,
                    temperament: { ...prev.psychology.temperament, stability: v },
                  },
                }))
              }
            />
            <Slider
              label="Assertiveness & Directness"
              value={soul.psychology.temperament.assertiveness}
              min={0}
              max={100}
              step={5}
              poles={['Diplomatic', 'Direct']}
              onChange={(v) =>
                setSoul((prev) => ({
                  ...prev,
                  psychology: {
                    ...prev.psychology,
                    temperament: { ...prev.psychology.temperament, assertiveness: v },
                  },
                }))
              }
            />
            <Slider
              label="Impulsivity & Energy"
              value={soul.psychology.temperament.impulsivity}
              min={0}
              max={100}
              step={5}
              poles={['Deliberate', 'Spontaneous']}
              onChange={(v) =>
                setSoul((prev) => ({
                  ...prev,
                  psychology: {
                    ...prev.psychology,
                    temperament: { ...prev.psychology.temperament, impulsivity: v },
                  },
                }))
              }
            />
          </Card>

          <Field
            label="Name"
            value={soul.name}
            onChangeText={(t) =>
              setSoul((prev) => ({ ...prev, name: t, identity: { ...prev.identity, name: t } }))
            }
          />
          <Field
            label="Tagline"
            value={soul.tagline}
            onChangeText={(t) => setSoul((prev) => ({ ...prev, tagline: t }))}
          />
        </View>
      )}

      {/* --- TAB 2: 9-CHAPTER WORKBOOK --- */}
      {activeTab === 'workbook' && (
        <View style={s.tabContent}>
          {/* Chapter selector chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chapterScroll}>
            <View style={s.chapterChips}>
              {[
                '1 Identity',
                '2 Psychology',
                '3 Speech',
                '4 Relate',
                '5 Know',
                '6 Behavior',
                '7 Roleplay',
                '8 Memory',
                '9 Intimacy',
              ].map((label, idx) => (
                <Tag
                  key={idx + 1}
                  label={label}
                  selected={activeChapter === idx + 1}
                  onPress={() => setActiveChapter(idx + 1)}
                />
              ))}
            </View>
          </ScrollView>

          {/* Chapter 1: Identity */}
          {activeChapter === 1 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 01: IDENTITY & CHARACTER</Text>
              <Field
                label="Character Name"
                value={soul.identity.name}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, name: t, identity: { ...prev.identity, name: t } }))
                }
              />
              <Field
                label="Setting / Origin"
                value={soul.identity.setting}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, identity: { ...prev.identity, setting: t } }))
                }
              />
              <Field
                label="Character Background"
                multiline
                numberOfLines={3}
                value={soul.identity.background}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, identity: { ...prev.identity, background: t } }))
                }
              />
              <Field
                label="Worldview"
                multiline
                numberOfLines={2}
                value={soul.identity.worldview}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, identity: { ...prev.identity, worldview: t } }))
                }
              />
            </Card>
          )}

          {/* Chapter 2: Psychology */}
          {activeChapter === 2 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 02: EMOTIONAL PSYCHOLOGY</Text>
              <Slider
                label="Empathy"
                value={soul.psychology.temperament.empathy}
                min={0}
                max={100}
                step={5}
                onChange={(v) =>
                  setSoul((prev) => ({
                    ...prev,
                    psychology: {
                      ...prev.psychology,
                      temperament: { ...prev.psychology.temperament, empathy: v },
                    },
                  }))
                }
              />
              <Slider
                label="Openness"
                value={soul.psychology.temperament.openness}
                min={0}
                max={100}
                step={5}
                onChange={(v) =>
                  setSoul((prev) => ({
                    ...prev,
                    psychology: {
                      ...prev.psychology,
                      temperament: { ...prev.psychology.temperament, openness: v },
                    },
                  }))
                }
              />
              <Slider
                label="Resilience"
                value={soul.psychology.temperament.resilience}
                min={0}
                max={100}
                step={5}
                onChange={(v) =>
                  setSoul((prev) => ({
                    ...prev,
                    psychology: {
                      ...prev.psychology,
                      temperament: { ...prev.psychology.temperament, resilience: v },
                    },
                  }))
                }
              />
            </Card>
          )}

          {/* Chapter 3: Speech */}
          {activeChapter === 3 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 03: SPEECH & COMMUNICATION</Text>
              <Field
                label="Formality (archaic, formal, moderate, casual, raw)"
                value={soul.speech.formality}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, speech: { ...prev.speech, formality: t as any } }))
                }
              />
              <Field
                label="Sentence Rhythm (terse, balanced, flowing, poetic)"
                value={soul.speech.sentenceRhythm}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, speech: { ...prev.speech, sentenceRhythm: t as any } }))
                }
              />
              <Field
                label="Humor Style (none, dry, witty, playful, sarcastic)"
                value={soul.speech.humor}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, speech: { ...prev.speech, humor: t as any } }))
                }
              />
            </Card>
          )}

          {/* Chapter 4: Relationships */}
          {activeChapter === 4 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 04: RELATIONSHIPS</Text>
              <Field
                label="Default Stance (friend, mentor, rival, companion, romantic)"
                value={soul.relationships.defaultType}
                onChangeText={(t) =>
                  setSoul((prev) => ({
                    ...prev,
                    relationships: { ...prev.relationships, defaultType: t as any },
                  }))
                }
              />
              <Slider
                label="Trust Baseline"
                value={soul.relationships.trustBaseline}
                min={0}
                max={100}
                step={5}
                onChange={(v) =>
                  setSoul((prev) => ({
                    ...prev,
                    relationships: { ...prev.relationships, trustBaseline: v },
                  }))
                }
              />
            </Card>
          )}

          {/* Chapter 5: Knowledge */}
          {activeChapter === 5 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 05: KNOWLEDGE & EXPERTISE</Text>
              <Field
                label="Expertise Domains (comma separated)"
                value={soul.knowledge.expertise.join(', ')}
                onChangeText={(t) =>
                  setSoul((prev) => ({
                    ...prev,
                    knowledge: {
                      ...prev.knowledge,
                      expertise: t.split(',').map((x) => x.trim()).filter(Boolean),
                    },
                  }))
                }
              />
            </Card>
          )}

          {/* Chapter 6: Behavior */}
          {activeChapter === 6 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 06: BEHAVIORAL PROTOCOL</Text>
              <Field
                label="Answering Style"
                value={soul.behavior.answeringStyle}
                onChangeText={(t) =>
                  setSoul((prev) => ({ ...prev, behavior: { ...prev.behavior, answeringStyle: t } }))
                }
              />
            </Card>
          )}

          {/* Chapter 7: Roleplay */}
          {activeChapter === 7 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 07: ROLEPLAY & SCENE</Text>
              <Field
                label="Narration Style (none, first_person, third_person_limited)"
                value={soul.roleplay.narrationStyle}
                onChangeText={(t) =>
                  setSoul((prev) => ({
                    ...prev,
                    roleplay: { ...prev.roleplay, narrationStyle: t as any },
                  }))
                }
              />
            </Card>
          )}

          {/* Chapter 8: Memory Policy */}
          {activeChapter === 8 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 08: MEMORY POLICY</Text>
              <View style={s.switchRow}>
                <Text variant="body">Auto-Extract User Facts</Text>
                <Switch
                  label="Auto memory extraction"
                  value={soul.memoryPolicy.allowAutoMemoryExtraction}
                  onValueChange={(v) =>
                    setSoul((prev) => ({
                      ...prev,
                      memoryPolicy: { ...prev.memoryPolicy, allowAutoMemoryExtraction: v },
                    }))
                  }
                />
              </View>
            </Card>
          )}

          {/* Chapter 9: Intimacy */}
          {activeChapter === 9 && (
            <Card style={s.chapterCard}>
              <Text variant="label">CHAPTER 09: INTIMACY & ROMANCE</Text>
              <View style={s.switchRow}>
                <Text variant="body">Enable Intimacy Dynamics</Text>
                <Switch
                  label="Enable intimacy"
                  value={!!soul.intimacy?.enabled}
                  onValueChange={(v) =>
                    setSoul((prev) => ({
                      ...prev,
                      intimacy: {
                        enabled: v,
                        romanceStyle: prev.intimacy?.romanceStyle ?? 'playful',
                        flirtationIntensity: prev.intimacy?.flirtationIntensity ?? 'moderate',
                        initiative: prev.intimacy?.initiative ?? 'balanced',
                        sensualExpression: prev.intimacy?.sensualExpression ?? 'reserved',
                        comfortDiscussingSexuality:
                          prev.intimacy?.comfortDiscussingSexuality ?? 'open_if_prompted',
                        relationshipPacing: prev.intimacy?.relationshipPacing ?? 'natural',
                        boundaries: prev.intimacy?.boundaries ?? [],
                      },
                    }))
                  }
                />
              </View>
            </Card>
          )}
        </View>
      )}

      {/* --- TAB 3: SOUL LAB --- */}
      {activeTab === 'lab' && (
        <View style={s.tabContent}>
          <Card style={s.labCard}>
            <Text variant="label">BENCHMARK SCENARIO</Text>
            <View style={s.scenarioChips}>
              {STANDARD_LAB_SCENARIOS.map((sc, i) => (
                <Tag
                  key={sc.id}
                  label={sc.title}
                  selected={labPromptIndex === i}
                  onPress={() => setLabPromptIndex(i)}
                />
              ))}
            </View>
            <Text variant="body" tone="muted">
              {STANDARD_LAB_SCENARIOS[labPromptIndex].prompt}
            </Text>
            <Button label="Run Scenario Verification" variant="primary" onPress={runLabTest} />
          </Card>

          {labResult && (
            <Card style={s.resultCard} framed>
              <Text variant="label">EVALUATION METRICS</Text>
              <Text variant="heading">{labResult.overallScore >= 2.5 ? 'PASSED (0-4 Rubric)' : 'NEEDS TUNING'}</Text>
              <Text variant="small">Overall Score: {labResult.overallScore}/4</Text>
              {labResult.disclaimerDetected && (
                <Text variant="small" tone="danger">
                  Disclaimer or generic boilerplate detected in simulated response.
                </Text>
              )}
            </Card>
          )}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ space }) => ({
  tabContent: {
    gap: space.md,
    marginTop: space.md,
  },
  heroCard: {
    padding: space.md,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  heroMeta: {
    flex: 1,
    gap: space.xs,
  },
  slidersCard: {
    padding: space.md,
    gap: space.md,
  },
  chapterScroll: {
    marginVertical: space.xs,
  },
  chapterChips: {
    flexDirection: 'row',
    gap: space.sm,
  },
  chapterCard: {
    padding: space.md,
    gap: space.md,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.xs,
  },
  labCard: {
    padding: space.md,
    gap: space.md,
  },
  scenarioChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  resultCard: {
    padding: space.md,
    gap: space.sm,
  },
}));
