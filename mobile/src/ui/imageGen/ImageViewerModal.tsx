import React from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import type { ImageAssetMetadata } from '../../core/imageGen/types.ts';
import { formatBytes } from '../../core/format.ts';
import { downloadImageToDevice, shareImage } from '../../services/imageGallery.ts';
import { showToast } from '../../services/toast.ts';
import { makeStyles, useTheme } from '../../theme';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { Tag } from '../Tag';
import { Text } from '../Text';

export interface ImageViewerModalProps {
  image: ImageAssetMetadata | null;
  visible: boolean;
  onClose: () => void;
}

export function ImageViewerModal({ image, visible, onClose }: ImageViewerModalProps) {
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  if (!image) return null;

  const handleCopyPrompt = async () => {
    if (!image.prompt) return;
    await Clipboard.setStringAsync(image.prompt);
    showToast('Prompt copied to clipboard!');
  };

  const handleDownload = async () => {
    await downloadImageToDevice(image);
  };

  const handleShare = async () => {
    await shareImage(image);
  };

  const aspectRatio =
    image.width > 0 && image.height > 0 ? image.width / image.height : 1;

  const dateStr = new Date(image.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
      transparent
      statusBarTranslucent
    >
      <View style={[s.backdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Top Header Controls */}
        <View style={s.header}>
          <View style={s.headerInfo}>
            <Text variant="strong" numberOfLines={1} style={s.headerTitle}>
              {image.modelId || 'Synthesized Image'}
            </Text>
            <View style={s.tagRow}>
              <Tag label={`${image.width}×${image.height}`} tone="accent" />
              <Tag label={image.format.toUpperCase()} tone="default" />
              <Tag label={formatBytes(image.fileSizeBytes)} tone="default" />
            </View>
          </View>
          <IconButton icon="close" label="Close viewer" onPress={onClose} />
        </View>

        {/* Central Full-Aspect Image Canvas */}
        <View style={s.imageViewport}>
          <Image
            source={{ uri: image.absolutePath }}
            style={[s.imageCanvas, { aspectRatio }]}
            resizeMode="contain"
            accessibilityLabel={image.prompt || 'Synthesized image output'}
          />
        </View>

        {/* Bottom Details & Actions Sheet */}
        <View style={s.bottomPanel}>
          <ScrollView
            style={s.promptScroll}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <Pressable onPress={handleCopyPrompt}>
              <Text variant="small" tone="muted" style={s.promptLabel}>
                PROMPT (TAP TO COPY)
              </Text>
              <Text variant="body" style={s.promptText}>
                {image.prompt || '(No prompt text recorded)'}
              </Text>
            </Pressable>
            <Text variant="small" tone="muted" style={s.metaText}>
              Generated: {dateStr} · Quality: {image.qualityMode}
            </Text>
          </ScrollView>

          <View style={s.actionRow}>
            <Button
              label="Save to Device"
              variant="primary"
              onPress={handleDownload}
            />
            <Button label="Share" variant="quiet" onPress={handleShare} />
            <Button label="Copy Prompt" variant="quiet" onPress={handleCopyPrompt} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles(({ colors, space, line }) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: line,
    borderBottomColor: colors.border,
  },
  headerInfo: {
    flex: 1,
    marginRight: space.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 15,
  },
  tagRow: {
    flexDirection: 'row',
    gap: space.xs,
    marginTop: space.xs,
  },
  imageViewport: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  imageCanvas: {
    width: '100%',
    maxHeight: '100%',
  },
  bottomPanel: {
    backgroundColor: colors.surface,
    borderTopWidth: line,
    borderTopColor: colors.border,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.md,
    maxHeight: 220,
  },
  promptScroll: {
    maxHeight: 110,
    marginBottom: space.sm,
  },
  promptLabel: {
    letterSpacing: 1,
    fontSize: 10,
    marginBottom: 2,
  },
  promptText: {
    color: colors.text,
    lineHeight: 20,
    fontSize: 13,
  },
  metaText: {
    marginTop: space.xs,
    fontSize: 11,
  },
  actionRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
}));
