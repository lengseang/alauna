# CHIWIWI design system v2: "Temple"

Owner brief (v2): no rounded corners anywhere; unique, minimal, simple to reach; feels like the native Claude / ChatGPT
apps; smooth and fast; alive; Greek mythology; dark = starry night (**Nyx**), light = sun day (**Helios**); no rainbow.
The full old feature set returns (many settings, a big model library with tags and filters), so the system's main job
is to make **dense information feel calm**.

Concept mock (open in a browser): [`preview/design-v2.html`](../preview/design-v2.html): Arrival (empty chat), Chat,
Model Vault, Settings hub, Soul, and a parts sheet, each in Nyx and Helios side by side at phone size.

Code: tokens and theme in `mobile/src/theme/`, primitives in `mobile/src/ui/` (import from `src/ui/index.ts`).
Screens never write a color, a font size, or a `borderRadius`.

## 1. The concept in five rules

1. **Cut stone.** Radius 0 on everything: buttons, cards, inputs, sheets, toasts, user message blocks, chips, switches.
   The only round shapes are the Eclipse disc (a moon/sun, not a rounded corner) and a few icon glyphs (search lens, sun).
2. **Hairlines, not boxes.** 1dp rules separate things. Rows sit on the page; a Card is used for one idea at a time;
   exactly one item per screen may be **framed** (double hairline, an inscription panel), e.g. the recommended model.
3. **One metal per sky.** Nyx: night indigo + gold leaf `#E6C76A`. Helios: sunlit marble + bronze `#8A5A00`.
   Accent marks the one primary action, selection, live status and the meander. Everything else is ink and hairline.
4. **Greek voice, sparingly.** Cinzel only for screen titles, section titles and the wordmark. Roman numerals index
   settings sections (I, II, III...). A short Greek-key fillet sits under section titles. Nothing else is "themed".
5. **Proof of life.** The Eclipse ring shows the model's real state: a moon that waxes as the model loads (sun in
   Helios), full when ready, a pulsing halo while it writes, a broken ring on failure.

## 2. The shape of the app

```
Chat (root, always mounted)
 |- top bar:  [menu]   model name + Eclipse + live status line   [new chat]
 |- messages: assistant = plain text on the page; you = square surfaceAlt block with a 2dp accent edge
 |- composer: flat square bar  [+ attach] [ multiline field ] [mic -> send -> stop]
 |- drawer (swipe right / menu): new chat, incognito chat, search, chats (pin, rename, delete + Undo), Settings
 |- sheets: model switcher, attach (camera / photos / files), thread soul
 '- everything else is PUSHED on the stack: Model Vault, Downloads, Speculative, Settings hub > 9 sub-screens, Soul...
```

No tab bar. Back (arrow, left-edge swipe, Android Back) peels one layer: sheet, drawer, pushed screen, then minimises.
Chat stays mounted underneath, so typed text, scroll position and a streaming reply survive any detour.

## 3. Tokens (`src/theme`)

### Color (`palette.ts`)

| token | Nyx | Helios | use |
|---|---|---|---|
| bg | `#080A17` | `#FAF6EC` | page |
| surface | `#0F1329` | `#F3ECDB` | sheets, drawer, composer, cards, inputs |
| surfaceAlt | `#171C38` | `#EAE0C9` | your message block, selected segment, toast, pressed |
| border | `#262C4F` | `#D6C8A7` | decorative hairlines only (fails 3:1 on purpose) |
| borderStrong | `#5D679B` | `#8C7B52` | boundary of anything interactive (>= 3:1) |
| text | `#EDEFF8` | `#29231A` | primary text |
| muted | `#9AA2C6` | `#655941` | secondary text, values, poles |
| accent | `#E6C76A` gold | `#8A5A00` bronze | the only hue |
| accentSoft | gold 12% | bronze 8% | selected / pressed wash (put `text` on it) |
| onAccent | `#080A17` | `#FFFFFF` | on accent fills |
| danger / dangerSoft | `#FF8E8E` / 12% | `#B3261E` / 9% | destructive and errors only |
| scrim | night 66% | ink 48% | sheet / drawer backdrop, covered stack layer dim |
| glow | `#EDEFF8` | `#F2C14E` | stars, sun, meteor (never text) |

Contrast, computed by `src/theme/contrast.ts` and **asserted in `test/designSystem.test.ts`** (AA text 4.5, UI 3.0):

| pair | Nyx (bg / surface / surfaceAlt) | Helios (bg / surface / surfaceAlt) |
|---|---|---|
| text | 17.17 / 15.98 / 14.53 | 14.42 / 13.21 / 11.86 |
| muted | 7.84 / 7.30 / 6.63 | 6.36 / 5.83 / 5.23 |
| accent | 11.95 / 11.12 / 10.12 | 5.49 / 5.03 / 4.52 |
| danger | 8.92 / 8.30 / 7.55 | 6.06 / 5.55 / 4.98 |
| borderStrong | 3.64 / 3.39 / 3.08 | 3.84 / 3.52 / 3.16 |
| onAccent on accent | 11.95 | 5.93 |
| text on accentSoft (over bg / surface) | 13.96 / 12.57 | 12.98 / 11.88 |
| accent on accentSoft (over bg / surface) | 9.72 / 8.75 | 4.94 / 4.53 |
| danger on dangerSoft (over bg / surface) | 7.57 / 6.86 | 5.24 / 4.82 |
| border (decorative) on bg | 1.46 | 1.53 |

Status is never hue alone: the words carry it, plus a shape (Notice edge, segment lintel, check glyph, thumb position,
Eclipse slash).

### Type (`theme.ts`): four sizes, two Inter weights, Cinzel for titles

| variant | size / line | face | use |
|---|---|---|---|
| `body` | 16 / 24 | Inter 400 | chat, paragraphs |
| `strong` | 16 / 24 | Inter 600 | row titles, button labels |
| `small` | 14 / 20 | Inter 400 (muted) | helper text, values, status lines |
| `label` | 14 / 20 | Inter 600 | field labels, chips, small actions |
| `title` | 20 / 28 | Inter 600 | card and sheet titles (model names) |
| `heading` | 20 / 28 | Cinzel 600, tracking 1 | screen titles (`Screen`) |
| `section` | 14 / 20 | Cinzel 600, tracking 1.5, caps | section titles (`SectionHeader`) |
| `numeric` | 20 / 28 | Inter 600, tabular figures | `Stat` values |
| `display` | 28 / 36 | Inter 600 | rare hero numbers |
| `wordmark` | 28 / 36 | Cinzel 600, tracking 4 | CHIWIWI only |

All sizes multiply by the in-app **text size** (1, 1.15, 1.3; never below 1, so nothing drops under 14sp) and honour
system font scaling up to 1.6x. Fonts: Inter 400/600 + Cinzel 600 (3 files, deep imports); 3s load limit, then system
fonts with the same sizes.

### Other tokens (`tokens.ts`)

| token | value |
|---|---|
| `space` | xs 4, sm 8, md 12, lg 16 (gutter), xl 24, xxl 32 |
| `radius` | **all 0** (`none sm md lg pill` kept so old call sites compile and render square) |
| `line` | 1 (hairline) |
| `hit` | 48 (min target; >= 8 between targets; rows >= 56) |
| `icon` | 24dp, stroke 1.5, square caps, mitred joins |
| `motion` | fast 150, base 250, slow 400, push 320, pop 240 (ms) |
| `curves` (`ui/Motion.tsx`) | enter `bezier(.22,1,.36,1)`, exit `bezier(.4,0,1,1)`, breathe sine |

### Theme plumbing

- `ThemeProvider` once at the root: theme choice, text size, motion and haptics persisted in `chiwiwi_theme.json`
  (v1 files `{ pref }` upgrade in place), OS reduced-motion, fonts, native background + status bar, `Appearance` so
  Alerts follow. Renders nothing until prefs + fonts resolve (native splash covers the wait).
- `useTheme()` -> `{ colors, space, radius, size, hit, line, motion, type, scheme, isDark, name, reduceMotion, textScale, haptics }`.
  `reduceMotion` = OS setting OR Appearance > Reduce motion.
- `useThemePref()` -> `{ pref, setPref, textScale, setTextScale, motion, setMotion, haptics, setHaptics, systemReduceMotion }`
  (Settings > Appearance).
- `makeStyles(theme => ({...}))` returns a hook; styles rebuild only when the theme changes.

## 4. Primitives (`src/ui`)

| primitive | props (beyond the obvious) | notes |
|---|---|---|
| `Text` | `variant`, `tone: text muted accent danger onAccent`, `ref` | the only text; heading variants announce as headers |
| `Button` | `label`, `onPress` (may be async), `variant: primary quiet danger text`, `icon`, `loading`, `busyLabel`, `disabled` | square, 48dp; one `primary` per screen; busy/debounce/toast-on-error built in; haptics follow Appearance |
| `IconButton` | `icon`, `label` (spoken, required), `tone: default filled outline`, `selected`, `color` | 48x48 square; `filled` = the accent key (Send/Stop) |
| `Icon` | `name`, `color`, `size`, `rotate`; `iconNames` | 38 glyphs + aliases (below) |
| `Card` | `onPress`, `selected`, `framed`, `accessibilityLabel/Hint` | one idea; `framed` = the one hero item |
| `ListRow` (`Row`) | `title`, `subtitle`, `value`, `onPress` (chevron), `switchValue + onSwitch` (whole row toggles), `selected` (radio check), `icon`, `right`, `destructive`, `disabled` | >= 56dp, on the page, separated by `Divider` |
| `Divider` | `inset` | 1dp decorative rule |
| `SectionHeader` | `title`, `index` (roman numeral), `hint`, `right`, `meander` | Cinzel caps + Greek-key fillet |
| `Meander` | `height` (10), `tone: accent border`, `units` | `units` = N keys then a hairline (fillet); omit for a full band |
| `Field` | `label`, `hint`, `error` + TextInput props | visible label, accent left edge on focus, error under |
| `SearchField` | `value`, `onChangeText`, `label` | search glyph, clear (x), role search |
| `Tag` | `label`, `onPress` (= filter chip), `selected`, `tone: default accent danger`, `icon`, `count` | static 28dp hairline label; chip 36dp + 48dp hit, check glyph when on, role checkbox |
| `Segmented` | `options [{value,label}]`, `value`, `onChange`, `label` | 2-4 choices; chosen cell raised + 2dp accent lintel; radiogroup |
| `Switch` | `value`, `onValueChange`, `label` | square track and thumb; display-only without `onValueChange` (ListRow uses it so) |
| `Slider` | `label`, `value`, `onChange` (live), `onCommit` (release), `min max step`, `origin` (bipolar), `format`, `poles`, `hint` | hairline track, lozenge thumb, tap/drag, adjustable for screen readers |
| `Stat` | `label`, `value` (null = honest dash), `unit`, `hint` | tabular value; lay out in a row divided by hairlines |
| `ProgressBar` | `fraction`, `label`, `tone: accent danger muted` | square 4dp channel |
| `Notice` | `children`, `title`, `tone: info danger quiet`, `action` | square 2dp edge; replaces banners and non-destructive Alerts |
| `Eclipse` | `state: idle loading ready busy error`, `progress`, `size`, `label` | proof of life (see section 5) |
| `Sheet` | `visible`, `onClose`, `title`, `footer` | square slab, grip, swipe-down, Back; never stack two |
| `ToastHost` + `showToast` / `showUndo` | | square slab with accent edge, top, polite |
| `EmptyState`, `Wordmark`, `Ambient` | | arrival / boot / onboarding only |
| `Breathe`, `PulseDot`, `FadeIn`, `useLoop`, `curves` | | motion helpers (native driver) |
| `Screen` | `title`, `onBack`, `right`, `toolbar` (pinned under header), `ambient`, `scroll` | Cinzel title; moves screen-reader focus to the title on mount |
| `DrawerLayout` | `open`, `onOpenChange`, `drawer` | left drawer following the finger |

Icons (24dp, 1.5 stroke, square caps): `menu compose(new) send stop back chevron plus check close more chat search filter
sort download models(temple) pause play mic camera image file attach settings persona(soul, a square mask) memory
shield lock storage chip(compute) speaker(voice) bolt(turbo) trash pin edit incognito(eye-off) sun moon`. Only `stop` and
`more` are filled. Use few per view: Chat shows menu, new, attach and one action key (mic -> send -> stop).

```tsx
<Screen title="Model Vault" onBack={goBack} toolbar={<SearchField label="Search models" value={q} onChangeText={setQ} />} scroll>
  <Card framed><Text variant="title">Qwen3.5 4B</Text><Button label="Download 2.7 GB" icon="download" onPress={start} /></Card>
  <SectionHeader index={2} title="Installed" />
  <ListRow title="Gemma 4 E2B" value="1.8 GB" onPress={() => push('vault/model', { id })} />
  <Divider />
  <ListRow title="Incognito by default" switchValue={inc} onSwitch={setInc} />
  <Slider label="Warmth" value={p} onChange={setP} onCommit={save} min={-1} max={1} step={0.05} origin={0} poles={['Cool', 'Warm']} />
</Screen>
```

## 5. The alive layer (native driver, stops under reduced motion)

| where | what | cost |
|---|---|---|
| Arrival / boot / onboarding (Nyx) | 42 square stars in 4 twinkle groups, gold four-point sparkles, the whole sky drifting 18dp over 30s, one meteor every ~14s | 6 loops |
| Same (Helios) | soft radial sun breathing (4.5s) + 16 square-ended rays turning once per 2 min | 2 loops |
| Eclipse | waxing disc with real progress; halo pulse (900ms) while generating | 1 loop while busy |
| Streaming | lozenge cursor pulsing | 1 per live row |
| Stack push / pop | slide in from the right 320ms (decelerating), out 240ms; the screen beneath shifts 28% left and dims; left-edge swipe follows the finger | 1 per layer |
| Sheet, toast, drawer | 250ms in / 180ms out | native driver |
| New message | fade + 8dp rise 250ms, only for rows created in the last 1.5s | 1 per new row |
| Switch | thumb slides 150ms | 1 |

With reduce motion (OS or in-app): loops stop, transitions are instant, drags still follow the finger.

## 6. Navigation (`nav.ts`, `routes.tsx`, `Stack.tsx`)

- Register a screen with ONE line in `src/ui/routes.tsx` (`'settings/audio': AudioSettings`). The key becomes a typed
  `Route`.
- `push(route, params?)` (a twin on top is ignored), `pop()`, `goBack()` (double-tap safe), `replace(route, params?)`,
  `resetTo(route)`; in a screen, `useParams<{ id: string }>()`; `useRoute()`, `useEntries()`.
- Back: App.tsx routes Android Back to `pop()`; open drawers/sheets register `useBackHandler` and win first.
- Layers two deep are made invisible (no overdraw; state and scroll survive); covered layers are hidden from screen
  readers; a pushed `Screen` moves focus to its title.

## 7. Review checklist

1. Square everywhere: no `borderRadius` in `src/ui` (test enforces it for the primitives; screens use tokens, which are 0).
2. Tokens only: no hex, no `rgba(`, no literal `fontSize` in `src/ui` (test enforces it for the primitives).
3. One `primary` Button per screen; at most one `framed` Card; few icons per view.
4. Text >= 14sp; Cinzel only via `heading`, `section`, `wordmark`.
5. Targets >= 48dp, rows >= 56dp, >= 8dp between targets.
6. Destructive = `confirm()`; reversible = `showUndo`; info = toast; errors = inline `Notice` with a recovery action.
7. Color is never the only signal.
8. Honest UI: every number comes from the engine, the file system or the device; nothing measured = `Stat` dash or words.
9. Both skies, text size 1.3, font scale 1.3 and reduced motion checked before merge.
10. Chat performance: memo rows, only the streaming row re-renders, animations on the native driver.

## 8. Notes for wave-2 screens

- `Composer.tsx` still has a literal `borderRadius: 28` (S1): make the bar square (use `colors.surface` + `line` border).
- `Row` is now `ListRow` (same props, plus `value`, `switchValue/onSwitch`, `disabled`); nav rows show a chevron.
- `Screen` titles are Cinzel now; long titles: keep them to two words ("Advanced compute").
- Filters: `Tag onPress selected count`; match mode: `Segmented` All/Any; sort: a `Button variant="text" icon="sort"` that
  opens a `Sheet` of radio `ListRow`s.
- Proof of life: map engine status to `Eclipse` (`loading` + progress, `ready`, `busy` while generating, `error`,
  `idle` when nothing is loaded) and keep the words next to it.
