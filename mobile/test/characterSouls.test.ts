import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_SOULS, getBuiltInSoul } from '../src/core/builtInSouls.ts';
import { getVoicePersona } from '../src/core/voicePersonas.ts';
import { compileSoulPrompt } from '../src/core/soulCompiler.ts';

const EXPECTED_CHARACTERS = [
  { id: 'soul_luna', name: 'Luna', voiceId: 'voice_luna', nsfw: false, preset: 'luna' },
  { id: 'soul_elara', name: 'Elara', voiceId: 'voice_elara', nsfw: false, preset: 'elara' },
  { id: 'soul_julian', name: 'Julian', voiceId: 'voice_julian', nsfw: false, preset: 'julian' },
  { id: 'soul_kaelen', name: 'Kaelen', voiceId: 'voice_kaelen', nsfw: false, preset: 'kaelen' },
  { id: 'soul_alauna', name: 'Alauna', voiceId: 'voice_alauna', nsfw: true, preset: 'alauna' },
  { id: 'soul_dante', name: 'Dante', voiceId: 'voice_dante', nsfw: true, preset: 'dante' },
  { id: 'soul_seraphina', name: 'Seraphina', voiceId: 'voice_seraphina', nsfw: true, preset: 'seraphina' },
];

test('character souls: all 7 companion souls exist with unique identities and avatars', () => {
  for (const c of EXPECTED_CHARACTERS) {
    const soul = getBuiltInSoul(c.id);
    assert.ok(soul, `Character soul ${c.id} must exist in built-in souls`);
    assert.equal(soul.identity.name, c.name, `Soul ${c.id} name must match ${c.name}`);
    assert.ok(soul.tagline && soul.tagline.length > 10, `Soul ${c.id} must have a descriptive tagline`);

    // Verify avatar preset
    assert.ok(soul.identity.avatar, `Soul ${c.id} must have an avatar`);
    assert.equal(soul.identity.avatar.presetId, c.preset, `Soul ${c.id} avatar presetId must match ${c.preset}`);

    // Verify embedded voice persona
    assert.equal(soul.identity.voicePersonaId, c.voiceId, `Soul ${c.id} voicePersonaId must be ${c.voiceId}`);
    const persona = getVoicePersona(soul.identity.voicePersonaId);
    assert.ok(persona, `Voice persona ${c.voiceId} for soul ${c.id} must exist in catalog`);
    assert.equal(persona.isNsfw, c.nsfw, `Voice persona ${c.voiceId} NSFW flag must be ${c.nsfw}`);

    // Verify acoustic soundscape
    assert.ok(
      typeof soul.identity.ambientSoundscape === 'string' && soul.identity.ambientSoundscape.length > 15,
      `Soul ${c.id} must have a rich ambient soundscape description`,
    );

    // Verify psychology & temperament sliders
    const temp = soul.psychology.temperament;
    assert.ok(temp.sociability >= 0 && temp.sociability <= 100);
    assert.ok(temp.stability >= 0 && temp.stability <= 100);
    assert.ok(temp.sensitivity >= 0 && temp.sensitivity <= 100);
    assert.ok(temp.empathy >= 0 && temp.empathy <= 100);
    assert.ok(soul.psychology.emotions.length >= 2, `Soul ${c.id} must have custom baseline emotion profiles`);
  }
});

test('character souls: intimacy and adult spectrum calibration', () => {
  const luna = getBuiltInSoul('soul_luna')!;
  assert.equal(luna.intimacy?.romanceStyle, 'shy');
  assert.equal(luna.intimacy?.sensualExpression, 'suggestive', 'Luna is 0% innocent romance');

  const elara = getBuiltInSoul('soul_elara')!;
  assert.equal(elara.intimacy?.romanceStyle, 'devoted');
  assert.equal(elara.intimacy?.relationshipPacing, 'slow_burn', 'Elara is quiet East Asian cozy intimacy');

  const julian = getBuiltInSoul('soul_julian')!;
  assert.equal(julian.intimacy?.sensualExpression, 'expressive');
  assert.equal(julian.intimacy?.romanceStyle, 'passionate', 'Julian is cultured aristocratic chivalry');

  const kaelen = getBuiltInSoul('soul_kaelen')!;
  assert.equal(kaelen.intimacy?.sensualExpression, 'explicit');
  assert.equal(kaelen.intimacy?.initiative, 'proactive', 'Kaelen is dominant protector');

  const alauna = getBuiltInSoul('soul_alauna')!;
  assert.equal(alauna.intimacy?.sensualExpression, 'explicit');
  assert.equal(alauna.intimacy?.comfortDiscussingSexuality, 'natural_and_uninhibited');

  const dante = getBuiltInSoul('soul_dante')!;
  assert.equal(dante.intimacy?.sensualExpression, 'explicit');
  assert.equal(dante.intimacy?.flirtationIntensity, 'bold', 'Dante is seductive rogue');

  const seraphina = getBuiltInSoul('soul_seraphina')!;
  assert.equal(seraphina.intimacy?.sensualExpression, 'explicit');
  assert.equal(seraphina.intimacy?.relationshipPacing, 'fast_paced', 'Seraphina is 100% uncensored siren');
});

test('character souls: prompt compiler incorporates ambient soundscape', () => {
  const elara = getBuiltInSoul('soul_elara')!;
  const compiled = compileSoulPrompt({ soul: elara });
  assert.ok(
    compiled.systemPrompt.includes('Auditory soundscape & atmosphere: Quiet rain tapping against windowpane'),
    'Compiled prompt must include ambient soundscape for sensory immersion',
  );
});
