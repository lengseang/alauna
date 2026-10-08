# Voice, media, security: API for the UI (W3)

Paths are under `mobile/`. All stores are `core/store.ts` stores; each has a `use…()` hook (useSyncExternalStore).
Every message string below is user-facing, plain English, and true. Nothing here fakes progress or results.

## Boot wiring (S1 splash / W2 lifecycle)

| When | Call |
|---|---|
| Boot, before any chat content is shown | `await initSecurity()` (services/security.ts), then show the lock screen while `status` is `locked` or `authenticating` |
| Boot | `await initVoicePrefs()` (services/voice/prefs.ts) |
| Storage becomes ready / changes (`onStorageReady`) | `refreshSpeechModels()` (services/voice/speechModels.ts) |
| Before opening any other screen on the user's behalf (folder picker, All-files settings, share sheet) | `expectExternalActivity()` so returning does not trigger the app lock. attachments.ts already does this. |

## 1. Voice mode (overlay): `services/voice/voiceMode.ts`

```ts
startVoiceMode(): Promise<{ ok: true } | { ok: false; message: string; fix: VoiceFix }>
stopVoiceMode(): Promise<void>          // stops mic, TTS and the reply; frees the speech models' RAM
voiceModeBlocker(): { message: string; fix: VoiceFix } | null   // check before showing the mic button as active
useVoiceMode(): VoiceModeState
type VoiceFix = 'download_model' | 'open_settings' | 'install_update' | null
interface VoiceModeState {
  phase: 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error';
  heard: string;        // what the user said (live partial while listening)
  reply: string;        // assistant answer so far (same text as the chat message)
  pendingSpeech: number; replyDone: boolean; turns: number;
  error: string | null; // shown in 'error' phase
  fix: VoiceFix;        // which button to offer: Download model / Open settings (openAppSettings) / needs newer build
}
```
- Flow: `idle -> listening -> transcribing -> thinking -> speaking -> listening` (continuous) or `-> idle` (one-shot).
  Pure state machine: `core/voiceLoop.ts` (`voiceReducer`, tested). The turn is sent through `services/chat.ts`
  `sendMessage`, so it appears in the current chat like a typed message.
- Barge-in (pref `bargeIn`): VAD speech start while thinking/speaking stops TTS and the reply and listens.
- Retry from `error`: call `startVoiceMode()` again. Close: `stopVoiceMode()`.

## 2. Speech-to-text: `services/voice/stt.ts`, models: `services/voice/speechModels.ts`

```ts
useStt(): { engine: boolean; micCapture: boolean; mic: 'granted'|'denied'|'blocked'|'unknown';
            loadedModelId: string | null; loading: boolean; listening: boolean; error: string | null }
sttEngineAvailable(): boolean; micCaptureAvailable(): boolean
requestMicPermission(): Promise<MicPermission>   // called by startListening; only at the moment of use
openAppSettings(): Promise<void>                 // for mic 'blocked'
loadStt(modelId?): Promise<SttResult>; releaseStt(): Promise<void>
transcribeFile(pathOrUri): Promise<{ ok: true; text; language; ms } | { ok: false; reason; message }>  // WAV, any rate
startListening(handlers, prefs?): Promise<SttResult>; stopListening(); updateLiveVad(prefs)  // voiceMode uses these
type SttResult = { ok: true } | { ok: false; reason: 'no_mic_module'|'no_engine'|'not_installed'|'mic_denied'|'mic_blocked'|'load_failed'|'failed'; message: string }
```
Order of checks in `startListening`: mic module -> engine -> model downloaded -> mic permission (never prompts for a
permission it cannot use).

Models (`core/voiceModels.ts`, sizes + SHA-256 verified against the HF LFS API and resolve headers, 2026-10-08):

| id | file | bytes |
|---|---|---|
| whisper-tiny.en / whisper-tiny | ggerganov/whisper.cpp `ggml-tiny.en.bin` / `ggml-tiny.bin` | 77,704,715 / 77,691,713 |
| whisper-base.en (default) / whisper-base | `ggml-base.en.bin` / `ggml-base.bin` | 147,964,211 / 147,951,465 |
| whisper-small.en-q5_1 / whisper-small-q5_1 | `ggml-small.en-q5_1.bin` / `ggml-small-q5_1.bin` | 190,098,681 / 190,085,487 |
| silero-vad-v6.2.0 (auto companion) | ggml-org/whisper-vad `ggml-silero-v6.2.0.bin` | 885,098 |

```ts
STT_MODELS, VAD_MODEL, getSpeechModel(id), VAD_SENSITIVITY_PRESETS  // High 0.3 / Normal 0.5 / Low 0.8 (old app's pills)
useSpeechModels(): Record<id, { status: 'absent'|'downloading'|'paused'|'verifying'|'installed'|'error';
  receivedBytes; totalBytes; bytesPerSecond; etaSeconds; verifyProgress /*0..1*/; error }>
downloadSpeechModel(id)   // resumes a partial; downloads the VAD model first; size + SHA-256 checked before "installed"
pauseSpeechModelDownload(id); cancelSpeechModelDownload(id); deleteSpeechModel(id); speechModelPath(id); isSpeechModelInstalled(id)
```
Stored in `<vault>/voice/`. Self-contained download (W1's manager was GGUF-only when this was written; it can move
to W1's generic downloads once `docs/api/vault.md` exists).

## 3. Text-to-speech: `services/voice/tts.ts`

```ts
listVoices(refresh?): Promise<TtsVoice[]>   // { id, name, language, enhanced, needsNetwork: boolean | null } on-device first
speak(text, { voice?, rate?, pitch?, onDone? }): boolean   // queues one sentence; defaults from voice prefs
stopSpeaking(): Promise<void>
previewVoice({ voice?, rate?, pitch? }, text?): Promise<boolean>   // Settings "Preview" with unsaved values
useTts(): { speaking: boolean; pending: number; lastError: string | null }
```
Sentence chunker for streaming replies: `core/voiceChunker.ts` `nextSentences(fullText, from, final)` (skips code
blocks, strips markdown, keeps "3.14", "Dr.", "1." intact).

## 4. Audio & Voice settings: `services/voice/prefs.ts`

```ts
useVoicePrefs(); getVoicePrefs(); updateVoicePrefs(patch): VoicePrefs  // validated + saved (chiwiwi_voice.json)
interface VoicePrefs { sttModelId; language /* 'auto' | ISO code; .en models force 'en' */; vadThreshold /*0.05..0.95*/;
  endOfSpeechMs /*200..3000*/; ttsEnabled; ttsVoice: string | null; ttsRate; ttsPitch; bargeIn; continuous }
```
VAD changes apply live to a running voice session.

## 5. Attach sheet: `services/attachments.ts`

```ts
takePhoto(): Promise<AttachResult>          // asks CAMERA permission now
pickPhotos(limit = 3): Promise<AttachResult> // Android photo picker: no permission
pickDocuments(limit = 3): Promise<AttachResult>
type AttachResult = { ok: true; attachments: PickedAttachment[]; skipped: { name; message }[] }
                  | { ok: false; reason: 'cancelled'|'permission'|'no_storage'|'unavailable'|'error'; message; canOpenSettings? }
toChatAttachment(a): Attachment   // core/chatTypes shape for sendMessage (image: { kind:'image', path, mime })
discardAttachment(a)              // user removed the chip before sending: deletes the copied image
type PickedAttachment =
  | { kind: 'image'; id; name; path /*real path, for llama.rn initMultimodal*/; uri /*for <Image>*/; mimeType; width; height; bytes }
  | { kind: 'text'; id; name; content; truncated; bytes }
```
Images are copied to `<vault>/media/` and must be JPEG/PNG/GIF/BMP bytes (what llama.cpp decodes; the photo picker
re-encodes HEIC/WebP). Text: <= 1 MB, binary guard, PDF/Office/archives refused with a reason. Show `skipped` messages.
If the active model has no vision projector, say so (W2/S1 decide; the image is still a valid attachment).

## 6. Security & Privacy: `services/security.ts`

```ts
useSecurity(): { appLock; lockAfterMinutes; loaded; status: 'unlocked'|'locked'|'authenticating'|'suspended';
                 method: 'biometric'|'screen-lock'|'none'|null; biometrics: ('fingerprint'|'face'|'iris')[]; message }
unlock(): Promise<boolean>                 // lock screen button; also call once when the lock screen mounts
setAppLock(enabled): Promise<{ ok: true } | { ok: false; message }>   // enabling requires a successful unlock first
setLockAfterMinutes(m); LOCK_AFTER_CHOICES /* [0, 1, 5, 15, 30] */; lockNow(); detectLockMethod()
expectExternalActivity()
DEFAULT_SECURITY_PREFS, sanitizeSecurityPrefs   // helper if W2 folds these into Settings
```
`suspended` = app lock is on but the phone has no screen lock (or the module is missing): never locks the owner out;
show `message`. PIN/pattern works when no biometrics are enrolled (device-credential fallback).

## 7. app.json

Added: `RECORD_AUDIO`, `CAMERA` permissions; plugins `expo-image-picker` (photo/camera/mic usage strings, mic NOT
blocked because voice needs it) and `expo-local-authentication` (Face ID string; adds USE_BIOMETRIC/USE_FINGERPRINT).
No READ_MEDIA_* (photo picker needs none). `MANAGE_EXTERNAL_STORAGE` kept (see below). Verified: `expo config --type
prebuild` and `expo prebuild --platform android --no-install` in a scratch copy (manifest has exactly the expected
permissions; arm64 only).

## Needs owner decision

1. **Install `buffer` (pure JS, no APK change).** whisper.rn imports `safe-buffer`, which `require('buffer')`s; RN has
   no Node `buffer`, so any bundle containing whisper.rn fails (`expo export:embed` reproduced it). whisper.rn is
   therefore switched off in `services/voice/native.ts`, and STT reports "switched off in this build".
2. **Install `@fugood/react-native-audio-pcm-stream@1.1.4` (native, next APK).** whisper.rn 0.7.4 removed its built-in
   recorder; live mic needs this module (whisper.rn's own `AudioPcmStreamAdapter`). Without it, voice mode shows
   "Live voice input needs the microphone audio module". TTS, voice list/preview, model downloads, attachments and
   app lock work now. After `npx expo install buffer @fugood/react-native-audio-pcm-stream`, uncomment the two bodies
   in `services/voice/native.ts`, re-run the export bundle check, and build the APK.
3. **MANAGE_EXTERNAL_STORAGE stays.** W2's external vault maps the SAF folder to a real `/storage/...` path because
   llama.rn (and whisper.rn) open models by file path; writing there needs "All files access" on Android 11+.
   Removing it breaks external storage slots (and `openAllFilesAccessSettings`).
4. **Echo / barge-in.** Barge-in uses `VOICE_COMMUNICATION` audio (echo cancellation). On loud speaker playback the
   assistant's own voice may still trigger it; the `bargeIn` pref turns it off (mic muted while it answers). Needs a
   device test once the mic module is in.
5. **Prefs files.** Voice and security prefs live in their own app-private files (`chiwiwi_voice.json`,
   `chiwiwi_security.json`), not in W2's Settings; sanitizers are exported if W2 wants to merge them.
6. **New core files outside the `voice*` glob:** `src/core/appLock.ts`, `src/core/attachmentRules.ts` (W3 pure logic;
   no other agent uses these names).
