import React, { useState } from 'react';
import { File } from 'expo-file-system';
import { View } from 'react-native';
import appJson from '../../../app.json';
import { purgeAll, purgeChats, purgeKvCache, purgeMedia, purgeMemory } from '../../services/privacy.ts';
import { vaultRoot } from '../../services/storage.ts';
import { showToast } from '../../services/toast.ts';
import { makeStyles } from '../../theme';
import { Button } from '../Button';
import { confirm } from '../confirm';
import { Divider } from '../Divider';
import { ListRow } from '../Row';
import { SectionHeader } from '../SectionHeader';
import { Sheet } from '../Sheet';

export const APP_VERSION = (appJson as { expo: { version: string } }).expo.version;

/** The vault carries a .nomedia marker so gallery and cloud-photo apps skip it (written whenever a location is set up). null = cannot tell. */
export function galleryHidden(): boolean | null {
  try {
    return new File(vaultRoot(), '.nomedia').exists;
  } catch {
    return null;
  }
}

/** A settings section: roman-numeral title with the Greek-key fillet, then its rows. */
export function Group({ index, title, hint, right, children }: { index?: number; title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  const s = useStyles();
  return (
    <View style={s.group}>
      <SectionHeader index={index} title={title} hint={hint} right={right} />
      {children}
    </View>
  );
}

/** Rows on the page separated by hairlines. */
export function Rows({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View>
      {items.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <Divider /> : null}
          {c}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Telemetry: Stats side by side, divided by hairlines, wrapping on large text. */
export function StatRow({ children }: { children: React.ReactNode }) {
  const s = useStyles();
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={s.statRow}>
      {items.map((c, i) => (
        <View key={i} style={[s.stat, i > 0 && s.statSep]}>
          {c}
        </View>
      ))}
    </View>
  );
}

/** A row showing the current value; a tap opens a sheet of radio rows (no hidden cycling). */
export function ChoiceRow<T extends string | number | null>({
  title,
  subtitle,
  options,
  value,
  onChange,
  label,
  sheetHint,
  disabled,
}: {
  title: string;
  subtitle?: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: (v: T) => string;
  sheetHint?: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow title={title} subtitle={subtitle} value={label(value)} onPress={() => setOpen(true)} disabled={disabled} accessibilityLabel={`${title}, ${label(value)}`} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={title}>
        {sheetHint}
        {options.map((o) => (
          <ListRow
            key={String(o)}
            title={label(o)}
            selected={o === value}
            onPress={() => {
              onChange(o);
              setOpen(false);
            }}
          />
        ))}
      </Sheet>
    </>
  );
}

export type PurgeKind = 'chats' | 'memory' | 'kv' | 'media' | 'all';

const PURGES: Record<PurgeKind, { title: string; subtitle: string; confirmTitle: string; confirmText: string; run: () => Promise<string> }> = {
  chats: {
    title: 'Delete all chats',
    subtitle: 'Every saved chat, pinned ones too. Memory and models stay.',
    confirmTitle: 'Delete all chats?',
    confirmText: 'Every saved chat on this phone will be deleted. This cannot be undone.',
    run: async () => {
      const n = await purgeChats();
      return `${n} ${n === 1 ? 'chat' : 'chats'} deleted`;
    },
  },
  memory: {
    title: 'Forget everything I remember',
    subtitle: 'Wipes the memory facts. Chats stay.',
    confirmTitle: 'Forget all memory?',
    confirmText: 'Every remembered fact will be deleted. This cannot be undone.',
    run: async () => {
      const n = purgeMemory();
      return `${n} ${n === 1 ? 'fact' : 'facts'} forgotten`;
    },
  },
  kv: {
    title: 'Clear the KV cache',
    subtitle: 'Saved prompt prefixes. The next reply re-reads the persona once (a little slower).',
    confirmTitle: 'Clear the KV cache?',
    confirmText: 'Saved prompt prefixes are deleted. Nothing you wrote is lost.',
    run: async () => `${purgeKvCache()} cache files removed`,
  },
  media: {
    title: 'Delete attached photos and files',
    subtitle: 'Copies of images and documents you attached to chats.',
    confirmTitle: 'Delete attachments?',
    confirmText: 'Photos and files kept for your chats are deleted. The chats keep their text.',
    run: async () => `${purgeMedia()} files removed`,
  },
  all: {
    title: 'Erase chats, memory, cache and attachments',
    subtitle: 'Everything except downloaded models and your settings.',
    confirmTitle: 'Erase everything?',
    confirmText: 'All chats, memory, cached prompts and attachments will be deleted. Models and settings stay. This cannot be undone.',
    run: async () => {
      const r = await purgeAll();
      return `Erased ${r.chats} chats, ${r.memory} facts, ${r.kvCache} cache files, ${r.media} attachments`;
    },
  },
};

/** Destructive data actions, each behind a confirmation and ending in an honest count. */
export function PurgeActions({ kinds, onDone }: { kinds: PurgeKind[]; onDone?: () => void }) {
  return (
    <Rows>
      {kinds.map((k) => (
        <ListRow
          key={k}
          title={PURGES[k].title}
          subtitle={PURGES[k].subtitle}
          destructive
          onPress={async () => {
            const p = PURGES[k];
            if (!(await confirm(p.confirmTitle, p.confirmText, 'Delete', true))) return;
            try {
              showToast(await p.run());
            } catch (e) {
              showToast(e instanceof Error ? e.message : String(e));
            }
            onDone?.();
          }}
        />
      ))}
    </Rows>
  );
}

/** A quiet "Reset" text button for a section. */
export function ResetButton({ onPress, label = 'Reset' }: { onPress: () => void; label?: string }) {
  return <Button label={label} variant="text" onPress={onPress} />;
}

const useStyles = makeStyles(({ colors, line, space }) => ({
  group: { gap: space.sm },
  statRow: { flexDirection: 'row', flexWrap: 'wrap' },
  stat: { flexGrow: 1, flexBasis: 96, paddingVertical: space.sm, paddingHorizontal: space.sm },
  statSep: { borderLeftWidth: line, borderLeftColor: colors.border },
}));
