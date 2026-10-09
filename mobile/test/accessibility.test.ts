/**
 * Accessibility tests:
 * 1. Every <IconButton> across the UI has an explicit non-empty `label`.
 * 2. Touch targets meet or exceed 48dp minimums (WCAG / Android accessibility).
 * 3. Text scaling up to 1.3x produces compliant font sizes (>= 14sp) and preserves accessibility roles.
 * 4. Reduced motion flag is respected in theme and animations.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTheme } from '../src/theme/theme.ts';
import { hit, textScales } from '../src/theme/tokens.ts';

const root = join(fileURLToPath(import.meta.url), '../../src');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (f !== 'node_modules') walk(p, out);
    } else if (/\.(tsx|ts)$/.test(f)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Grep / scan for all <IconButton ...> usages in source files.
 * Returns a list of occurrences with file path, line number, and whether `label` was found.
 */
function findIconButtonUsages(src: string, filePath: string): Array<{ file: string; line: number; raw: string; hasLabel: boolean }> {
  const results: Array<{ file: string; line: number; raw: string; hasLabel: boolean }> = [];
  // Match <IconButton ... /> or <IconButton ... > ... </IconButton>
  const regex = /<IconButton\b([\s\S]*?)(?:\/>|>)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(src)) !== null) {
    const tagContent = match[1];
    // Exclude the component declaration in IconButton.tsx itself (e.g. export function IconButton(...))
    // match[0] starts with `<IconButton` which only appears in JSX call sites
    const offset = match.index;
    const lineNumber = src.slice(0, offset).split('\n').length;
    // Check if label is present as `label="..."` or `label={...}` with non-empty content
    const labelMatch = /\blabel\s*=\s*(?:\{([^}]+)\}|"([^"]+)"|'([^']+)')/.exec(tagContent);
    const hasLabel = !!labelMatch && (Boolean(labelMatch[1]?.trim()) || Boolean(labelMatch[2]?.trim()) || Boolean(labelMatch[3]?.trim()));

    results.push({
      file: filePath,
      line: lineNumber,
      raw: match[0],
      hasLabel,
    });
  }

  return results;
}

test('accessibility: every <IconButton> in mobile/src has an explicit label (never icon-only without voice)', () => {
  const allFiles = walk(root);
  const allUsages: Array<{ file: string; line: number; raw: string; hasLabel: boolean }> = [];

  for (const file of allFiles) {
    const content = readFileSync(file, 'utf8');
    const usages = findIconButtonUsages(content, file);
    allUsages.push(...usages);
  }

  assert.ok(allUsages.length > 0, 'at least one <IconButton> should be present in the codebase');

  const missing = allUsages.filter((u) => !u.hasLabel);
  assert.equal(
    missing.length,
    0,
    `Found <IconButton> usages missing 'label':\n${missing.map((m) => `  ${m.file}:${m.line} -> ${m.raw}`).join('\n')}`,
  );
});

test('accessibility: detector catches an <IconButton> when label is omitted', () => {
  const snippet = `
    export function BadComponent() {
      return (
        <View>
          <IconButton icon="close" onPress={onClose} />
        </View>
      );
    }
  `;
  const usages = findIconButtonUsages(snippet, 'test/BadComponent.tsx');
  assert.equal(usages.length, 1);
  assert.equal(usages[0].hasLabel, false);
});

test('accessibility: touch targets meet or exceed 48dp minimum', () => {
  // WCAG 2.5.5 / Android touch target guideline is 48x48dp.
  assert.equal(hit, 48, 'theme token hit must be 48dp');

  // Primitives verify hit usage
  const iconButtonSrc = readFileSync(join(root, 'ui/IconButton.tsx'), 'utf8');
  assert.match(iconButtonSrc, /width:\s*hit/);
  assert.match(iconButtonSrc, /height:\s*hit/);

  const buttonSrc = readFileSync(join(root, 'ui/Button.tsx'), 'utf8');
  assert.match(buttonSrc, /minHeight:\s*hit/);

  const switchSrc = readFileSync(join(root, 'ui/Switch.tsx'), 'utf8');
  assert.match(switchSrc, /minWidth:\s*hit/);
  assert.match(switchSrc, /minHeight:\s*hit/);

  const sliderSrc = readFileSync(join(root, 'ui/Slider.tsx'), 'utf8');
  assert.match(sliderSrc, /height:\s*hit/);

  const segmentedSrc = readFileSync(join(root, 'ui/Segmented.tsx'), 'utf8');
  assert.match(segmentedSrc, /minHeight:\s*hit/);
});

test('accessibility: text scale 1.3 produces >= 14sp across all font variants without clipping', () => {
  assert.ok(textScales.includes(1.3), 'textScales includes 1.3');

  const t10 = buildTheme('dark', {}, false, 1.0);
  const t13 = buildTheme('dark', {}, false, 1.3);

  for (const variant of ['small', 'body', 'strong', 'label', 'section', 'heading', 'title', 'display'] as const) {
    const s10 = t10.type[variant].fontSize ?? 0;
    const s13 = t13.type[variant].fontSize ?? 0;

    assert.ok(s13 >= 14, `${variant} fontSize ${s13} must be >= 14sp at text scale 1.3`);
    assert.ok(s13 >= s10, `${variant} fontSize ${s13} must be >= unscaled ${s10}`);
  }

  // Text.tsx maxFontSizeMultiplier
  const textSrc = readFileSync(join(root, 'ui/Text.tsx'), 'utf8');
  assert.match(textSrc, /maxFontSizeMultiplier=\{1\.6\}/);
});

test('accessibility: reduced motion flag is respected', () => {
  const regular = buildTheme('dark', {}, false);
  const reduced = buildTheme('dark', {}, true);

  assert.equal(regular.reduceMotion, false);
  assert.equal(reduced.reduceMotion, true);

  // Motion primitives check reduceMotion
  const motionSrc = readFileSync(join(root, 'ui/Motion.tsx'), 'utf8');
  assert.match(motionSrc, /reduceMotion/);
  assert.match(motionSrc, /if\s*\(!active\s*\|\|\s*reduceMotion\)/);

  const ambientSrc = readFileSync(join(root, 'ui/Ambient.tsx'), 'utf8');
  assert.match(ambientSrc, /if\s*\(reduceMotion\)\s*return/);
});
