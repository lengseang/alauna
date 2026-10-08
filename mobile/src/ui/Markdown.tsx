import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { parseMarkdown, type Block, type Inline } from '../core/markdown.ts';
import { makeStyles, useTheme } from '../theme';
import { Text } from './Text';

function Inlines({ items, bold }: { items: Inline[]; bold?: boolean }) {
  const s = useStyles();
  const { type } = useTheme();
  return (
    <Text variant={bold ? 'strong' : 'body'} selectable>
      {items.map((it, i) => {
        if (it.kind === 'bold')
          return (
            <Text key={i} variant="strong">
              {it.text}
            </Text>
          );
        if (it.kind === 'italic')
          return (
            <Text key={i} style={s.italic}>
              {it.text}
            </Text>
          );
        if (it.kind === 'code')
          return (
            <Text key={i} style={[s.inlineCode, { fontSize: type.small.fontSize }]}>
              {it.text}
            </Text>
          );
        return it.text;
      })}
    </Text>
  );
}

function BlockView({ block }: { block: Block }) {
  const s = useStyles();
  switch (block.kind) {
    case 'p':
      return <Inlines items={block.inlines} />;
    case 'h':
      return (
        <Text variant={block.level === 1 ? 'title' : 'strong'} selectable>
          {block.inlines.map((i) => i.text).join('')}
        </Text>
      );
    case 'quote':
      return (
        <View style={s.quote}>
          <Inlines items={block.inlines} />
        </View>
      );
    case 'hr':
      return <View style={s.hr} />;
    case 'list':
      return (
        <View style={s.list}>
          {block.items.map((item, i) => (
            <View key={i} style={s.li}>
              <Text tone="muted" style={s.bullet}>
                {block.ordered ? `${i + 1}.` : '•'}
              </Text>
              <View style={s.fill}>
                <Inlines items={item} />
              </View>
            </View>
          ))}
        </View>
      );
    case 'code':
      return (
        <View style={s.codeBox}>
          {block.lang ? <Text variant="small">{block.lang}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text variant="small" tone="text" selectable style={s.code}>
              {block.code}
              {block.open ? ' ▍' : ''}
            </Text>
          </ScrollView>
        </View>
      );
  }
}

/**
 * Model output as plain flowing text on the page (no bubble). Safe with half-streamed text.
 * Memoised on `text`, so only the streaming row re-parses.
 */
export const Markdown = React.memo(function Markdown({ text }: { text: string }) {
  const s = useStyles();
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return (
    <View style={s.root}>
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </View>
  );
});

const useStyles = makeStyles(({ colors, space, radius }) => ({
  root: { gap: space.md },
  fill: { flex: 1 },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: 'monospace', backgroundColor: colors.surfaceAlt, color: colors.text },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: space.md },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  list: { gap: space.xs },
  li: { flexDirection: 'row', gap: space.sm },
  bullet: { width: space.xl },
  codeBox: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.xs },
  code: { fontFamily: 'monospace', lineHeight: 20 },
}));
