import { readFileSync, existsSync } from 'node:fs';

export function groundFile(filePath) {
  if (!existsSync(filePath)) {
    return { ok: false, error: `File not found: ${filePath}`, symbols: [] };
  }
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const symbols = new Set();

  for (const line of lines) {
    // Extract declared functions, classes, exports, consts
    const match = line.match(/(?:export\s+(?:default\s+)?(?:async\s+)?)?(?:function\*?|class|const|let|var)\s+([A-Za-z0-9_$]+)/);
    if (match && match[1]) symbols.add(match[1]);
  }

  return {
    ok: true,
    filePath,
    lineCount: lines.length,
    symbols: Array.from(symbols),
    content
  };
}
