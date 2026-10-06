import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { parseMarkdown, type Block, type Inline } from '../core/markdown.ts';
import { colors, font, mono, radius } from './theme';

function Inlines({ items, base }: { items: Inline[]; base?: object }) {
  return (
    <Text style={[styles.text, base]}>
      {items.map((it, i) => {
        if (it.kind === 'bold') return <Text key={i} style={styles.bold}>{it.text}</Text>;
        if (it.kind === 'italic') return <Text key={i} style={styles.italic}>{it.text}</Text>;
        if (it.kind === 'code') return <Text key={i} style={styles.inlineCode}>{it.text}</Text>;
        return <Text key={i}>{it.text}</Text>;
      })}
    </Text>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return <Inlines items={block.inlines} />;
    case 'h':
      return <Inlines items={block.inlines} base={block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3} />;
    case 'quote':
      return (
        <View style={styles.quote}>
          <Inlines items={block.inlines} base={{ color: colors.muted }} />
        </View>
      );
    case 'hr':
      return <View style={styles.hr} />;
    case 'list':
      return (
        <View style={{ gap: 4 }}>
          {block.items.map((item, i) => (
            <View key={i} style={styles.li}>
              <Text style={[styles.text, styles.bullet]}>{block.ordered ? `${i + 1}.` : '•'}</Text>
              <View style={{ flex: 1 }}>
                <Inlines items={item} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'code':
      return (
        <View style={styles.codeBox}>
          {block.lang ? <Text style={styles.codeLang}>{block.lang}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={styles.code}>{block.code}{block.open ? ' ▍' : ''}</Text>
          </ScrollView>
        </View>
      );
  }
}

/** Renders model output as clean, readable text (CH-3). Safe to call with half-streamed text. */
export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View style={{ gap: 10 }}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.text, fontSize: 15, lineHeight: 23 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: mono, backgroundColor: colors.surface3, color: colors.accent, fontSize: 13.5 },
  h1: { fontSize: font.xl, fontWeight: '700', lineHeight: 28 },
  h2: { fontSize: font.lg + 1, fontWeight: '700', lineHeight: 26 },
  h3: { fontSize: font.lg, fontWeight: '700' },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: 10 },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  li: { flexDirection: 'row', gap: 8 },
  bullet: { width: 18, color: colors.muted },
  codeBox: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12 },
  codeLang: { color: colors.faint, fontSize: font.xs, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 },
  code: { color: colors.text, fontFamily: mono, fontSize: 13, lineHeight: 19 },
});
