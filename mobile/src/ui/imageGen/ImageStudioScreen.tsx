import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import type {
  AspectRatio,
  GenerationGoal,
  GenerationRequest,
  ImageModelManifest,
  QualityMode,
} from '../../core/imageGen/types.ts';
import { IMAGE_MODEL_MANIFESTS } from '../../core/imageGen/modelRegistry.ts';
import {
  deleteGalleryImage,
  downloadImageToDevice,
  initGallery,
  shareImage,
  useGallery,
} from '../../services/imageGallery.ts';
import {
  deleteImageModel,
  cancelImageModelDownload,
  refreshImageModelStatuses,
  startImageModelDownload,
  useImageModelStates,
} from '../../services/imageModelManager.ts';
import { useImageService } from '../../services/imageService.ts';
import { isNativeDiffusionEngineAvailable } from '../../services/imageRuntime.ts';
import { showToast } from '../../services/toast.ts';
import { formatBytes, formatSpeed } from '../../core/format.ts';
import { Button } from '../Button';
import { Card } from '../Card';
import { Divider } from '../Divider';
import { Icon } from '../Icon';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ProgressBar } from '../ProgressBar';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Tag } from '../Tag';
import { Text } from '../Text';

type StudioTab = 'generate' | 'configure' | 'models' | 'gallery';

const GOALS: readonly { id: GenerationGoal; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'character', label: 'Character' },
  { id: 'landscape', label: 'Landscape' },
  { id: 'illustration', label: 'Illustration' },
  { id: 'product', label: 'Product' },
  { id: 'abstract', label: 'Abstract' },
];

const ASPECT_RATIOS: readonly { value: AspectRatio; label: string }[] = [
  { value: '1:1', label: '1:1 Square' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:3', label: '4:3 Landscape' },
  { value: '9:16', label: '9:16 Story' },
  { value: '16:9', label: '16:9 Cinema' },
];

const PROMPT_SUGGESTIONS = [
  'Cinematic portrait, golden hour rim lighting, 85mm lens, candid expression',
  'Cyberpunk neon street at rainy midnight, reflective puddles, high detail',
  'Anime fantasy elven warrior, celestial armor, starry night sky background',
  'Candid smartphone photograph, natural sunlight, warm depth of field',
];

export function ImageStudioScreen() {
  const s = useStyles();
  const { colors } = useTheme();

  // Primary Tab Navigation
  const [tab, setTab] = useState<StudioTab>('generate');

  // Background Image Service State
  const { isGenerating, activeJob, elapsedSeconds, latestGeneratedImageId, startGeneration, cancelGeneration } =
    useImageService();

  // Downloads & Model States
  const modelStates = useImageModelStates();
  const gallery = useGallery();

  // Inputs & Generation Preferences
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [goal, setGoal] = useState<GenerationGoal>('general');
  const [qualityMode, setQualityMode] = useState<QualityMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [selectedModelId, setSelectedModelId] = useState<string>(
    IMAGE_MODEL_MANIFESTS.find((m) => m.modelId === 'realvisxl-v5-q4')?.modelId ??
      IMAGE_MODEL_MANIFESTS[0].modelId,
  );
  const [seedInput, setSeedInput] = useState<string>('');
  const [modelFilter, setModelFilter] = useState<'all' | 'uncensored' | 'fast' | 'installed'>('all');

  // Initialize storage index and model status check on mount
  useEffect(() => {
    void initGallery();
    refreshImageModelStatuses();
  }, []);

  const selectedManifest =
    IMAGE_MODEL_MANIFESTS.find((m) => m.modelId === selectedModelId) ?? IMAGE_MODEL_MANIFESTS[0];
  const selectedModelState = modelStates[selectedModelId];
  const isSelectedModelInstalled = selectedModelState?.status === 'installed';

  // Count installed models
  const installedCount = useMemo(() => {
    return IMAGE_MODEL_MANIFESTS.filter((m) => modelStates[m.modelId]?.status === 'installed').length;
  }, [modelStates]);

  // Latest generated image item in gallery
  const latestImage = useMemo(() => {
    if (latestGeneratedImageId) {
      const found = gallery.find((g) => g.imageId === latestGeneratedImageId);
      if (found) return found;
    }
    return gallery[0] ?? null;
  }, [gallery, latestGeneratedImageId]);

  // Filtered models for Models tab
  const filteredModels = useMemo(() => {
    return IMAGE_MODEL_MANIFESTS.filter((m) => {
      if (modelFilter === 'installed') {
        return modelStates[m.modelId]?.status === 'installed';
      }
      if (modelFilter === 'uncensored') {
        return m.contentPolicy === 'uncensored' || m.contentPolicy === 'heretic';
      }
      if (modelFilter === 'fast') {
        return m.downloadSizeBytes <= 2_000_000_000;
      }
      return true;
    });
  }, [modelFilter, modelStates]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('Please enter an image prompt first.');
      return;
    }

    if (!isSelectedModelInstalled) {
      showToast('Selected model is not downloaded. Go to Models tab to install it.');
      setTab('models');
      return;
    }

    if (!isNativeDiffusionEngineAvailable()) {
      showToast('Native diffusion engine (stable-diffusion.cpp) is required to run on device. Weights are preserved in Vault.', 4000);
      return;
    }

    const parsedSeed = seedInput.trim() ? parseInt(seedInput.trim(), 10) : undefined;
    const request: GenerationRequest = {
      requestVersion: 1,
      prompt: prompt.trim(),
      negativePrompt: negativePrompt.trim() || undefined,
      goal,
      qualityMode,
      modelId: selectedModelId,
      aspectRatio,
      seed: Number.isFinite(parsedSeed) ? parsedSeed : undefined,
      refinementPolicy: qualityMode === 'fast' ? 'never' : 'if-beneficial',
    };

    const deviceState = {
      totalRamBytes: 12 * 1024 * 1024 * 1024,
      thermalState: 'nominal' as const,
    };

    await startGeneration(request, deviceState);
  };

  const handleDownloadModel = (manifest: ImageModelManifest) => {
    startImageModelDownload(manifest.modelId);
  };

  const handleDeleteModel = async (manifest: ImageModelManifest) => {
    await deleteImageModel(manifest.modelId);
  };

  const handleSaveToDevice = async (item: typeof latestImage) => {
    if (!item) return;
    await downloadImageToDevice(item);
  };

  const handleShare = async (item: typeof latestImage) => {
    if (!item) return;
    await shareImage(item);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const sRem = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${sRem.toString().padStart(2, '0')}`;
  };

  return (
    <Screen title="Image Studio" onBack={goBack} scroll>
      {/* Top Segmented Navigation Tabs */}
      <View style={s.tabBarContainer}>
        <Segmented
          label="Image Studio Sections"
          options={[
            { value: 'generate', label: 'Studio' },
            { value: 'configure', label: 'Config' },
            { value: 'models', label: `Models (${installedCount})` },
            { value: 'gallery', label: `Gallery (${gallery.length})` },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {/* ========================================================================= */}
      {/* TAB 1: GENERATE (STUDIO)                                                 */}
      {/* ========================================================================= */}
      {tab === 'generate' && (
        <View style={s.tabContent}>
          {/* Active Model Indicator Banner */}
          <Card style={s.modelBanner}>
            <View style={s.modelBannerHeader}>
              <View style={s.modelBannerTitleContainer}>
                <Text variant="strong" numberOfLines={1} style={s.modelBannerTitle}>
                  {selectedManifest.displayName}
                </Text>
              </View>
              <Button
                label="Change"
                variant="quiet"
                onPress={() => setTab('models')}
                accessibilityLabel="Switch active image model"
              />
            </View>

            <View style={s.modelBannerBadgeRow}>
              {selectedManifest.contentPolicy === 'uncensored' || selectedManifest.contentPolicy === 'heretic' ? (
                <Tag label="UNCENSORED" selected tone="accent" />
              ) : (
                <Tag label="STANDARD" />
              )}
              <Tag label={selectedManifest.modelFamily.toUpperCase()} />
              <Tag label={selectedManifest.precision.toUpperCase()} />
            </View>

            <View style={s.modelBannerSub}>
              <Text variant="small" tone={isSelectedModelInstalled ? undefined : 'accent'}>
                {isSelectedModelInstalled
                  ? `Installed · ${(selectedManifest.downloadSizeBytes / 1e9).toFixed(2)} GB on vault`
                  : 'Weights not installed (tap to download)'}
              </Text>
              <Text variant="small" tone="muted">
                Aspect ratio: {aspectRatio}
              </Text>
            </View>
          </Card>

          {/* Prompt Entry Box */}
          <View style={s.section}>
            <Text variant="label">PROMPT</Text>
            <Card style={s.card}>
              <TextInput
                multiline
                numberOfLines={3}
                placeholder="Describe the image you want to imagine..."
                placeholderTextColor={colors.muted}
                value={prompt}
                onChangeText={setPrompt}
                style={[s.input, { color: colors.text, borderColor: colors.border }]}
                editable={!isGenerating}
              />
            </Card>

            {/* Prompt Inspiration Suggestions */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.suggestionScroll}
            >
              {PROMPT_SUGGESTIONS.map((sug, i) => (
                <Pressable
                  key={i}
                  style={[s.suggestionChip, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}
                  onPress={() => setPrompt(sug)}
                >
                  <Text variant="small" tone="muted" numberOfLines={1}>
                    💡 {sug}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Generate Button Action */}
          <View style={s.actionSection}>
            <Button
              label={
                isGenerating
                  ? `Generating (${formatTimer(elapsedSeconds)})...`
                  : !isSelectedModelInstalled
                  ? 'Download Model to Generate'
                  : !isNativeDiffusionEngineAvailable()
                  ? 'Awaiting Native Diffusion Bridge'
                  : 'Imagine / Generate Image'
              }
              variant={!isNativeDiffusionEngineAvailable() && isSelectedModelInstalled ? 'quiet' : 'primary'}
              onPress={
                !isSelectedModelInstalled
                  ? () => handleDownloadModel(selectedManifest)
                  : handleGenerate
              }
              disabled={isGenerating || (!prompt.trim() && isSelectedModelInstalled && isNativeDiffusionEngineAvailable())}
            />

            {!isNativeDiffusionEngineAvailable() && isSelectedModelInstalled && (
              <View style={{ marginTop: 10 }}>
                <Notice tone="quiet" title="Native Diffusion Engine Status">
                  {`Model weights for ${selectedManifest.displayName} are downloaded in your Vault. On-device execution requires the native stable-diffusion.cpp runtime bridge.`}
                </Notice>
              </View>
            )}
          </View>

          {/* Real-time Inference Progress & Background Execution Status */}
          {activeJob && (isGenerating || activeJob.status === 'failed') && (
            <View style={s.section}>
              <Text variant="label">INFERENCE STATUS</Text>
              <Card style={s.card}>
                <View style={s.progressHeader}>
                  <Text variant="body" style={s.bold}>
                    {activeJob.status.toUpperCase().replace('_', ' ')}
                  </Text>
                  <Text variant="small" tone="accent">
                    ⏱ {formatTimer(elapsedSeconds)}
                  </Text>
                </View>

                {activeJob.currentStageDescription ? (
                  <Text variant="small" tone="muted">
                    {activeJob.currentStageDescription}
                  </Text>
                ) : null}

                {activeJob.progressPercent !== undefined ? (
                  <View style={{ marginTop: 8 }}>
                    <ProgressBar fraction={activeJob.progressPercent / 100} />
                  </View>
                ) : null}

                {isGenerating ? (
                  <View style={{ marginTop: 12 }}>
                    <Button label="Cancel Generation" variant="danger" onPress={cancelGeneration} />
                  </View>
                ) : null}

                {activeJob.status === 'failed' && (
                  <View style={{ marginTop: 8 }}>
                    <Notice tone="danger" title={activeJob.errorCode ?? 'Inference Error'}>
                      {activeJob.errorMessage ?? 'Generation failed. Check device memory and thermal state.'}
                    </Notice>
                  </View>
                )}
              </Card>
            </View>
          )}

          {/* Latest Generated Output with Immediate Download & Share */}
          {latestImage && (
            <View style={s.section}>
              <View style={s.headerRow}>
                <Text variant="label">LATEST SYNTHESIZED IMAGE</Text>
                <Tag label="IN VAULT" tone="accent" />
              </View>

              <Card style={s.galleryCard}>
                <Image source={{ uri: latestImage.absolutePath }} style={s.previewImage} resizeMode="cover" />
                <View style={s.galleryInfo}>
                  <Text variant="strong" numberOfLines={2}>
                    {latestImage.prompt}
                  </Text>
                  <Text variant="small" tone="muted">
                    {latestImage.width}x{latestImage.height} · {latestImage.format.toUpperCase()} ·{' '}
                    {latestImage.qualityMode} · {formatBytes(latestImage.fileSizeBytes)}
                  </Text>

                  <View style={s.resultActions}>
                    <Button
                      label="Download to Device"
                      variant="primary"
                      onPress={() => handleSaveToDevice(latestImage)}
                    />
                    <Button label="Share" variant="quiet" onPress={() => handleShare(latestImage)} />
                    <Button label="View in Gallery" variant="quiet" onPress={() => setTab('gallery')} />
                  </View>
                </View>
              </Card>
            </View>
          )}
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CONFIGURE (SETTINGS)                                              */}
      {/* ========================================================================= */}
      {tab === 'configure' && (
        <View style={s.tabContent}>
          <Text tone="muted">
            Customize generation policies, aspect ratios, negative prompts, and sampling seeds.
          </Text>

          {/* Composition Goal Presets */}
          <View style={s.section}>
            <Text variant="label">COMPOSITION GOAL</Text>
            <View style={s.chipsRow}>
              {GOALS.map((g) => (
                <Tag
                  key={g.id}
                  label={g.label}
                  selected={goal === g.id}
                  onPress={() => !isGenerating && setGoal(g.id)}
                />
              ))}
            </View>
          </View>

          {/* Aspect Ratio */}
          <View style={s.section}>
            <Text variant="label">ASPECT RATIO</Text>
            <Segmented
              label="Aspect Ratio"
              options={ASPECT_RATIOS}
              value={aspectRatio}
              onChange={(v) => !isGenerating && setAspectRatio(v)}
              disabled={isGenerating}
            />
          </View>

          {/* Quality Mode */}
          <View style={s.section}>
            <Text variant="label">QUALITY & SPEED PROFILE</Text>
            <Segmented
              label="Quality Mode"
              options={[
                { value: 'fast', label: 'Fast Draft' },
                { value: 'balanced', label: 'Balanced' },
                { value: 'quality', label: 'Quality' },
                { value: 'adaptive', label: 'Adaptive' },
              ]}
              value={qualityMode}
              onChange={(v) => !isGenerating && setQualityMode(v)}
              disabled={isGenerating}
            />
          </View>

          {/* Negative Prompt */}
          <View style={s.section}>
            <Text variant="label">NEGATIVE PROMPT (OPTIONAL)</Text>
            <Card style={s.card}>
              <TextInput
                multiline
                numberOfLines={2}
                placeholder="What to exclude (e.g. blurry, deformed, low quality, watermarks)..."
                placeholderTextColor={colors.muted}
                value={negativePrompt}
                onChangeText={setNegativePrompt}
                style={[s.inputSmall, { color: colors.text, borderColor: colors.border }]}
                editable={!isGenerating}
              />
            </Card>
          </View>

          {/* Seed Control */}
          <View style={s.section}>
            <Text variant="label">SAMPLING SEED</Text>
            <Card style={s.card}>
              <View style={s.seedRow}>
                <TextInput
                  placeholder="Random (leave blank for random seed)"
                  placeholderTextColor={colors.muted}
                  value={seedInput}
                  onChangeText={setSeedInput}
                  keyboardType="numeric"
                  style={[s.inputSingle, { color: colors.text, borderColor: colors.border, flex: 1 }]}
                  editable={!isGenerating}
                />
                <Button
                  label="Randomize"
                  variant="quiet"
                  onPress={() => setSeedInput(Math.floor(Math.random() * 1000000).toString())}
                />
              </View>
            </Card>
          </View>

          <View style={s.section}>
            <Notice tone="info" title="Hardware Acceleration">
              Inference runs directly on your device utilizing Snapdragon / Neural hardware acceleration.
              Zero network transmissions are made.
            </Notice>
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: MODELS (VAULT & INSTALLER)                                        */}
      {/* ========================================================================= */}
      {tab === 'models' && (
        <View style={s.tabContent}>
          <Text tone="muted">
            Verified local diffusion weights. Download directly from Hugging Face into your app vault.
          </Text>

          {/* Model Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipsRow}>
            <Tag
              label={`All (${IMAGE_MODEL_MANIFESTS.length})`}
              selected={modelFilter === 'all'}
              onPress={() => setModelFilter('all')}
            />
            <Tag
              label="Uncensored"
              selected={modelFilter === 'uncensored'}
              tone="accent"
              onPress={() => setModelFilter('uncensored')}
            />
            <Tag
              label="Fast (≤2GB)"
              selected={modelFilter === 'fast'}
              onPress={() => setModelFilter('fast')}
            />
            <Tag
              label={`Installed (${installedCount})`}
              selected={modelFilter === 'installed'}
              onPress={() => setModelFilter('installed')}
            />
          </ScrollView>

          {/* Model Cards List */}
          <View style={s.modelList}>
            {filteredModels.map((manifest) => {
              const state = modelStates[manifest.modelId];
              const isInstalled = state?.status === 'installed';
              const isDownloading = state?.status === 'downloading';
              const isSelected = selectedModelId === manifest.modelId;
              const isUncensored = manifest.contentPolicy === 'uncensored' || manifest.contentPolicy === 'heretic';

              return (
                <Card key={manifest.modelId} style={s.modelItemCard}>
                  {/* Model Header */}
                  <View style={s.modelHeader}>
                    <View style={{ flex: 1 }}>
                      <Text variant="strong" numberOfLines={1}>
                        {manifest.displayName}
                      </Text>
                      <Text variant="small" tone="muted">
                        {manifest.modelFamily.toUpperCase()} · {manifest.precision.toUpperCase()} ·{' '}
                        {formatBytes(manifest.downloadSizeBytes)}
                      </Text>
                    </View>

                    <View style={s.modelBadgeRow}>
                      {isUncensored ? <Tag label="UNCENSORED" selected tone="accent" /> : <Tag label="STANDARD" />}
                      {isSelected ? <Tag label="ACTIVE" selected /> : null}
                    </View>
                  </View>

                  {/* Model Spec Details */}
                  <View style={s.modelMeta}>
                    <Text variant="small" tone="muted">
                      Default Steps: {manifest.defaultSteps} | Max: {manifest.maxSteps} | License:{' '}
                      {manifest.licenseName}
                    </Text>
                    {manifest.hfRepo ? (
                      <Text variant="small" tone="muted">
                        Repo: {manifest.hfRepo}
                      </Text>
                    ) : null}
                    {manifest.knownLimitations && manifest.knownLimitations.length > 0 ? (
                      <Text variant="small" tone="muted">
                        Note: {manifest.knownLimitations[0]}
                      </Text>
                    ) : null}
                  </View>

                  <Divider />

                  {/* Actions & Status */}
                  <View style={s.modelActionRow}>
                    {isDownloading ? (
                      <View style={{ flex: 1, gap: 6 }}>
                        <View style={s.downloadProgressInfo}>
                          <Text variant="small" tone="accent">
                            Downloading: {state.progressPercent}%
                          </Text>
                          <Text variant="small" tone="muted">
                            {formatSpeed(state.speedBps)} · {formatBytes(state.bytesWritten)} /{' '}
                            {formatBytes(state.totalBytes)}
                          </Text>
                        </View>
                        <ProgressBar fraction={state.progressPercent / 100} />
                        <View style={{ marginTop: 4 }}>
                          <Button
                            label="Cancel Download"
                            variant="danger"
                            onPress={() => cancelImageModelDownload(manifest.modelId)}
                          />
                        </View>
                      </View>
                    ) : isInstalled ? (
                      <View style={s.installedActions}>
                        <Button
                          label={isSelected ? 'Selected Active' : 'Select Model'}
                          variant={isSelected ? 'quiet' : 'primary'}
                          disabled={isSelected}
                          onPress={() => {
                            setSelectedModelId(manifest.modelId);
                            showToast(`Active image model set to ${manifest.displayName}.`);
                          }}
                        />
                        <Button
                          label="Delete"
                          variant="quiet"
                          onPress={() => handleDeleteModel(manifest)}
                        />
                      </View>
                    ) : (
                      <View style={s.notInstalledActions}>
                        <Button
                          label={`Install (${formatBytes(manifest.downloadSizeBytes)})`}
                          variant="primary"
                          onPress={() => handleDownloadModel(manifest)}
                        />
                      </View>
                    )}
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: GALLERY (SAVED VAULT IMAGES)                                      */}
      {/* ========================================================================= */}
      {tab === 'gallery' && (
        <View style={s.tabContent}>
          <Text tone="muted">
            All synthesized images are securely stored in your private vault (<Text tone="text">/vault/gallery/</Text>).
          </Text>

          {gallery.length === 0 ? (
            <Card style={s.card}>
              <Text variant="body" tone="muted" style={{ textAlign: 'center', paddingVertical: 20 }}>
                No images generated yet. Go to Studio tab to create your first image!
              </Text>
              <Button label="Go to Studio" variant="primary" onPress={() => setTab('generate')} />
            </Card>
          ) : (
            <View style={s.galleryGrid}>
              {gallery.map((item) => (
                <Card key={item.imageId} style={s.galleryCard}>
                  <Image source={{ uri: item.absolutePath }} style={s.galleryImage} resizeMode="cover" />
                  <View style={s.galleryInfo}>
                    <Text variant="strong" numberOfLines={2}>
                      {item.prompt}
                    </Text>
                    <Text variant="small" tone="muted">
                      {item.width}x{item.height} · {item.format.toUpperCase()} · {item.qualityMode} ·{' '}
                      {new Date(item.createdAt).toLocaleDateString()}
                    </Text>

                    <View style={s.galleryButtonRow}>
                      <Button
                        label="Download"
                        variant="primary"
                        onPress={() => handleSaveToDevice(item)}
                      />
                      <Button label="Share" variant="quiet" onPress={() => handleShare(item)} />
                      <Button
                        label="Use Prompt"
                        variant="quiet"
                        onPress={() => {
                          setPrompt(item.prompt);
                          setTab('generate');
                        }}
                      />
                      <Button
                        label="Delete"
                        variant="quiet"
                        onPress={() => deleteGalleryImage(item.imageId)}
                      />
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>
      )}
    </Screen>
  );
}

const useStyles = makeStyles(({ space, colors, line }) => ({
  tabBarContainer: {
    marginBottom: space.md,
  },
  tabContent: {
    gap: space.md,
    paddingBottom: space.xl,
  },
  section: {
    gap: space.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  suggestionScroll: {
    gap: space.sm,
    paddingVertical: 2,
  },
  suggestionChip: {
    paddingHorizontal: space.sm,
    paddingVertical: 6,
    borderWidth: line,
    maxWidth: 240,
  },
  card: {
    padding: space.md,
    gap: space.xs,
  },
  modelBanner: {
    padding: space.md,
    gap: space.sm,
    borderWidth: line,
    borderColor: colors.accent,
  },
  modelBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  modelBannerTitleContainer: {
    flex: 1,
    marginRight: space.xs,
  },
  modelBannerTitle: {
    flexShrink: 1,
  },
  modelBannerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
  },
  modelBannerSub: {
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  modelBadgeRow: {
    flexDirection: 'row',
    gap: space.xs,
  },
  modelMeta: {
    gap: 2,
  },
  modelActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  installedActions: {
    flexDirection: 'row',
    gap: space.sm,
    flex: 1,
  },
  notInstalledActions: {
    flex: 1,
  },
  downloadProgressInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelList: {
    gap: space.md,
  },
  modelItemCard: {
    padding: space.md,
    gap: space.sm,
  },
  bold: {
    fontWeight: '600',
  },
  input: {
    minHeight: 80,
    borderWidth: line,
    padding: space.sm,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  inputSmall: {
    minHeight: 52,
    borderWidth: line,
    padding: space.sm,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  inputSingle: {
    minHeight: 40,
    borderWidth: line,
    paddingHorizontal: space.sm,
    fontSize: 14,
  },
  seedRow: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  actionSection: {
    marginTop: space.sm,
    marginBottom: space.sm,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  galleryGrid: {
    gap: space.md,
  },
  galleryCard: {
    padding: space.sm,
    gap: space.sm,
  },
  previewImage: {
    width: '100%',
    height: 260,
    backgroundColor: colors.surfaceAlt,
  },
  galleryImage: {
    width: '100%',
    height: 220,
    backgroundColor: colors.surfaceAlt,
  },
  galleryInfo: {
    gap: space.xs,
  },
  resultActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
  galleryButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
}));
