/**
 * Pure voice matching algorithms for on-device TTS and Kokoro style fallbacks.
 * Pure logic tested under Node with zero native or Expo module dependencies.
 */
import { getVoicePersona, type VoicePersona } from '../voicePersonas.ts';
import { getKokoroStyle } from './kokoroStyles.ts';

export interface TtsVoiceLike {
  id: string;
  name: string;
  language: string;
  enhanced?: boolean;
  needsNetwork?: boolean | null;
}

export interface VoiceMatchCriteria {
  patternStr?: string;
  language?: string;
  gender?: 'female' | 'male' | 'neutral';
  preferredTokens?: string[];
  styleId?: string;
}

export const KOKORO_STYLE_TOKENS: Record<string, string[]> = {
  // Female American
  af_heart: ['sfg', 'female_1', 'en-us-x-sfg', 'f00'],
  af_bella: ['tpd', 'female_2', 'en-us-x-tpd', 'f01'],
  af_nicole: ['iob', 'female_3', 'en-us-x-iob', 'f02'],
  af_sarah: ['eva', 'female_4', 'en-us-x-eva', 'f03'],
  af_sky: ['tpd', 'female_2', 'en-us-x-tpd'],
  af_alloy: ['sfg', 'female_1', 'en-us-x-sfg'],
  af_aoede: ['eva', 'female_4', 'en-us-x-eva'],
  af_jessica: ['sfg', 'female_1'],
  af_kore: ['iob', 'female_3', 'en-us-x-iob'],
  af_nova: ['tpd', 'female_2', 'en-us-x-tpd'],
  af_river: ['sfg', 'female_1'],
  // Male American
  am_adam: ['iom', 'male_1', 'en-us-x-iom', 'm00'],
  am_echo: ['iol', 'male_2', 'en-us-x-iol', 'm01'],
  am_eric: ['iom', 'male_1'],
  am_fenrir: ['david', 'guy', 'male_3', 'm02'],
  am_liam: ['iol', 'male_2'],
  am_michael: ['iom', 'male_1'],
  am_onyx: ['david', 'guy', 'm02'],
  am_puck: ['iol', 'male_2', 'm01'],
  // British Female
  bf_emma: ['fis', 'female_1', 'en-gb-x-fis'],
  bf_isabella: ['fis', 'female_2'],
  bf_alice: ['fis', 'female_1', 'en-gb-x-fis'],
  bf_lily: ['fis', 'female_2'],
  // British Male
  bm_george: ['rjs', 'male_1', 'en-gb-x-rjs'],
  bm_fable: ['rjs', 'male_2'],
  bm_lewis: ['rjs', 'male_1'],
  bm_daniel: ['rjs', 'male_2'],
};

/** Match the best installed native voice given criteria or a persona's voicePattern */
export function findMatchingNativeVoice(
  criteriaOrPattern?: string | VoiceMatchCriteria,
  pool?: TtsVoiceLike[] | null,
): string | null {
  if (!pool || pool.length === 0 || !criteriaOrPattern) return null;

  const isCriteria = typeof criteriaOrPattern === 'object' && criteriaOrPattern !== null;
  const patternStr = isCriteria ? criteriaOrPattern.patternStr : criteriaOrPattern;
  const targetLang = isCriteria ? criteriaOrPattern.language : undefined;
  const targetGender = isCriteria ? criteriaOrPattern.gender : undefined;
  const preferredTokens = isCriteria ? criteriaOrPattern.preferredTokens : undefined;
  const styleId = isCriteria ? criteriaOrPattern.styleId : undefined;

  // 1. Filter by language family if specified (e.g. 'en-US', 'en-GB', or 'en')
  let candidates = pool;
  if (targetLang) {
    const langLower = targetLang.toLowerCase();
    const langFamily = langLower.split(/[-_]/)[0];
    const exactLangMatches = pool.filter((v) => v.language.toLowerCase().replace('_', '-').startsWith(langLower));
    if (exactLangMatches.length > 0) {
      candidates = exactLangMatches;
    } else {
      const familyMatches = pool.filter((v) => v.language.toLowerCase().startsWith(langFamily));
      if (familyMatches.length > 0) {
        candidates = familyMatches;
      }
    }
  }

  // 2. Gender classification helper
  const isFemale = (v: TtsVoiceLike) => /(female|woman|sfg|tpd|eva|fis|iob|#female)/i.test(v.name) || /(female|woman|sfg|tpd|eva|fis|iob|#female)/i.test(v.id);
  const isMale = (v: TtsVoiceLike) => /(male|man|iom|iol|rjs|guy|david|#male)/i.test(v.name) || /(male|man|iom|iol|rjs|guy|david|#male)/i.test(v.id);

  if (targetGender === 'female') {
    const femaleCandidates = candidates.filter((v) => isFemale(v) && !isMale(v));
    if (femaleCandidates.length > 0) candidates = femaleCandidates;
  } else if (targetGender === 'male') {
    const maleCandidates = candidates.filter((v) => isMale(v) && !isFemale(v));
    if (maleCandidates.length > 0) candidates = maleCandidates;
  }

  // 3. Match preferred tokens
  if (preferredTokens && preferredTokens.length > 0) {
    for (const token of preferredTokens) {
      const tokRx = new RegExp(token, 'i');
      const localTokenMatch = candidates.find((v) => !v.needsNetwork && (tokRx.test(v.name) || tokRx.test(v.id)));
      if (localTokenMatch) return localTokenMatch.id;
      const anyTokenMatch = candidates.find((v) => tokRx.test(v.name) || tokRx.test(v.id));
      if (anyTokenMatch) return anyTokenMatch.id;
    }
  }

  // 4. Match regex pattern
  if (patternStr) {
    try {
      const rx = new RegExp(patternStr, 'i');
      const localMatch = candidates.find((v) => !v.needsNetwork && (rx.test(v.name) || rx.test(v.id)));
      if (localMatch) return localMatch.id;
      const anyMatch = candidates.find((v) => rx.test(v.name) || rx.test(v.id));
      if (anyMatch) return anyMatch.id;
    } catch {
      // Fall through
    }
  }

  // 5. If a Kokoro style is provided and there are multiple candidates, distribute by style hash
  if (styleId && candidates.length > 1) {
    let hash = 0;
    for (let i = 0; i < styleId.length; i++) {
      hash = (hash << 5) - hash + styleId.charCodeAt(i);
      hash |= 0;
    }
    const idx = Math.abs(hash) % candidates.length;
    return candidates[idx].id;
  }

  // 6. Prefer on-device voice in the filtered candidates
  const localFallback = candidates.find((v) => !v.needsNetwork);
  if (localFallback) return localFallback.id;
  return candidates[0]?.id ?? null;
}

/** Returns the resolved voice identifier for a persona given current voice list, or null if default */
export function getResolvedPersonaVoice(
  persona: VoicePersona,
  pool?: TtsVoiceLike[] | null,
  isKokoro = false,
  kokoroStyleId?: string,
): string | null {
  if (isKokoro && kokoroStyleId) {
    const style = getKokoroStyle(kokoroStyleId);
    if (style) {
      const lang = style.accent === 'british' ? 'en-GB' : 'en-US';
      const specificTokens = KOKORO_STYLE_TOKENS[style.id] ?? [];
      const fallbackToken = style.accent === 'british' ? 'fis|rjs|en-gb|british' : 'sfg|tpd|iom|iol|iob|en-us|american';
      const styleTokens = [...specificTokens, style.id, fallbackToken];
      return findMatchingNativeVoice(
        {
          language: lang,
          gender: style.gender,
          preferredTokens: styleTokens,
          patternStr: persona.voicePattern,
          styleId: style.id,
        },
        pool,
      );
    }
  }
  return findMatchingNativeVoice(
    {
      language: 'en-US',
      gender: persona.gender !== 'neutral' ? persona.gender : undefined,
      patternStr: persona.voicePattern,
    },
    pool,
  );
}
