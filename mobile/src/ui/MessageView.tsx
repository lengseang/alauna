import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import type { ChatMessage } from '../core/chatTypes.ts';
import { getModel } from '../core/catalog.ts';
import { AlertIcon, CopyIcon, DocumentIcon, InfoIcon, RefreshIcon } from '../components/Icons';
import { Btn } from './Btn';
import { Markdown } from './Markdown';
import { ProcessPanel } from './ProcessPanel';
import { colors, font, radius } from './theme';

interface Props {
  message: ChatMessage;
  /** Only the newest assistant message offers Retry. */
  isLast: boolean;
  loadProgress: number;
  busy: boolean;
  onRetry: () => void | Promise<unknown>;
  onOpenModels: () => void;
  onCopied: (text: string) => void;
}

function needsModelAction(error: string): boolean {
  return /download|not downloaded|no model|storage folder|model hub|damaged|incomplete|could not read|too heavy|not available in this build|memory/i.test(error);
}

export const MessageView = React.memo(MessageViewImpl);
function MessageViewImpl({ message: m, isLast, loadProgress, busy, onRetry, onOpenModels, onCopied }: Props) {
  if (m.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          {m.attachments?.map((a) => (
            <View key={a.name} style={styles.fileChip}>
              <DocumentIcon size={13} color={colors.accent} />
              <Text style={styles.fileName} numberOfLines={1}>{a.name}{a.truncated ? ' (shortened)' : ''}</Text>
            </View>
          ))}
          {m.text ? <Text selectable style={styles.userText}>{m.text}</Text> : null}
        </View>
      </View>
    );
  }

  const modelName = getModel(m.stats?.modelId)?.name ?? 'the model';
  const finished = m.status !== 'streaming';
  const showPanel = m.status === 'streaming' || !!m.stats;
  const copy = async () => {
    await Clipboard.setStringAsync(m.text);
    onCopied('Answer copied');
  };

  return (
    <View style={styles.aiRow}>
      <View style={styles.aiHeader}>
        <View style={styles.dot} />
        <Text style={styles.aiName}>CHIWIWI</Text>
      </View>

      {showPanel ? <ProcessPanel message={m} modelName={modelName} loadProgress={loadProgress} /> : null}

      {m.text ? <Markdown text={m.text} /> : null}

      {m.status === 'stopped' ? (
        <View style={styles.inline}>
          <InfoIcon size={13} color={colors.muted} />
          <Text style={styles.inlineText}>Stopped{m.text ? '' : ' before any answer'}.</Text>
        </View>
      ) : null}

      {m.notice ? (
        <View style={[styles.banner, { backgroundColor: colors.warnSoft }]}>
          <AlertIcon size={14} />
          <Text style={[styles.bannerText, { color: colors.warn }]}>{m.notice}</Text>
        </View>
      ) : null}

      {m.status === 'error' && m.error ? (
        <View style={[styles.banner, { backgroundColor: colors.badSoft, flexDirection: 'column', alignItems: 'flex-start' }]}>
          <View style={styles.inline}>
            <AlertIcon size={14} color={colors.bad} />
            <Text style={[styles.bannerText, { color: colors.bad }]}>{m.error}</Text>
          </View>
          <View style={styles.actions}>
            {isLast ? <Btn small label="Try again" variant="secondary" icon={<RefreshIcon size={13} color={colors.text} />} onPress={onRetry} disabled={busy} /> : null}
            {needsModelAction(m.error) ? <Btn small label="Open Model Hub" variant="secondary" onPress={onOpenModels} /> : null}
          </View>
        </View>
      ) : null}

      {finished && m.text && m.status !== 'error' ? (
        <View style={styles.footer}>
          <Btn small variant="ghost" label="Copy" icon={<CopyIcon size={13} />} onPress={copy} />
          {isLast ? <Btn small variant="ghost" label="Retry" icon={<RefreshIcon size={13} />} onPress={onRetry} disabled={busy} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  userRow: { alignItems: 'flex-end', marginVertical: 6 },
  userBubble: { maxWidth: '86%', backgroundColor: colors.surface3, borderRadius: radius.lg, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14, gap: 6 },
  userText: { color: colors.text, fontSize: 15, lineHeight: 22 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.accentSoft, borderRadius: radius.sm, paddingVertical: 4, paddingHorizontal: 8, alignSelf: 'flex-start' },
  fileName: { color: colors.accent, fontSize: font.sm, maxWidth: 200 },
  aiRow: { marginVertical: 10, gap: 4 },
  aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.white },
  aiName: { color: colors.text, fontSize: font.sm, fontWeight: '700', letterSpacing: 1 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  inlineText: { color: colors.muted, fontSize: font.sm },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: radius.md, padding: 10, marginTop: 6 },
  bannerText: { fontSize: font.sm, lineHeight: 18, flex: 1 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  footer: { flexDirection: 'row', gap: 4, marginTop: 4, marginLeft: -8 },
});
