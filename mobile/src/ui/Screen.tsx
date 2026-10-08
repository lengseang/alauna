import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hit, makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenProps {
  title: string;
  /** Shows the back arrow. Pushed screens always pass `goBack`. */
  onBack?: () => void;
  /** At most one or two small controls (a text Button, an IconButton). */
  right?: React.ReactNode;
  /** Pinned under the header, above the scroll (e.g. a SearchField + filter Tags). */
  toolbar?: React.ReactNode;
  /** Stars/sun behind the content (empty and onboarding states only). */
  ambient?: boolean;
  /** Wrap children in a padded ScrollView (16dp gutter, 16dp gap). Pass false for screens that own a list. */
  scroll?: boolean;
  children: React.ReactNode;
}

/**
 * Safe-area page: header (square back target, Cinzel title) + optional toolbar + content. When it mounts, screen-reader
 * focus moves to the title so a pushed screen announces itself.
 */
export function Screen({ title, onBack, right, toolbar, ambient, scroll = false, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  const titleRef = useRef<RNText>(null);
  useEffect(() => {
    const id = setTimeout(() => titleRef.current && AccessibilityInfo.sendAccessibilityEvent(titleRef.current, 'focus'), 350);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {ambient ? <Ambient /> : null}
      <View style={s.header}>
        {onBack ? <IconButton icon="back" label="Back" onPress={onBack} /> : null}
        <Text ref={titleRef} variant="heading" numberOfLines={1} style={[s.title, !onBack && s.titleLone]}>
          {title}
        </Text>
        {right}
      </View>
      {toolbar ? <View style={s.toolbar}>{toolbar}</View> : null}
      {scroll ? (
        <ScrollView style={s.fill} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={s.fill}>{children}</View>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: hit + space.sm, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xs, gap: space.xs },
  title: { flex: 1 },
  titleLone: { paddingLeft: space.md },
  toolbar: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md, borderBottomWidth: line, borderBottomColor: colors.border },
  fill: { flex: 1 },
  scroll: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
}));
