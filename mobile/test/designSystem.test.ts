/**
 * Temple design system: the promises docs/DESIGN.md makes, checked. Pure modules only (no React Native at runtime).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contrast, over } from '../src/theme/contrast.ts';
import { helios, nyx, type Palette } from '../src/theme/palette.ts';
import { buildTheme, defaultPrefs, parsePrefs } from '../src/theme/theme.ts';
import { radius, textScales } from '../src/theme/tokens.ts';
import { meanderPath, moonPhasePath, snapValue, stackPop, stackPush, toFraction, toRoman } from '../src/ui/logic.ts';

const themes: [string, Palette][] = [['Nyx', nyx], ['Helios', helios]];

test('palette: every text role passes WCAG AA (4.5:1) on bg, surface and surfaceAlt, in both themes', () => {
  for (const [name, p] of themes) {
    for (const fg of ['text', 'muted', 'accent', 'danger'] as const) {
      for (const bg of ['bg', 'surface', 'surfaceAlt'] as const) {
        const r = contrast(p[fg], p[bg]);
        assert.ok(r >= 4.5, `${name} ${fg} on ${bg} = ${r.toFixed(2)}`);
      }
    }
    assert.ok(contrast(p.onAccent, p.accent) >= 4.5, `${name} onAccent on accent`);
    // Selected states: text on the accent wash, accent check on the wash, danger on its wash.
    for (const base of ['bg', 'surface'] as const) {
      assert.ok(contrast(p.text, over(p.accentSoft, p[base])) >= 4.5, `${name} text on accentSoft/${base}`);
      assert.ok(contrast(p.accent, over(p.accentSoft, p[base])) >= 4.5, `${name} accent on accentSoft/${base}`);
      assert.ok(contrast(p.danger, over(p.dangerSoft, p[base])) >= 4.5, `${name} danger on dangerSoft/${base}`);
    }
  }
});

test('palette: interactive boundaries pass 3:1; decorative hairlines stay quiet (< 3:1)', () => {
  for (const [name, p] of themes) {
    for (const bg of ['bg', 'surface', 'surfaceAlt'] as const) assert.ok(contrast(p.borderStrong, p[bg]) >= 3, `${name} borderStrong on ${bg}`);
    assert.ok(contrast(p.border, p.bg) < 3, `${name} border is decorative only`);
  }
});

test('palette: one accent per theme, no second hue (all keys present, values are colors)', () => {
  assert.deepEqual(Object.keys(nyx).sort(), Object.keys(helios).sort());
  assert.equal(nyx.accent, '#E6C76A');
  assert.equal(helios.accent, '#8A5A00');
});

test('geometry: every radius token is 0 (Temple: square everywhere)', () => {
  for (const [k, v] of Object.entries(radius)) assert.equal(v, 0, `radius.${k}`);
});

test('geometry: no primitive writes a borderRadius (the Eclipse disc and glyphs are SVG, not rounded boxes)', () => {
  const owned = ['Ambient', 'Button', 'Card', 'Divider', 'Eclipse', 'EmptyState', 'Field', 'Icon', 'IconButton', 'Meander', 'Motion', 'Notice', 'ProgressBar', 'Row', 'Screen', 'SectionHeader', 'Segmented', 'Sheet', 'Slider', 'Stack', 'Stat', 'Switch', 'Tag', 'Text', 'Toast', 'Wordmark'];
  for (const f of owned) {
    const src = readFileSync(new URL(`../src/ui/${f}.tsx`, import.meta.url), 'utf8');
    assert.ok(!/border\w*Radius/.test(src), `${f}.tsx has a borderRadius`);
    assert.ok(!/#[0-9a-fA-F]{3,8}\b|rgba\(/.test(src), `${f}.tsx has a literal color`);
  }
});

test('type: nothing renders under 14sp at any text scale; Cinzel only on heading/section/wordmark', () => {
  const fonts = { regular: 'Inter_400Regular', semibold: 'Inter_600SemiBold', wordmark: 'Cinzel_600SemiBold' };
  for (const k of textScales) {
    const t = buildTheme('dark', fonts, false, k, true);
    for (const [variant, style] of Object.entries(t.type)) {
      assert.ok((style.fontSize ?? 0) >= 14, `${variant} at x${k}`);
      const cinzel = style.fontFamily === fonts.wordmark;
      assert.equal(cinzel, ['heading', 'section', 'wordmark'].includes(variant), `${variant} font family`);
    }
  }
  assert.equal(buildTheme('light', {}, false, 0.5).type.small.fontSize, 14, 'scales below 1 are ignored');
});

test('prefs: v1 file ({ pref }) upgrades; each bad field falls back alone', () => {
  assert.deepEqual(parsePrefs({ pref: 'dark' }), { ...defaultPrefs, pref: 'dark' });
  assert.deepEqual(parsePrefs(null), defaultPrefs);
  assert.deepEqual(parsePrefs({ pref: 'neon', textScale: 1.3, motion: 'wild', haptics: 'no' }), { ...defaultPrefs, textScale: 1.3 });
  assert.deepEqual(parsePrefs({ pref: 'light', textScale: 2, motion: 'reduce', haptics: false }), { pref: 'light', textScale: 1, motion: 'reduce', haptics: false });
});

test('roman numerals for section indices', () => {
  assert.deepEqual([1, 2, 3, 4, 9, 12, 14, 40, 1999].map(toRoman), ['I', 'II', 'III', 'IV', 'IX', 'XII', 'XIV', 'XL', 'MCMXCIX']);
  assert.equal(toRoman(0), '');
  assert.equal(toRoman(2.5), '');
});

test('slider: snap clamps, lands on the step grid without float noise, and maps to a fraction', () => {
  assert.equal(snapValue(0.31, 0, 1, 0.05), 0.3);
  assert.equal(snapValue(0.1 + 0.2, 0, 1, 0.1), 0.3);
  assert.equal(snapValue(-3, -1, 1, 0.1), -1);
  assert.equal(snapValue(7, -1, 1, 0.1), 1);
  assert.equal(snapValue(-0.04, -1, 1, 0.1), 0, 'no negative zero on screen');
  assert.equal(snapValue(NaN, 2, 8, 1), 2);
  assert.equal(snapValue(5.6, 1, 16, 1), 6);
  assert.equal(toFraction(0, -1, 1), 0.5);
  assert.equal(toFraction(5, 0, 0), 0);
  assert.equal(toFraction(9, 0, 4), 1);
});

test('eclipse: moon phase path is empty when new, a half disc at the quarter, a full disc when full', () => {
  assert.equal(moonPhasePath(0, 12, 12, 8), '');
  assert.equal(moonPhasePath(0.5, 12, 12, 8), 'M12 4A8 8 0 0 1 12 20A0 8 0 0 1 12 4Z');
  assert.equal(moonPhasePath(1, 12, 12, 8), 'M12 4A8 8 0 0 1 12 20A8 8 0 0 1 12 4Z');
  assert.match(moonPhasePath(0.25, 12, 12, 8), /A4 8 0 0 0 12 4Z$/, 'crescent terminator bulges right');
  assert.equal(moonPhasePath(NaN, 12, 12, 8), '');
});

test('meander: covers the requested width at the requested height', () => {
  const d = meanderPath(100, 10);
  const xs = [...d.matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(Math.max(...xs.map(([x]) => x)) >= 100);
  assert.ok(xs.every(([, y]) => y >= 0 && y <= 10));
  assert.equal(meanderPath(0, 10), '');
  const fillet = meanderPath(200, 10, 4);
  assert.ok(fillet.endsWith('L200 10'), 'a few keys, then the baseline runs on to the full width');
  assert.equal((fillet.match(/L/g) ?? []).length, 4 * 10 + 1);
});

test('stack: push ignores a twin on top, keeps different params, pop stops at the root', () => {
  const root = [{ key: 'c', route: 'chat' }];
  const a = stackPush(root, { key: 'm1', route: 'models' });
  assert.equal(a.length, 2);
  assert.equal(stackPush(a, { key: 'm2', route: 'models' }), a, 'same route + params: same array back');
  assert.equal(stackPush(a, { key: 'm3', route: 'models', params: { tag: 'vision' } }).length, 3);
  assert.deepEqual(stackPop(a), root);
  assert.equal(stackPop(root), null);
});
