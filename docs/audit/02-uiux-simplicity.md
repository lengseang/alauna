# 02 - UI/UX simplicity audit (mobile/)

Scope: `mobile/App.tsx`, `src/screens/SettingsScreen.tsx`, `src/components/*` (Icons, SoulCustomizer, SovereignSplashScreen, ThreadSoulModal, GuardedButton, ui/*), `global.css`, `tailwind.config.js`, `app.json`, `assets/`.
Method: static source read + grep counts + WCAG contrast math. **Nothing was run on a device/emulator; no screenshots.**
Evidence tags: `[src]` read in source, `[calc]` computed, `[est]` estimated from style values, `[inf]` inferred - confirm on device.
Lenses applied: mobile-app-ui-design, ui-ux-pro-max (a11y/touch/nav/forms), app-ui-design hard rules, ux-audit-skill severity (S1 misleads/blocks, S2 degrades, S3 polish), accessibility-enforcer.

## 0. Verdict

The owner's complaint is accurate and has one root cause: **engine capabilities were exposed 1:1 as UI, with no information architecture and no design tokens.** PAD vectors, speculative decoding, 5 storage "slots", Vulkan toggles, grade filters and a boot HUD all got a surface. Many of them do nothing.

| Metric | Now | Target |
|---|---|---|
| Surfaces (screens + modals + sheets) | **16** (splash, chat, 5 modals, settings main, 8 sub-screens) | 4 screens + 1 sheet |
| Settings sub-screens | 9 `SubScreen` values in one 3,096-line component | 0 (1 flat page) |
| `<TouchableOpacity>` / `<Switch>` / `<TextInput>` (literal JSX) | 106 / 8 / 3 (model list adds 23-69 buttons at runtime) | < 40 total |
| Icon instances / distinct sizes | 84 / 11 (10-32dp); **43 (51%) are <=14dp** | ~25 / 2 (16, 20) |
| Font sizes in use | 13 distinct (8-30); **91 of 163 declarations (56%) are <=11sp**; 4 weights | 4 sizes (12/14/16/22), 2 weights |
| Distinct hex colors / inline `rgba()` | 47 / 164; 10+ hues | neutrals + 1 accent + 1 danger |
| `Alert.alert` calls | 32 (5 App, 27 Settings) | destructive confirms only |
| ALL-CAPS tracked labels | ~180 | ~0 |
| a11y labels | **1** in 7,100 lines | every icon-only control |
| Settings controls with no effect | **12 of 12 tuning controls** (see A1) | 0 |

Hard blockers before any polish: A1-A6 (UI claims things the product does not do).

---

## (a) Screen inventory

Nesting depth: Chat = 0. `controls` = literal JSX touchables / switches / inputs in that range `[src]`. Icons = `<XIcon>` instances.

| # | Surface | Entry | Purpose | Controls | Icons | Depth | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Native splash (`app.json:10-14`) then JS splash `SovereignSplashScreen` | every launch | fake boot HUD, ~2.2s minimum, 4.5s watchdog | 0 | 4 | 0 | CUT (double splash, fake stages) |
| 2 | **Chat** `App.tsx:634-1156` | root | converse | 11 touch + 1 input (idle chat shows 12 live controls + 7 icons) | 12 | 0 | KEEP, simplify chrome |
| 3 | History drawer (Modal) `App.tsx:957-1020` | menu icon | thread list, New chat, link to Settings | 4 | 2 | 1 | KEEP as nav hub |
| 4 | Attach sheet (Modal) `App.tsx:917-953` | paperclip | camera/photos/files | 4 | 3 | 1 | HIDE (A3) |
| 5 | ThreadSoulModal `ThreadSoulModal.tsx` (+ SoulCustomizer) | sparkle icon | per-chat persona | 3 + 32 dynamic + 1 input | 1+5 | 1 | MERGE into Persona |
| 6 | Voice overlay (Modal) `App.tsx:1031-1105` | mic | "live voice" | 5 | 2 | 1 | HIDE (A2) |
| 7 | Storage first-run gate (Modal) `App.tsx:1108-1154` | first launch | choose vault folder | 2 | 1 | 1 | CUT (default silently) |
| 8 | Settings main `SettingsScreen.tsx:1987-2167` | pill / sliders icon / drawer / banner | 9 rows + 2 switches + brand header | 10 + 2 sw | 10 | 1 | REPLACE with flat page |
| 9 | Settings > Soul `:798-824` | row | global persona = SoulCustomizer | 1 + 32 dynamic | 1+5 | 2 | MERGE |
| 10 | Settings > Model Vault `:1609-1982` | row | 23-model catalog + filters + downloads | 18 + 1 input; +1-3 per card | 17 | 2 | KEEP as Models, cut filters |
| 11 | Settings > Downloads Hub `:587-793` | row, Models banner | queue + installed list | 11 | 10 | 2 (3 via Models) | MERGE into Models |
| 12 | Settings > Speculative `:829-995` | row, Models banner | dual-model preset UI | 3 + 1 sw | 4 | 2 (3 via Models) | CUT (not wired) |
| 13 | Settings > Data & Storage `:1000-1324` | row | path, 5 slot cards, purge | 10 + 14 Alerts | 8 | 2 | CUT to 4 rows |
| 14 | Settings > Audio & Voice `:1329-1421` | row | STT/VAD/TTS | 3 + 1 sw | 1 | 2 | CUT (not wired) |
| 15 | Settings > Security & Privacy `:1426-1506` | row | biometrics, retention, purge | 3 + 2 sw | 2 | 2 | CUT/MERGE |
| 16 | Settings > Advanced Compute `:1511-1608` | row | Vulkan/threads/flash-attn + telemetry | 2 + 2 sw | 1 | 2 | CUT (not wired) |

Navigation graph problems `[src]`:
- Max depth 3 with **loops**: Models -> Downloads Hub (`:1735`) -> Models (`:649`, `:783`); Storage -> Models (`:1178`).
- Back button always `setCurrentScreen('main')` (`:592, 803, 834, 1005, 1334, 1431, 1516, 1614`): Models -> Speculative -> Back lands on Settings main, not Models.
- No `BackHandler` anywhere (grep = 0) while `app.json:29` enables predictive back `[inf]`: Android system back from Settings likely exits the app.
- 4 different controls open the same Settings screen from chat: model pill (`App:651`), sliders icon (`:668`), drawer row (`:992`), amber banner (`:692`). None is a model switcher.
- Gestures: none exist (no `onLongPress`, no swipe, gesture-handler unused). No hidden gestures, but also no thread delete/rename/swipe, no message copy/regenerate. Hidden *state* instead: sort pill cycles through 5 states on repeated taps (`:1684-1704`).

---

## (b) Heuristic violations

### A. UI that misleads (S1) - fix or remove first
| ID | Evidence | file:line |
|---|---|---|
| A1 | 12 tuning states are bare `useState`: offlineStrict, incognitoMode, turboActive, activePresetIndex, sttEngine, ttsEnabled, vadThreshold, biometricLock, autoPurgeDays, vulkanCompute, threadCount, flashAttention. **0 references outside SettingsScreen, 0 persisted** `[src]`. `isIncognito` exists in `vaultStorage.ts:44,91` but is not connected. | `SettingsScreen.tsx:223-250`; UI at `862, 1349-1391, 1401, 1445, 1477-1491, 1530-1575, 2022, 2037` |
| A2 | Mic CTA opens a voice overlay whose only working input is 3 hard-coded "test chips" ("Hello!", "Who are you?"). `startListening()` only flips state; no STT/audio dep in `package.json`. | `App:894-899, 1075-1095`; `voiceController.ts:32-36` |
| A3 | Attachments (camera/photos/docs) are previewed but never reach the model: `processTurnAsync` receives text only; `mediaUris` is read nowhere in engine. Launch still requests CAMERA/RECORD_AUDIO/MEDIA permissions for them. | `App:503-518, 875-881, 917-953, 147-148, 172-191` |
| A4 | Fabricated status text: "Snapdragon NPU" badge on every assistant message and "Snapdragon 8 Gen 2" on every device; default "Thought for 1.2s" and placeholder thought text; "Verify Session Integrity" always reports healthy; "0% leakage"; "~45ms Native C++ Stream"; "2.8x acceleration active" for any preset; storage '748 MB'/2 facts shown before load. | `App:733, 758, 476, 770`; `Splash:25, 229`; `Settings:1199, 1083, 1415, 982, 253-254` |
| A5 | "Live Cognitive Simulation" is a hard-coded if/else template, not model output - the preview of a persona is invented. | `SoulCustomizer.tsx:96-192, 671-722` |
| A6 | Cross-ref (engine audit to confirm): `loadModel` only reads the GGUF header; `generateStream` returns templated text; no inference runtime dep. So "Mount into RAM", "warm-up latency", "Reasoning on device" are decorative. Download/Mount UX is built for a capability not present. | `localLlm.ts:100-143, 395-420, 756`; `Settings:461-500` |

### B. Navigation / IA (S1-S2)
| ID | Sev | Issue | file:line |
|---|---|---|---|
| B1 | S1 | Settings sprawl: 9 sub-screens as early-return branches in one component, local-state nav, no route/stack | `Settings:69, 587-2166` |
| B2 | S1 | Broken back-stack (see graph above) | listed above |
| B3 | S2 | Model pill looks like a model picker, opens full Settings; label = `id.split('-')[0]` so llama-3.2-1b and llama-3.1-8b both read "LLAMA" | `App:651-655` |
| B4 | S2 | Duplicates: persona editor x2 (live-save in Settings vs explicit "Apply" in modal; global persona only affects *new* chats `App:587`); memory purge x3 with 3 labels; installed models listed x4 (Model card, Downloads Hub `:739-779`, Storage slot `:1143-1177`, chat banner); Downloads Hub reachable 3 ways | `Settings:1314, 1496, 2148`; `ThreadSoulModal:83` |
| B5 | S2 | Modal/Alert stacking: 5 Modals + 32 Alerts. Chains: storage modal -> Alert -> Settings (`App:232-277`); download complete Alert -> Verify&Mount Alert -> Start Chatting (`Settings:412-419, 489-499`). Info/success shown as blocking Alerts (`Settings:363, 455, 1056, 1290`) | |
| B6 | S2 | Inconsistent destructive pattern: delete model has confirm in Models (`:1957-1972`) but **none** in Downloads Hub (`:770-775`) or Storage (`:1165-1173`) | |
| B7 | S2 | Boot is serial and gated on 3 OS permission dialogs (`await requestInitialPermissions()`), but splash watchdog fires at 4.5s regardless - chat can appear before vault/threads/model are ready `[inf]` | `App:144-170`; `Splash:122-133` |

### C. Settings / Models sprawl (S2)
| ID | Issue | file:line |
|---|---|---|
| C1 | Main list: 9 rows with jargon subtitles ("Archetype, PAD emotional vector, prompt modifier"; "Whisper STT, Piper neural TTS, VAD threshold") | `Settings:2056, 2112, 2134` |
| C2 | Storage = 5 "sovereign slots", each with path, description, "Operation:" row, 5 different hues; Seed/Restore Skills for a feature with no UI | `Settings:1088-1311, 1100-1104, 1244-1270` |
| C3 | Models screen: **13 filter controls** (search, 5 grade/uncensored pills, AND/OR, sort, 4 capability pills) + 2 banners before the first card `[est]` ~380dp = about half of an 800dp phone. AND/OR boolean query UI over 23 items. Grade S/B/C is opaque (S rendered *red*). | `Settings:1621-1767, 1642-1660, 1664-1679, 2649-2651` |
| C4 | No "recommended / fits this phone" despite `HardwareProfiler`; too-large models are downloadable with no warning; RAM only as 11sp grey text | `Settings:1853`; `hardwareProfiler.ts` |
| C5 | Model card = ~9 text elements + 1-3 buttons; name, grade, uncensored, ready, repo, size, description, caps, RAM | `Settings:1808-1975` |
| C6 | SoulCustomizer: one scroll of ~1,400dp `[est]` with 32 controls: radar HUD, 4 telemetry chips, 6 archetype cards (each with 8sp role tag + 9sp P/A/D footer), 4 tuners with +/-0.1 steppers and 3-4 preset pills each (20 taps to cross a range), kernel inspector, simulation terminal. Jargon: PAD, "Affective Neural Matrix", "Candor", "Amplitude". | `SoulCustomizer:204-723` |

### D. Touch targets and accessibility (S1-S2)
| ID | Sev | Issue | file:line |
|---|---|---|---|
| D1 | S1 | **1 accessibilityLabel in 7,100 lines** (`App:663`). Icon-only, unlabeled: menu `643`, sliders `668`, attach `875`, mic `894`, send/stop `901`, media-remove `860`, voice-close `1051`, trash `Settings:771/1165/1957`, re-download `1949`, search-clear `1633`, thread-modal close `ThreadSoulModal:64`. 8 `<Switch>` with no label: `Settings:862,1401,1445,1460,1530,1545,2022,2037`. No accessibilityRole/State anywhere. | |
| D2 | S1 | Targets under 44dp with no compensating hitSlop: model pill ~30dp (`App:1201-1211`), mic 36 (`1476`), send 34 (`1486`), media-remove 16 (+6 = 28; `1681`), voice-close icon 18 (`1051`), trash 32 (`Settings:771`), re-download 36 (`2776`), pause/resume ~28 (`2732`), filter/grade/sort/cap pills ~26-28dp with 6dp gaps (`2304-2400`), drawer thread rows ~36 (`App:1520`), stepper ~28 (`SoulCustomizer:956`), preset pills ~26 no hitSlop (`975`), thread-modal close 32 (`ThreadSoulModal:64`) | |
| D3 | S2 | Tiny text: 91/163 declarations <=11sp; minimum 8sp (`SoulCustomizer:785, 883, 1086, 1126, 1146, 1166`; `Settings:2589`). Body copy floor of 14 only met by chat messages (`App:1448`). | |
| D4 | S1 | Contrast `[calc]`: `#71717a` (44 text uses = every secondary/sub label and placeholder) = **4.35:1 on #000, 3.90:1 on #111114** (fails AA 4.5). `#52525b` (13 uses) = 2.72:1 / 2.44:1. `#3f3f46` radar tags = **1.90:1** (`SoulCustomizer:784`), footer = 2.01:1 (`Settings:2268`). Passing: `#a1a1aa` 7.35:1 on card, `#38bdf8` 9.8:1 on black. | |
| D5 | S2 | No Dynamic Type handling (`allowFontScaling`/`maxFontSizeMultiplier` = 0 hits); fixed 56dp bars and fixed 34-38dp buttons - clipping risk at 200% `[inf]` | `App:1186`; `Settings:2180` |
| D6 | S2 | No reduced-motion: 4 infinite loops (`App:117-141, 357-371`; `Splash:46-76`); `AccessibilityInfo` unused | |
| D7 | S3 | Disabled always-on `<Switch>` for ".nomedia" (a non-control styled as a control) | `Settings:1460-1465` |
| D8 | S3 | Single-line chat input (`multiline` absent) - long prompts unusable; no `maxHeight` growth | `App:883-891` |

### E. Visual noise / rainbow / "too many small icons" (S2)
| ID | Issue | Evidence |
|---|---|---|
| E1 | 10+ hues, used decoratively: sky 70x, amber 31x, green 21x, red 12x, purple 9x, emerald 7x, rose 3x, pink 2x, blue 2x, cyan 1x `[calc]`. Decorative hue sets: storage slot badges (`Settings:1100-1104`), archetype tags (`SoulCustomizer:297-302`), splash stage icons (`Splash:200-203`), grade badges, voice-state badges (`App:1565-1580`). Semantic collisions: amber = warning banner = "speculative" brand = "Skills" = "Arousal"; red = danger *and* Grade S; sky = accent, user bubble, progress, "Soul", thinking. |
| E2 | Icons: 27 components, 11 sizes, 1 unused (`SparklesIcon`). **ZapIcon has 9 uses, 6+ meanings** (infinite session, thinking, speculative x4, kernel inspector, simulation, "calibrating"). 23 icons at 14dp, 11 at 12dp. Per-card/row icons add no information. |
| E3 | Per-message chrome: 3 badges (CHIWIWI / archetype / "NPU") + thinking accordion header = 4 rows before every answer (`App:723-765`). |
| E4 | ~180 ALL-CAPS tracked strings ("SAVED SOVEREIGN THREADS", "AFFECTIVE NEURAL MATRIX (PAD)", "PARALLEL SPECULATIVE PIPELINE (K=4 DRAFT TOKENS)"). "Sovereign" appears 35x in UI strings as a prefix on everything. |
| E5 | Glow/gradient/pulse ornament with no function: hero aura + shadow (`App:1259-1282`), plasma shadow radius 50 (`App:1591-1601`), splash radial gradient + aura ring + pulse (`Splash:141-166`). |
| E6 | Developer identity hard-coded in product UI: "LENG SEANG" (`App:1009`); drawer footer shows device/RAM (`App:1011`). |

### F. States and feedback (S2)
| ID | Issue | file:line |
|---|---|---|
| F1 | **No Stop button**: during generation send becomes a disabled spinner; user cannot cancel | `App:901-912` |
| F2 | No copy / regenerate / delete message; no thread rename/delete UI though `VaultStorage.deleteThread` exists | `vaultStorage.ts:235` |
| F3 | Empty chat has no primary CTA when no model is installed; only path is an 11sp amber banner showing the raw id (`llama-3.2-1b`). Hero chip "H / Shorthand: immediate execution" is cryptic. | `App:691-705, 818-835` |
| F4 | Empty drawer = 12sp `#52525b` line, no CTA (2.7:1) | `App:983-987` |
| F5 | No loading state while a model loads at boot/select; user can type before ready. Two simultaneous loaders while generating (pill + send spinner). | `App:159-163, 204-214, 788-797, 907` |
| F6 | All errors = modal Alert with engine text ("Inference Notice", "Check model weights"); no inline retry | `App:560`; `Settings:422-425, 457` |
| F7 | No Memory screen at all: user can only see a count and a purge button; cannot see, edit or pause what is remembered | `Settings:1073-1076, 2121-2125` |
| F8 | 15 Android permissions incl. `MANAGE_EXTERNAL_STORAGE`, `READ_MEDIA_VIDEO/AUDIO`, requested at launch with no context. Play-review risk, and unnecessary for an app-private sandbox. | `app.json:34-51`; `App:172-191` |

### G. Design-system debt (S2)
| ID | Issue |
|---|---|
| G1 | No tokens. 47 hex + 164 inline `rgba()`; StyleSheet blocks = 698 + 924 + 449 lines (30-38% of each file). ~15 near-identical button/pill styles (pairActionBtn, slotBtn, queueActionBtn, mountBtn, downloadStartBtn, pauseResumeBtn, browseModelsBtn, stepBtn, resetBtn, filterPill, gradePill, booleanBtn, sortPill, capTogglePill, presetPill). |
| G2 | `src/components/ui/{button,card,badge,input}.tsx` (NativeWind `className`) and `GuardedButton` + `useGuardedAction`: **0 imports** `[src]`. NativeWind is wired (`index.ts:1`, `metro.config.js:6`, `global.css`, `tailwind.config.js` with empty `theme.extend`) but no screen uses `className`; there is no `babel.config.js` (NativeWind v4 normally needs it, so `className` is likely inert `[inf]`). Dead build surface. |
| G3 | Assets: `icon.png`, `splash-icon.png`, `android-icon-foreground.png` are **byte-identical 1024x1024, 1.06MB each**; only `icon.png` is referenced (`app.json:9, 11, 31`). Full-bleed icon used as adaptive foreground (`app.json:30-33`) - likely cropped by the adaptive mask `[Manual check]`. A 1024px bitmap is decoded for 56-84dp slots in 3 places (`App:807`, `Settings:2003`, `Splash:177`). |
| G4 | Single hard-coded dark theme (`app.json:7`, `StatusBar light-content` everywhere). Acceptable as a decision, but needs contrast fixes (D4); document it. |

---

## (c) Essential journeys and ideal screen count

**Target IA: 4 screens + 1 sheet, labelled, no modal stacking.**

```
Chat  --(model pill)-->  Model sheet (installed list, "Get more models")  -> Models
  |--(drawer: New chat, history, then 3 labelled rows)--> Models | Persona & Memory | Settings
  '--(... menu)--> Persona for this chat (opens Persona & Memory, scope = this chat)
```

| Screen | Contents (max) |
|---|---|
| **1 Chat** | Top bar = 3 controls: history, model pill (full model name + size), overflow (Persona, Rename, Delete). Input = field (multiline) + Send/Stop. Mic and Attach appear **only when real**. Messages: text only; long-press or overflow = Copy, Regenerate; thinking accordion only when the model actually emitted thoughts. Empty state = either the first-run download card or <=3 starter prompts. |
| **2 Models** | Sticky Downloading (progress, pause, cancel) -> Installed (tap = use; delete in overflow with confirm) -> Available (search + one chip row "Fits this phone / All"; Vision/Voice/Code chips only if models exist). Card = name, size, 1-line description, fit label, **one** button. Replaces Model Vault + Downloads Hub + Storage>Models + banner. |
| **3 Persona & Memory** | Persona: 6 archetypes as a plain list (name + one line) + "Applies to: this chat / all new chats" + optional "Fine-tune" disclosure with 3 plain-word sliders (Warmth, Energy, Directness) + Strength. Memory: count, list with per-item delete, "Pause memory" (wire `isIncognito`), "Clear all" with confirm. PAD stays internal. |
| **4 Settings** | One flat page, <=8 rows: Storage (location, used, change folder, clean media), Privacy (app lock only if implemented), Voice (only if implemented), About (version, device, RAM, licences). |

### Journey 1 - first run -> pick/download model -> chat
Now `[src]`: 3 OS permission dialogs -> splash (~2.2s) -> Storage modal (jargon, 2 buttons) -> Alert "Sandbox Initialized" -> "Open Model Hub" -> Settings main -> "Model Vault" -> scan 23 cards under 13 filters -> "Download Model" -> wait -> Alert "Download Complete" -> "Verify & Mount" -> Alert "Mounted" -> "Start Chatting" -> Chat. **>=7 taps, 3 Alerts, 1 modal, 2 screens, 1 decision among 23.**

Ideal: launch (native splash only) -> Chat empty state shows one card: "Download a model to chat offline - [Download Llama 3.2 1B, 0.8 GB, recommended for this phone]" + "Choose another" link -> inline progress with Pause -> auto-load on finish, focus input, toast "Ready". Default sandbox is created silently (the fallback already exists at `App:436-448`); permissions asked at point of use. **1 tap** (+ optional choice), 0 Alerts, warn on cellular for large files.

### Journey 2 - switch model
Now: pill or sliders icon -> Settings main -> Model Vault -> find card -> "Mount into RAM" -> Alert -> "Start Chatting". **4+ taps, 2 screens, 1 Alert.**
Ideal: pill -> sheet of installed models (radio rows, size) -> tap; sheet closes, pill shows spinner then name. **2 taps, 0 screens.**

### Journey 3 - persona
Now: sparkle icon -> 1,400dp modal (32 controls) -> "Apply Persona to This Chat" (close/backdrop silently discards - no `sheet-dismiss-confirm`), or Settings > Soul (live-save, other semantics).
Ideal: overflow -> Persona -> tap archetype (auto-saves, scope shown) -> done. **3 taps.**

### Journey 4 - settings
Now: 9 sub-screens, 3 levels deep. Ideal: drawer -> Settings -> flat list, nothing deeper than one detail page.

---

## (d) Cut / Keep / Merge

### CUT (delete UI; engine hooks stay until needed)
- `SovereignSplashScreen.tsx` (390 lines): use native splash (`expo-splash-screen`) hidden when `bootReady`. Saves ~2.2s every launch, removes fake stages and the double splash.
- Speculative screen + `SPECULATIVE_PRESETS` (`Settings:83-157, 829-995, 1748-1767, 2091-2104`). Not wired.
- Advanced Compute, Audio & Voice, Security screens (`:1329-1608`) and their 12 dead states (A1). Re-add per feature when wired; each returns as one row, not a screen.
- Main-list switches `offlineStrict`, `incognito` (incognito returns as "Pause memory" in Memory).
- Storage slot cards, Seed Souls/Skills, "Verify Session Integrity", `.nomedia` disabled switch, Total-usage telemetry rows (`Settings:1000-1324`) - keep only: location, used, change folder, clean media.
- SoulCustomizer: radar HUD, telemetry chips, kernel inspector, simulation terminal, per-archetype role tag + P/A/D footer, +/-0.1 steppers.
- Models: AND/OR toggle, sort cycler, Grade filter, Uncensored filter (keep "Uncensored" as plain text on the card), "Downloads Hub" banner, "Speculative" banner.
- Chat: per-message badges, fake thought defaults, "Infinite Session" banner (becomes a quiet in-thread divider "Earlier messages summarized"), voice test chips, hero chip "H", "LENG SEANG" footer, "SYSTEM" drawer header.
- Mic button, Attach button/sheet/previews, and the 3 launch-time permission requests **until A2/A3 are real**.
- First-run Storage modal (default silently; folder choice lives in Settings > Storage).
- Dead code: `components/ui/*`, `GuardedButton`, `useGuardedAction`, `SparklesIcon`, duplicate PNGs (`splash-icon.png`, `android-icon-foreground.png`), `MANAGE_EXTERNAL_STORAGE` and READ_MEDIA_VIDEO/AUDIO permissions.
- **Decision - NativeWind**: remove (0 `className` use, no babel config, adds build surface). Use `StyleSheet` + one `theme.ts`. Reverse if: the team wants Tailwind - then delete the per-screen StyleSheets and adopt `ui/*` instead. Pick one; today it is neither. Confidence medium.

### KEEP
- Chat feed core: FlashList, keyboard handling, streaming bubble, thread persistence + compaction logic, history list.
- Download engine behaviors (pause/resume, one-at-a-time guard, progress) - UI shrinks to one progress row.
- Model DB + RAM metadata; add a derived "Fits this phone" from `HardwareProfiler`.
- 6 archetype presets; PAD internal, exposed as plain words.
- Dark OLED theme as a deliberate single theme (document it).
- Haptic selection feedback (centralize it), confirm-before-destructive (make it consistent).

### MERGE
| From | Into |
|---|---|
| Settings>Soul + ThreadSoulModal | one Persona editor with scope selector |
| Model Vault + Downloads Hub + Storage>Models slot + chat banner + Pill->Settings | Models screen + Model sheet |
| 3 purge buttons (`Settings:1314, 1496, 2148`) | Memory > "Clear all" |
| 4 chat->Settings entry points | pill (models) + drawer rows (3 destinations) |
| Storage + Security retention + Data | Settings flat page |
| 32 `Alert.alert` | toast (info/success) + inline error with Retry; Alert only for destructive confirm |
| 15 button/pill styles + 47 hex | `theme.ts` tokens + 4 primitives: Button, Row, Section/Card, Chip |

### Design constraints (no rainbow)
- Color: neutral surfaces (#000 / #111114 / #18181d), text steps `#f4f4f5` primary, `#a1a1aa` secondary (7.35:1 on card), tertiary no lower than `#8a8a93` (5.17:1 on #18181d). **One accent** `#38bdf8` (9.8:1) for primary action, progress, selection. **One danger** `#ef4444` (5.58:1), destructive only. Status = icon + text ("Installed", "Downloading 42%", "Too large for this phone"), never hue alone. Delete amber/purple/pink/emerald/rose/cyan.
- Type: 12 / 14 / 16 / 22, weights 400 and 600, sentence case, no letter-spaced caps, 12sp floor, 14 for body/rows.
- Icons: one outline set (already consistent 1.8 stroke), sizes 20 (toolbar) and 16 (inline) only; labels beside icons in rows; every icon-only control gets `accessibilityLabel` + 44dp hit area (`hitSlop`).
- Spacing 4/8/16/24; one primary action per screen; no more than one modal/sheet deep.
- Respect system: `AccessibilityInfo.isReduceMotionEnabled` for loops; allow font scaling, use min-heights not fixed heights.

---

## Suggested order (smallest diffs first)
1. Honesty pass (A1-A6): hide mic/attach/voice, delete the 12 dead controls + Speculative/Advanced/Audio/Security screens, delete fake badges/telemetry. Mostly deletions in `SettingsScreen.tsx` and `App.tsx`.
2. Chat essentials: Stop button, multiline input, labels + 44dp targets on the 3 top-bar controls, model-switcher sheet from the pill.
3. First-run card in the empty state; remove storage modal, launch permissions, splash component.
4. Models screen: fold Downloads Hub in, drop filters, add "Fits this phone".
5. Persona & Memory screen (reuse SoulCustomizer's data, not its UI); wire `isIncognito`.
6. `theme.ts` + contrast/size fixes; remove NativeWind and dead files; Alerts -> toasts.

## Not verified / limits
- No device run, no screenshots, no TalkBack/VoiceOver pass: all dp heights tagged `[est]`, all runtime behavior tagged `[inf]`.
- Engine claims (A6) are from a short read of `localLlm.ts`/`voiceController.ts`; the engine audit should confirm before the Models/Download UX is redesigned around real inference.
- Contrast computed against solid backgrounds; `rgba` overlays on cards not evaluated.
- `react-native-gesture-handler`/`reanimated` are in `package.json` but unused by these files; not audited further.
