import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hit, makeStyles } from '../theme';
import { Ambient } from './Ambient';
import { IconButton } from './IconButton';
import { Text } from './Text';

export interface ScreenProps {
  title: string;
  /** Shows the back arrow. Pushed screens always pass `goBack`. */
  onBack?: () => void;
  /** At most one small control (e.g. a text Button). */
  right?: React.ReactNode;
  /** Stars/sun behind the content (empty and onboarding states only). */
  ambient?: boolean;
  /** Wrap children in a padded ScrollView (16dp gutter, 16dp gap). Pass false for screens that own a list. */
  scroll?: boolean;
  children: React.ReactNode;
}

/** Safe-area aware page: header (back, title) + content. The status bar and gesture bar are handled here. */
export function Screen({ title, onBack, right, ambient, scroll = false, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const s = useStyles();
  return (
    <View style={[s.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {ambient ? <Ambient /> : null}
      <View style={s.header}>
        {onBack ? <IconButton icon="back" label="Back" onPress={onBack} /> : null}
        <Text variant="title" numberOfLines={1} style={[s.title, !onBack && s.titleLone]}>
          {title}
        </Text>
        {right}
      </View>
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

const useStyles = makeStyles(({ colors, space }) => ({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: hit + space.sm, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, gap: space.xs },
  title: { flex: 1 },
  titleLone: { paddingLeft: space.sm },
  fill: { flex: 1 },
  scroll: { padding: space.lg, paddingBottom: space.xxl, gap: space.lg },
}));
