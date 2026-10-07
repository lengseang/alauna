# CHIWIWI design system (Phase 1)

Owner brief: minimal, fast, smooth; the feel of the native Claude and ChatGPT apps; **chat is home**; light and dark; dark = starry night, light = sun day; Greek mythology as a quiet voice, not decoration; **not a rainbow**.

Everything below lives in `mobile/src/theme/` (tokens, provider) and `mobile/src/ui/` (primitives, screens). Nothing outside those folders knows a color or a font size.

## 1. The shape of the app

```
Chat (home, always mounted)
 |- top bar:  [menu]   model name + live status line   [new chat]
 |- messages: plain text on the page, one subtle bubble for you
 |- composer: one pill  [+ attach] [ multiline field ] [Send -> Stop]
 |- swipe right / menu  ->  Drawer: New chat, saved chats (hold = delete + Undo), Models, Persona, Settings
 |- tap the model name  ->  Model sheet (switch model, think on/off, proof-of-life numbers)
 '- Models / Persona / Settings (+ Memory, Storage, Advanced, About) are pushed on top with a back arrow
```

No tab bar. Android Back peels one layer: sheet, drawer, pushed screen, then minimises the app. Chat stays mounted underneath, so typed text, scroll position and a streaming reply survive any detour.

### Proof of life (the owner could not tell whether the AI was running)

Every claim is a real engine number (`useEngineStatus()` from `services/engine.ts`):

| Where | Shows | Source |
|---|---|---|
| Top bar, under the model name | `Loading 42%` -> `Testing first words` -> `Ready . CPU` (gold) / `Generating` / `Could not load` (red) / `Not loaded` / `Unloaded to free memory` / `Not downloaded` | `EngineStatus.state/progress/backend/unloadedReason` (`ui/engineStatus.ts` maps it, nothing invented) |
| Model sheet | `Ready . CPU . 4096 token memory . loaded in 6.1s . last speed 18.2 tok/s . first token 0.8s`; engine error + fix | `nCtx, loadMs, lastTokPerSec, ttftMs, error, errorFix` |
| In the answer, while working | pulsing dot + `Loading <model> 42%` / `Reading your message (~120 tokens)` / `Thinking 12s` / pulsing cursor while text streams | message `phase`, engine `loadProgress` |
| After every reply | quiet line `18.2 tok/s . 164 tokens` | `message.stats` (measured by llama.cpp) |
| Models > Test model | `Works. It answered "4" . first token in 0.8s . 18.2 tok/s . loaded in 6.1s . CPU` or the exact failure + fix | `runSelfTest()` |
| App start | the chosen model loads by itself once per launch (`ChatScreen` effect), unless the last run died while loading it | `engine.mount` |

Not available yet (validator/services, see section 7): live tokens/second **during** generation.

## 2. Tokens (`src/theme`)

### Color (`palette.ts`): one gold, two skies

| token | Nyx (dark, starry night) | Helios (light, sun day) | use |
|---|---|---|---|
| bg | `#0A0D1C` | `#FBF6EA` | page |
| surface | `#141935` | `#F3EBD5` | drawer, cards, sheets, composer |
| surfaceAlt | `#1B2246` | `#EBE0C2` | user bubble, toast, pressed |
| border | `#2E3660` | `#CDBE98` | hairline dividers only (fails 3:1 on purpose) |
| borderStrong | `#5F6AA0` | `#8F7F55` | boundary of anything tappable (>= 3:1) |
| text | `#EEF0FA` | `#2B2417` | primary text |
| muted | `#9EA7CB` | `#675B40` | secondary text |
| accent | `#E6C76A` starlight | `#8A5A00` bronze | the only brand hue |
| accentSoft | gold 14% | bronze 7% | selected/pressed wash. Put `text` on it, not `accent` |
| onAccent | `#0A0D1C` | `#FFFFFF` | on accent fills |
| danger / dangerSoft | `#FF8B8B` / 14% | `#B3261E` / 10% | destructive only |
| scrim | night 62% | ink 48% | sheet/drawer backdrop |
| glow | `#EEF0FA` stars | `#F2C14E` sun | decoration only, never text |

Measured contrast (WCAG relative luminance; AA text = 4.5, UI = 3.0):

| pair | Nyx | Helios |
|---|---|---|
| text / bg, surface, surfaceAlt | 17.00, 15.14, 13.55 | 14.24, 12.91, 11.68 |
| muted / bg, surface, surfaceAlt | 8.13, 7.25, 6.48 | 6.19, 5.61, 5.08 |
| accent / bg, surface, surfaceAlt | 11.72, 10.44, 9.34 | 5.50, 4.98, 4.51 |
| onAccent / accent | 11.72 | 5.93 |
| danger / bg, surface, surfaceAlt | 8.57, 7.64, 6.83 | 6.06, 5.50, 4.97 |
| accent on accentSoft (over surface) | 7.79 | 4.56 |
| danger on dangerSoft (over surface) | 6.03 | 4.70 |
| borderStrong / bg, surface | 3.73, 3.32 | 3.65, 3.31 |
| border / bg (decorative) | 1.67 | 1.71 |

Dark is not inverted light: it is desaturated, tinted navy with the same gold. Status is never hue alone: words, a shape (the 3dp edge on `Notice`) or a pulsing dot always carry it.

### Type (`theme.ts`): four sizes, two weights

| variant | size / line | weight | use |
|---|---|---|---|
| `display` | 28 / 36 | 600 | rare (hero numbers) |
| `title` | 20 / 28 | 600 | screen titles, card titles (announced as headings) |
| `strong` | 16 / 24 | 600 | row titles, button labels |
| `body` | 16 / 24 | 400 | chat, paragraphs |
| `label` | 14 / 20 | 600 | section labels, small actions |
| `small` | 14 / 20 | 400 | helper text, status lines (muted by default) |
| `wordmark` | 28 / 36, Cinzel 600, tracking 4 | | the CHIWIWI wordmark only |

Fonts: Inter 400/600 + Cinzel 600 (`@expo-google-fonts`, deep imports, 3 files in the bundle). Loading has a 3s limit; on failure the app runs on the system font with the same sizes (`FontFamilies` empty -> `fontWeight`). Font scaling is honoured up to 1.6x; layouts use `minHeight`, never fixed heights.

### Other tokens (`tokens.ts`)

| token | values |
|---|---|
| `space` | xs 4, sm 8, md 12, lg 16, xl 24, xxl 32 (screen gutter 16) |
| `radius` | sm 8, md 12, lg 20, pill 999 (composer 28) |
| `hit` | 48 (minimum touch target, with >= 8 between targets) |
| `icon` | 24dp, stroke 1.75, round caps |
| `motion` | fast 150, base 250, slow 400 ms (enter 250, exit 180) |

### Theme plumbing

- `ThemeProvider` (wrap the app once): user choice `system | light | dark`, persisted in its own file `chiwiwi_theme.json` (the shared settings model has no slot and is not UI-owned), `Appearance.setColorScheme` so native Alerts follow, `expo-system-ui` background, StatusBar style, `AccessibilityInfo` reduced-motion, fonts. Renders nothing until choice + fonts are known, so the native splash covers the wait and the first frame is already themed.
- `useTheme()` -> `{ colors, space, radius, size, hit, motion, type, scheme, isDark, name, reduceMotion }`.
- `useThemePref()` -> `{ pref, setPref }` (Settings > Appearance: "Follow my phone", "Nyx", "Helios").
- `makeStyles(theme => ({...}))` returns a hook; styles rebuild only when the theme changes:

```tsx
const useStyles = makeStyles(({ colors, space, radius }) => ({
  box: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.lg },
}));
function Thing() { const s = useStyles(); return <View style={s.box} />; }
```

- Native: `app.json` has `userInterfaceStyle: "automatic"`; splash is ivory `#FBF6EA` with a dark-ink logo (`assets/splash-icon-light.png`, generated from the silver logo) and, in dark, `#0A0D1C` with the silver logo; adaptive icon background `#0A0D1C`.

## 3. Components (`src/ui`, import from `./index`)

| component | what it is | notes |
|---|---|---|
| `Screen` | safe-area page with header (back arrow, title) | `scroll` = padded ScrollView (16 gutter, 16 gap); `ambient` = stars/sun behind (empty/onboarding only) |
| `Text` | the only text | `variant`, `tone` (`text muted accent danger onAccent`) |
| `Button` | every action with a side effect | `primary` (one per screen) / `quiet` (outlined) / `danger` / `text` (inline link). Always a text label. Async `onPress` shows a spinner; taps while busy or within 350ms are dropped; errors become a toast. 48dp. |
| `IconButton` | 48dp icon target | `label` is required (spoken). `tone="filled"` = the accent disc (Send/Stop). |
| `Icon` | 10 icons only | `menu compose send stop back plus check models persona settings`. `rotate={180}` on `back` = forward arrow |
| `Card` | grouped surface | `selected` = accent outline + wash; `onPress` makes it one target. Not for list rows or chat messages |
| `Row` | list row, no box | title, subtitle, trailing arrow/check/`right`. `selected` (true/false) = radio row. Separate rows with `Divider` |
| `Divider` | 1dp hairline | |
| `Field` | labeled input | visible label, hint, error under the field, accent border on focus |
| `Notice` | inline message with colored edge | replaces banners, inline errors and info Alerts. `action` slot for a recovery button |
| `ProgressBar` | determinate bar | announces its percent |
| `Sheet` | bottom sheet | slides up 250ms, down 180ms; closes by Close, backdrop, swipe down on the handle, Android Back. Never stack two |
| `DrawerLayout` | left drawer | right-swipe anywhere on the page or the menu button opens; follows the finger; native-driver settle |
| `ToastHost` + `showToast` / `showUndo` | top toast | `showUndo(text, onUndo)` = 5s toast with Undo (use instead of a confirm for reversible deletes) |
| `EmptyState` | one line + one action | optional wordmark, ambient |
| `Wordmark`, `Breathe`, `PulseDot`, `FadeIn`, `Ambient` | the alive layer | see section 4 |
| `RouteStack` + `nav.ts` | chat + pushed layers | `push(route)`, `goBack()`, `useBackHandler(enabled, fn)` |

Usage:

```tsx
<Screen title="Models" onBack={goBack} scroll>
  <Card>
    <Text variant="title">Qwen3.5 4B</Text>
    <Text tone="muted">Balanced. 2.7 GB.</Text>
    <Button label="Download" icon="models" onPress={() => downloads.start(spec)} />
  </Card>
  <Row title="Storage" subtitle="App storage" onPress={() => push('settings/storage')} />
  <Notice tone="danger" action={<Button label="Try again" variant="quiet" onPress={retry} />}>Could not reach Hugging Face.</Notice>
</Screen>

<Sheet visible={open} onClose={() => setOpen(false)} title="Model">...</Sheet>
```

## 4. The alive layer (restrained, native driver, honours reduced motion)

| where | what | cost |
|---|---|---|
| Empty chat, onboarding, boot (Nyx) | 38 stars in 4 groups that twinkle slowly (2.6-5s, offset) | 4 native animations, not 38 |
| Same places (Helios) | soft radial sun (SVG gradient) breathing every 4.5s + 16 thin rays turning once per 2 min | 2 native animations |
| Boot, empty chat while a model loads | wordmark breathes (opacity 1 -> 0.55, scale 1 -> 1.04) | 1 |
| Streaming | pulsing accent dot as the cursor; pulsing dot beside live status text | 1 per live row |
| New message | fade + 8dp rise, 250ms, only for messages created in the last 1.5s (scrolled-back rows do not replay it) | 1 per new row |
| Pushed screen | slide 32dp + fade, 250ms in / 180ms out; Chat stays mounted | 1 |
| Drawer, sheet, toast | slide/fade 250ms in, 180-200ms out; drawer tracks the finger | native driver |

With the OS setting "remove animations" on: loops stop, transitions are instant, drags still follow the finger.

Greek voice (quiet, never decoration): dark theme is "Nyx", light "Helios" (Settings > Appearance); empty chat with no model: "The oracle is silent. Pick a model to wake it."; greeting: "What shall we explore?". Tab/destination names stay plain (Models, Persona, Settings).

## 5. Rules (review checklist)

1. **Max 4 icons on a screen** (Chat: menu, compose, attach, send/stop). The drawer's three rows may carry their icon. Icons never replace a label on a `Button`; `IconButton` always has a `label`. No emoji, no per-message badges.
2. **One primary action per screen** (`Button variant="primary"`). Everything else is `quiet` or `text`.
3. **No text under 14sp**, only 14/16/20/28, two weights, sentence case, no letter-spaced capitals.
4. **Touch targets >= 48dp**, >= 8dp apart. Rows >= 56dp.
5. **Confirm only destructive** actions (delete model, cancel download, forget all) via `confirm()`; reversible ones use `showUndo`. Info and success are toasts, never Alerts. Errors are inline (`Notice`) with a recovery button.
6. **Tokens only.** No hex, no literal font size, no per-screen spacing. Check: `grep -rnE "fontSize|#[0-9a-fA-F]{3,8}|rgba\(" src/ui` returns only the one `type.small.fontSize` in `Markdown`.
7. **Color is never the only signal.** Use words, the `Notice` edge, a pulsing dot.
8. **Honest UI.** A status shows only what the engine/store reports. If it is not built, it is not shown (see `docs/ROADMAP.md`).
9. **Both themes before merge.** Look at every screen in Nyx and Helios, with font scale 1.3 and with "remove animations" on.
10. Chat performance: rows are `React.memo`, only the streaming row re-renders per token (the chat service coalesces updates to ~15/s), no `setState` on scroll except crossing the "Latest" threshold, animations on the native driver.

## 6. Chat internals (so Phase 2 does not undo them)

- `ChatScreen` = `DrawerLayout` > [`ChatTopBar`, banners, `KeyboardAvoidingView` > (`EmptyChat` | inverted `FlatList` of `MessageRow`) + `Composer`], plus `ModelSheet`.
- List: inverted, data reversed once per change, `maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}` (follows the bottom while you are near it, holds your place when you scroll up), "Latest" pill when > 320dp up.
- `Composer` owns its text and attachments (typing never re-renders the list); `submitMessage()` is the one send path (also used by the prompt suggestions) and handles every refusal in words.
- `MessageRow`: user = right-aligned `surfaceAlt` bubble; assistant = plain `Markdown` on the page, reasoning collapsed under "Thought for 12s", stats line, Copy/Retry on the newest reply only.
- Delete a chat: hold it in the drawer (hint line says so), haptic, `Undo` toast restores the saved file.

## 7. Phase 2 handoff

Each screen below works end to end today on the new language; Phase 2 improves polish, copy and edge cases. Files are in `mobile/src/ui/`.

| Screen | Files | State now | Phase 2 work |
|---|---|---|---|
| **Chat** | `ChatScreen`, `ChatTopBar`, `MessageRow`, `Markdown`, `Composer`, `EmptyChat`, `ThreadDrawer`, `ModelSheet`, `Drawer` | Complete (section 6) | Device pass for the inverted-list + keyboard + drawer-gesture feel; code-block copy; per-message long-press; message edit; image attach only when real; live tok/s while streaming (needs the service hook below) |
| **Models** | `ModelsScreen`, `ModelCards` (`DownloadCard`, `InstalledCard`, `AvailableRow`, options sheet), `SetupCard`, `modelActions.ts` | Recommended card on top (one tap = download, verify, load, prove), Downloading cards (progress, pause, resume, cancel), installed cards (Test model, More: integrity check / unload / delete), More models rows, storage row | Fit explanation, cellular warning, show disk space needed before download, empty/offline states, copy |
| **Persona + Memory** | `PersonaScreen` (`PersonaScreen`, `MemoryScreen`) | Archetype list (applies to this chat and new chats), Fine-tune folded (3 steppers + extra instructions for this chat), Memory screen (add, forget, forget all) | Real preview of the system prompt, plain-word sliders, per-chat vs global scope control, "pause memory" (`isIncognito` is not wired in services) |
| **Settings** | `SettingsScreens` (`SettingsHome`, `StorageSettings`, `AdvancedSettings`, `AboutSettings`), `StoragePicker` | Flat: Appearance (3 radio rows), Storage, Advanced, About (6 rows) | Voice/privacy rows only when implemented; storage "clean up" row |
| **Onboarding** | `OnboardingScreen`, `StoragePicker` | Wordmark + stars/sun, phone summary, storage choice, then straight to Models | Merge into a single "Getting ready" screen driven by `useSetup()` |
| **Foundation** | `src/theme/*`, `Button Card Divider EmptyState Field Icon IconButton Notice ProgressBar Row Screen Sheet Text Toast`, `Ambient Motion Wordmark`, `nav Stack` | Done | Add a primitive only when two screens need it |

### Placeholders and gaps (be honest about them)

- **Not run on a device.** The app is not installed on the test phone, so layout, gesture feel (drawer swipe vs the system back gesture, inverted-list auto-follow), fonts and the splash were verified by typecheck and the Android bundle only. First thing to do on device: both themes, font scale 1.3, reduced motion, keyboard open in Chat and in the Persona field.
- Services/validator follow-ups: (1) live tokens/second while a reply streams (today only `message.stats` after the reply and `lastTokPerSec` after load); (2) `Settings` has no slot for the theme choice, so it lives in `chiwiwi_theme.json` (move it into settings if wanted); (3) `test/config.test.ts` asserts a black splash; it must now expect `#FBF6EA` (light) with `dark.backgroundColor` `#0A0D1C`; (4) `mobile/AGENTS.md` still says every button is `src/ui/Btn.tsx`; it is now `src/ui/Button.tsx`.
- The attach button only accepts text files (that is all the engine can use); there is no mic, camera or image attach (not built).
- Per-chat persona override still exists in the data model (`thread.soul`) but has one editor now (Persona screen), which updates both the default and the open chat.
- Splash logo for light mode is an automatic recolor of the silver logo; a designer should hand-tune it.
