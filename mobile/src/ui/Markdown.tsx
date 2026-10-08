import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { parseMarkdown, type Block, type Inline } from '../core/markdown.ts';
import { showToast } from '../services/toast.ts';
import { makeStyles, useTheme } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

const copyCode = async (code: string) => {
  await Clipboard.setStringAsync(code);
  showToast('Code copied');
};

function Inlines({ items, bold }: { items: Inline[]; bold?: boolean }) {
  const s = useStyles();
  const { type } = useTheme();
  return (
    <Text variant={bold ? 'strong' : 'body'}>
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
        <Text variant={block.level === 1 ? 'title' : 'strong'}>
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
          <View style={s.codeHead}>
            <Text variant="small">{block.lang || 'code'}</Text>
            {block.open ? null : <Button label="Copy" variant="text" accessibilityLabel={`Copy ${block.lang || 'code'}`} onPress={() => copyCode(block.code)} />}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text variant="small" tone="text" style={s.code}>
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

const useStyles = makeStyles(({ colors, space, line }) => ({
  root: { gap: space.md },
  fill: { flex: 1 },
  italic: { fontStyle: 'italic' },
  inlineCode: { fontFamily: 'monospace', backgroundColor: colors.surfaceAlt, color: colors.text },
  quote: { borderLeftWidth: 3, borderLeftColor: colors.borderStrong, paddingLeft: space.md },
  hr: { height: 1, backgroundColor: colors.border, marginVertical: space.xs },
  list: { gap: space.xs },
  li: { flexDirection: 'row', gap: space.sm },
  bullet: { width: space.xl },
  codeBox: { backgroundColor: colors.surface, borderLeftWidth: 2, borderLeftColor: colors.borderStrong, paddingHorizontal: space.md, paddingBottom: space.md, gap: space.xs },
  codeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, marginRight: -space.md, borderBottomWidth: line, borderBottomColor: colors.border },
  code: { fontFamily: 'monospace', lineHeight: 20 },
}));
