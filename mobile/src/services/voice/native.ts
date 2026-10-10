/**
 * The ONLY place that loads whisper.rn's JavaScript and the live-microphone stream. Both stay switched off until two
 * dependencies are installed (requested in docs/api/voice-media-security.md, "Needs owner decision"):
 *
 *  1. `buffer` (pure JS, no new APK): whisper.rn -> safe-buffer -> require('buffer'). React Native has no Node `buffer`
 *     module, so with whisper.rn in the graph Metro cannot bundle the app at all (verified with expo export:embed).
 *  2. `@fugood/react-native-audio-pcm-stream` (native, needs the next APK): whisper.rn 0.7.4 removed its built-in
 *     recorder; RealtimeTranscriber takes mic PCM from this module via whisper.rn's AudioPcmStreamAdapter.
 *
 * After `npx expo install buffer @fugood/react-native-audio-pcm-stream`, replace the two bodies with the commented
 * lines. Everything that uses them (stt.ts, voiceMode.ts) is already written against the real whisper.rn types.
 */
// Types straight from the package's .d.ts: its exports map sends TypeScript (react-native condition) to the raw .ts
// sources, which do not typecheck outside their repo. Type-only, erased at build time.
import type { AudioStreamInterface } from '../../../node_modules/whisper.rn/lib/typescript/realtime-transcription/index';

export type WhisperModule = typeof import('../../../node_modules/whisper.rn/lib/typescript/index');
export type RealtimeModule = typeof import('../../../node_modules/whisper.rn/lib/typescript/realtime-transcription/index');

export const WHISPER_JS_MISSING =
  'Speech recognition (whisper.rn) is switched off in this build: it needs the "buffer" package to be installed first.';
export const MIC_MODULE_MISSING =
  'Live voice input needs the microphone audio module (@fugood/react-native-audio-pcm-stream), which is not in this build yet. Spoken replies (text-to-speech) work.';

/** whisper.rn JS modules, or null when this build cannot load them. */
export function loadWhisper(): { whisper: WhisperModule; realtime: RealtimeModule } | null {
  try {
    return {
      whisper: require('whisper.rn/index') as WhisperModule,
      realtime: require('whisper.rn/realtime-transcription/index') as RealtimeModule,
    };
  } catch (e1) {
    try {
      return {
        whisper: require('whisper.rn') as WhisperModule,
        realtime: require('whisper.rn/realtime-transcription') as RealtimeModule,
      };
    } catch (e2) {
      return null;
    }
  }
}

/** A fresh live-microphone PCM stream (16 kHz mono 16-bit) for RealtimeTranscriber, or null when unavailable. */
export function createMicStream(): AudioStreamInterface | null {
  try {
    const { AudioPcmStreamAdapter } = require('whisper.rn/realtime-transcription/adapters/AudioPcmStreamAdapter');
    return new AudioPcmStreamAdapter();
  } catch (e1) {
    try {
      const adapterModule = require('whisper.rn/lib/commonjs/realtime-transcription/adapters/AudioPcmStreamAdapter');
      const Adapter = adapterModule.AudioPcmStreamAdapter || adapterModule.default || adapterModule;
      return new Adapter();
    } catch (e2) {
      return null;
    }
  }
}
