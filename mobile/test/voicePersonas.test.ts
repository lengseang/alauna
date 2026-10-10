import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_VOICE_PERSONA_ID,
  getVoicePersona,
  listVoicePersonas,
  VOICE_PERSONAS,
  type VoicePersona,
} from '../src/core/voicePersonas.ts';
import {
  DEFAULT_VOICE_PREFS,
  sanitizeVoicePrefs,
} from '../src/core/voiceModels.ts';

test('voice personas: all catalog entries are well-formed and unique', () => {
  assert.ok(VOICE_PERSONAS.length >= 8, 'Expected at least 8 curated voice personas');
  const ids = new Set<string>();

  for (const p of VOICE_PERSONAS) {
    assert.ok(p.id && p.id.trim().length > 0, 'Persona ID must be non-empty');
    assert.ok(!ids.has(p.id), `Duplicate persona ID: ${p.id}`);
    ids.add(p.id);

    assert.ok(p.name && p.name.length > 0, `Persona ${p.id} must have a name`);
    assert.ok(p.subtitle && p.subtitle.length > 0, `Persona ${p.id} must have a subtitle`);
    assert.ok(p.description && p.description.length > 0, `Persona ${p.id} must have a description`);
    assert.ok(p.sampleText && p.sampleText.length > 0, `Persona ${p.id} must have sample preview text`);
    assert.ok(p.tonePrompt && p.tonePrompt.length > 0, `Persona ${p.id} must have a tone prompt directive`);
    assert.ok(p.pitch >= 0.5 && p.pitch <= 2.0, `Persona ${p.id} pitch out of valid bounds: ${p.pitch}`);
    assert.ok(p.rate >= 0.5 && p.rate <= 2.0, `Persona ${p.id} rate out of valid bounds: ${p.rate}`);
    assert.ok(['normal', 'companion', 'nsfw_adult'].includes(p.category), `Invalid category: ${p.category}`);
    assert.ok(['female', 'male', 'neutral'].includes(p.gender), `Invalid gender: ${p.gender}`);
    assert.ok(Array.isArray(p.tags) && p.tags.length > 0, `Persona ${p.id} must have tags`);
  }
});

test('voice personas: 18+ Adult NSFW personas are strictly categorized', () => {
  const adultVoices = listVoicePersonas('nsfw_adult');
  assert.ok(adultVoices.length >= 3, 'Expected at least 3 dedicated adult voice profiles');

  for (const p of adultVoices) {
    assert.equal(p.isNsfw, true, `Persona ${p.id} in nsfw_adult must have isNsfw = true`);
    assert.equal(p.category, 'nsfw_adult');
  }

  const normalVoices = listVoicePersonas('normal');
  for (const p of normalVoices) {
    assert.equal(p.isNsfw, false, `Normal persona ${p.id} cannot be marked NSFW`);
    assert.equal(p.category, 'normal');
  }

  const companionVoices = listVoicePersonas('companion');
  for (const p of companionVoices) {
    assert.equal(p.isNsfw, false, `Companion persona ${p.id} must have isNsfw = false`);
    assert.equal(p.category, 'companion');
  }
});

test('voice personas: lookup by ID works as expected', () => {
  const sol = getVoicePersona('sol_natural');
  assert.ok(sol);
  assert.equal(sol?.name, 'Sol');
  assert.equal(sol?.category, 'normal');

  const velvet = getVoicePersona('velvet_girlfriend');
  assert.ok(velvet);
  assert.equal(velvet?.category, 'companion');
  assert.equal(velvet?.gender, 'female');

  const serena = getVoicePersona('serena_nsfw_intimate');
  assert.ok(serena);
  assert.equal(serena?.category, 'nsfw_adult');
  assert.equal(serena?.isNsfw, true);

  assert.equal(getVoicePersona('non_existent_id'), null);
  assert.equal(getVoicePersona(null), null);
  assert.equal(getVoicePersona(undefined), null);
});

test('voice prefs sanitization: personaId persistence and validation', () => {
  const defaults = sanitizeVoicePrefs({});
  assert.equal(defaults.personaId, DEFAULT_VOICE_PERSONA_ID);

  const custom = sanitizeVoicePrefs({ personaId: 'velvet_girlfriend' });
  assert.equal(custom.personaId, 'velvet_girlfriend');

  const nsfw = sanitizeVoicePrefs({ personaId: 'serena_nsfw_intimate' });
  assert.equal(nsfw.personaId, 'serena_nsfw_intimate');

  const invalid = sanitizeVoicePrefs({ personaId: 'bogus_voice_id_123' });
  assert.equal(invalid.personaId, DEFAULT_VOICE_PERSONA_ID, 'Corrupted personaId must fall back to default');
});
