import React, { useEffect, useState } from 'react';
import { Image, TextInput, View } from 'react-native';
import { makeStyles, useTheme } from '../../theme';
import type {
  AspectRatio,
  GenerationGoal,
  GenerationJob,
  GenerationRequest,
  QualityMode,
} from '../../core/imageGen/types.ts';
import { IMAGE_MODEL_MANIFESTS } from '../../core/imageGen/modelRegistry.ts';
import { imageCoordinator } from '../../core/imageGen/coordinator.ts';
import { nativeImageRuntime } from '../../services/imageRuntime.ts';
import { deleteGalleryImage, useGallery } from '../../services/imageGallery.ts';
import { showToast } from '../../services/toast.ts';
import { Button } from '../Button';
import { Card } from '../Card';
import { goBack } from '../nav';
import { Notice } from '../Notice';
import { ProgressBar } from '../ProgressBar';
import { Screen } from '../Screen';
import { Segmented } from '../Segmented';
import { Tag } from '../Tag';
import { Text } from '../Text';

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
  { value: '1:1', label: '1:1' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
];

export function ImageStudioScreen() {
  const s = useStyles();
  const { colors } = useTheme();
  const gallery = useGallery();

  // Inputs
  const [prompt, setPrompt] = useState('');
  const [goal, setGoal] = useState<GenerationGoal>('general');
  const [qualityMode, setQualityMode] = useState<QualityMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [selectedModelId, setSelectedModelId] = useState<string>(IMAGE_MODEL_MANIFESTS[0].modelId);

  // Active Job State
  const [job, setJob] = useState<GenerationJob | null>(imageCoordinator.getActiveJob());

  useEffect(() => {
    return imageCoordinator.subscribe((updatedJob) => {
      setJob(updatedJob);
    });
  }, []);

  const selectedManifest = IMAGE_MODEL_MANIFESTS.find((m) => m.modelId === selectedModelId) ?? IMAGE_MODEL_MANIFESTS[0];
  const isBusy = job ? ['validating', 'planning', 'loading_model', 'generating_draft', 'refining', 'upscaling', 'saving'].includes(job.status) : false;

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      showToast('Please enter an image prompt first.');
      return;
    }

    const request: GenerationRequest = {
      requestVersion: 1,
      prompt: prompt.trim(),
      goal,
      qualityMode,
      modelId: selectedModelId,
      aspectRatio,
      refinementPolicy: 'if-beneficial',
    };

    // Device resources (12GB RAM for S23 Ultra baseline, nominal thermals)
    const deviceState = {
      totalRamBytes: 12 * 1024 * 1024 * 1024,
      thermalState: 'nominal' as const,
    };

    try {
      await imageCoordinator.submitRequest(request, deviceState, async (plan, onProgress) => {
        return await nativeImageRuntime.generate(plan, onProgress);
      });
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCancel = () => {
    imageCoordinator.requestCancellation();
  };

  return (
    <Screen title="Image Studio" onBack={goBack} scroll>
      <Text tone="muted">
        Synthesize high-fidelity images completely on-device. Zero cloud telemetry, private, and offline.
      </Text>

      {/* Prompt Entry */}
      <View style={s.section}>
        <Text variant="label">PROMPT</Text>
        <Card style={s.card}>
          <TextInput
            multiline
            numberOfLines={3}
            placeholder="Describe what you want to imagine..."
            placeholderTextColor={colors.muted}
            value={prompt}
            onChangeText={setPrompt}
            style={[s.input, { color: colors.text, borderColor: colors.border }]}
            editable={!isBusy}
          />
        </Card>
      </View>

      {/* Goal Presets */}
      <View style={s.section}>
        <Text variant="label">COMPOSITION GOAL</Text>
        <View style={s.chipsRow}>
          {GOALS.map((g) => (
            <Tag
              key={g.id}
              label={g.label}
              selected={goal === g.id}
              onPress={() => !isBusy && setGoal(g.id)}
            />
          ))}
        </View>
      </View>

      {/* Quality Mode */}
      <View style={s.section}>
        <Text variant="label">QUALITY MODE</Text>
        <Segmented
          label="Quality Mode"
          options={[
            { value: 'fast', label: 'Fast Draft' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'quality', label: 'Quality' },
            { value: 'adaptive', label: 'Adaptive' },
          ]}
          value={qualityMode}
          onChange={(v) => !isBusy && setQualityMode(v)}
          disabled={isBusy}
        />
      </View>

      {/* Aspect Ratio */}
      <View style={s.section}>
        <Text variant="label">ASPECT RATIO</Text>
        <Segmented
          label="Aspect Ratio"
          options={ASPECT_RATIOS}
          value={aspectRatio}
          onChange={(v) => !isBusy && setAspectRatio(v)}
          disabled={isBusy}
        />
      </View>

      {/* Model Selection */}
      <View style={s.section}>
        <View style={s.headerRow}>
          <Text variant="label">LOCAL DIFFUSION MODEL</Text>
        </View>
        <View style={s.chipsRow}>
          {IMAGE_MODEL_MANIFESTS.map((m) => {
            const isUncensored = m.contentPolicy === 'uncensored' || m.contentPolicy === 'heretic';
            const label = isUncensored ? `🔥 ${m.displayName}` : m.displayName;
            return (
              <Tag
                key={m.modelId}
                label={label}
                selected={selectedModelId === m.modelId}
                onPress={() => !isBusy && setSelectedModelId(m.modelId)}
              />
            );
          })}
        </View>
        <Card style={s.card}>
          <View style={s.modelHeader}>
            <Text variant="body" style={s.bold}>
              {selectedManifest.displayName}
            </Text>
            {selectedManifest.contentPolicy === 'uncensored' ? (
              <Tag label="UNCENSORED" selected />
            ) : (
              <Tag label="STANDARD" />
            )}
          </View>
          <Text variant="small" tone="muted">
            Architecture: {selectedManifest.modelFamily} | Precision: {selectedManifest.precision} | Steps: {selectedManifest.defaultSteps}
          </Text>
          <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
            Size: {(selectedManifest.downloadSizeBytes / 1e9).toFixed(2)} GB | License: {selectedManifest.licenseName}
          </Text>
          {selectedManifest.hfRepo ? (
            <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
              Hugging Face: {selectedManifest.hfRepo}
            </Text>
          ) : null}
          {selectedManifest.tags && selectedManifest.tags.length > 0 ? (
            <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
              Tags: {selectedManifest.tags.join(' • ')}
            </Text>
          ) : null}
        </Card>
      </View>

      {/* Live Job Progress / Status */}
      {job && job.status !== 'completed' && (
        <View style={s.section}>
          <Text variant="label">INFERENCE PROGRESS</Text>
          <Card style={s.card}>
            <Text variant="body" style={s.bold}>
              Status: {job.status.toUpperCase().replace('_', ' ')}
            </Text>
            {job.currentStageDescription ? (
              <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                {job.currentStageDescription}
              </Text>
            ) : null}

            {job.progressPercent !== undefined ? (
              <View style={{ marginTop: 8 }}>
                <ProgressBar fraction={job.progressPercent / 100} />
              </View>
            ) : null}

            {isBusy ? (
              <View style={{ marginTop: 12 }}>
                <Button label="Cancel Generation" variant="danger" onPress={handleCancel} />
              </View>
            ) : null}

            {job.status === 'failed' && (
              <View style={{ marginTop: 8 }}>
                <Notice tone="danger" title={job.errorCode ?? 'Error'}>
                  {job.errorMessage ?? 'Generation failed.'}
                </Notice>
              </View>
            )}
          </Card>
        </View>
      )}

      {/* Action Button */}
      <View style={s.actionSection}>
        <Button
          label={isBusy ? 'Generating...' : 'Generate Image'}
          variant="primary"
          onPress={handleGenerate}
          disabled={isBusy}
        />
      </View>

      {/* Local Gallery Section */}
      <View style={s.section}>
        <Text variant="label">LOCAL GALLERY ({gallery.length})</Text>
        {gallery.length === 0 ? (
          <Card style={s.card}>
            <Text variant="small" tone="muted">
              No images generated yet. Your created images will be saved privately in your vault.
            </Text>
          </Card>
        ) : (
          <View style={s.galleryGrid}>
            {gallery.map((item) => (
              <Card key={item.imageId} style={s.galleryCard}>
                <Image source={{ uri: item.absolutePath }} style={s.galleryImage} resizeMode="cover" />
                <View style={s.galleryInfo}>
                  <Text variant="small" numberOfLines={1} style={s.bold}>
                    {item.prompt}
                  </Text>
                  <Text variant="small" tone="muted">
                    {item.width}x{item.height} • {item.qualityMode}
                  </Text>
                  <View style={{ marginTop: 4 }}>
                    <Button
                      label="Delete"
                      variant="text"
                      onPress={() => deleteGalleryImage(item.imageId)}
                    />
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(({ space, colors, line }) => ({
  section: {
    gap: space.sm,
    marginTop: space.md,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  card: {
    padding: space.md,
    gap: space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bold: {
    fontWeight: '600',
  },
  input: {
    minHeight: 72,
    borderWidth: line,
    padding: space.sm,
    textAlignVertical: 'top',
    fontSize: 14,
  },
  actionSection: {
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  galleryGrid: {
    gap: space.md,
  },
  galleryCard: {
    padding: space.sm,
    gap: space.sm,
  },
  galleryImage: {
    width: '100%',
    height: 240,
    backgroundColor: colors.surfaceAlt,
  },
  galleryInfo: {
    gap: 2,
  },
}));
