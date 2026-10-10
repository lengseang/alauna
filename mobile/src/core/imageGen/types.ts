/**
 * Local Image Generation Types & Domain Models (pure core).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001
 * Architecture specification for on-device, adaptive, multi-stage image generation.
 */

// ------------------------------------------------------------------ Generation Request

export type GenerationGoal =
  | 'portrait'
  | 'character'
  | 'landscape'
  | 'product'
  | 'illustration'
  | 'abstract'
  | 'general';

export type QualityMode = 'fast' | 'balanced' | 'quality' | 'adaptive';

export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

export type OutputSizeTier = 'small' | 'medium' | 'large';

export type RefinementPolicy = 'never' | 'if-beneficial' | 'requested';

export interface GenerationRequest {
  requestVersion: 1;
  prompt: string;
  goal: GenerationGoal;
  qualityMode: QualityMode;
  modelId?: string;
  aspectRatio: AspectRatio;
  outputSize?: OutputSizeTier;
  seed?: number;
  negativePrompt?: string;
  referenceImageId?: string;
  refinementPolicy: RefinementPolicy;
}

// ------------------------------------------------------------------ Generation Status & Job

export type GenerationStatus =
  | 'queued'
  | 'validating'
  | 'planning'
  | 'loading_model'
  | 'generating_draft'
  | 'refining'
  | 'upscaling'
  | 'saving'
  | 'completed'
  | 'cancel_pending'
  | 'cancelled'
  | 'failed'
  | 'interrupted';

export interface PlanSummary {
  selectedResolution: string;
  selectedSteps: number;
  selectedProfile: string;
  refinementEnabled: boolean;
  upscaleEnabled: boolean;
  rationale: string[];
}

export interface GenerationJob {
  jobId: string;
  createdAt: number;
  updatedAt: number;
  status: GenerationStatus;
  request: GenerationRequest;
  modelId?: string;
  modelVersion?: string;
  planSummary?: PlanSummary;
  progressPercent?: number;
  currentStageDescription?: string;
  outputImageId?: string;
  outputImagePath?: string;
  errorCode?: ImageGenerationErrorCode;
  errorMessage?: string;
  recoveryAction?: string;
}

// ------------------------------------------------------------------ Scene Plan (§5.3)

export interface SceneSubject {
  description: string;
  attributes: string[];
  priority: number;
}

export interface SceneEnvironment {
  location?: string;
  details: string[];
}

export interface SceneComposition {
  framing: 'close-up' | 'medium shot' | 'wide shot' | 'establishing' | 'macro';
  cameraAngle: 'eye level' | 'low angle' | 'high angle' | 'top-down' | 'dutch angle';
  subjectPlacement?: string;
}

export interface SceneLighting {
  type: string;
  mood: string;
}

export interface SceneStyle {
  family: string;
  strength: 'subtle' | 'moderate' | 'dominant';
}

export interface SceneConstraints {
  mustInclude: string[];
  avoid: string[];
}

export interface ScenePlan {
  schemaVersion: 1;
  userPrompt: string;
  goal: GenerationGoal;
  subject: SceneSubject[];
  environment: SceneEnvironment;
  composition: SceneComposition;
  lighting: SceneLighting;
  style: SceneStyle;
  constraints: SceneConstraints;
}

// ------------------------------------------------------------------ Adaptive Planner (§5.4)

export interface DeviceResourceState {
  totalRamBytes: number;
  availableRamBytes?: number;
  thermalState: 'nominal' | 'fair' | 'serious' | 'critical';
  batteryLevel?: number; // 0..1
  isLowPowerMode?: boolean;
}

export interface GenerationPlan {
  modelId: string;
  runtimeId: string;
  resolution: { width: number; height: number };
  aspectRatio: AspectRatio;
  steps: number;
  guidanceScale: number;
  scheduler: string;
  precision: string;
  batchSize: number; // default 1
  useDraftThenRefine: boolean;
  allowRefinement: boolean;
  allowUpscale: boolean;
  riskTier: 'low' | 'moderate' | 'high';
  explanation: string[];
  prompt?: string;
  seed?: number;
  goal?: GenerationGoal;
  qualityMode?: QualityMode;
}

// ------------------------------------------------------------------ Model Capability Registry (§5.5)

export type ModelPlatform = 'android' | 'ios';

export interface ModelFeatures {
  negativePrompt: boolean;
  imageToImage: boolean;
  inpainting: boolean;
  lora: boolean;
  controlConditioning: boolean;
  upscaler: boolean;
  seedControl: boolean;
}

export interface ImageModelManifest {
  schemaVersion: 1;
  modelId: string;
  displayName: string;
  version: string;
  modelFamily: 'stable-diffusion' | 'sd-turbo' | 'flux' | 'bksdm' | 'custom';
  platforms: ModelPlatform[];
  runtimeId: 'sd-cpp' | 'coreml' | 'mediapipe' | 'onnx';
  supportedTasks: Array<'text-to-image' | 'image-to-image' | 'inpainting'>;
  supportedAspectRatios: AspectRatio[];
  supportedResolutions: Array<{ label: string; width: number; height: number }>;
  defaultSteps: number;
  maxSteps: number;
  features: ModelFeatures;
  precision: string;
  minimumRamBytes: number;
  minimumAppVersion: string;
  licenseName: string;
  licenseUrl: string | null;
  sha256: string;
  downloadSizeBytes: number;
  contentPolicy: 'standard' | 'uncensored' | 'heretic';
  packageFormat?: 'all-in-one' | 'modular-unet';
  hfRepo?: string;
  hfFile?: string;
  tags?: string[];
  qualifiedDeviceClasses: string[];
  knownLimitations: string[];
}

// ------------------------------------------------------------------ Content Preferences (§8)

export interface ModelContentPreferences {
  schemaVersion: 1;
  modelId: string;
  modelVersion: string;
  artisticMatureThemes: 'permit' | 'filter' | 'ask';
  violenceInFiction: 'permit' | 'filter' | 'ask';
  profanity: 'permit' | 'filter';
  romanticThemes: 'permit' | 'filter';
  updatedAt: number;
}

// ------------------------------------------------------------------ Image Asset Metadata (§9.3)

export interface ImageAssetMetadata {
  imageId: string;
  storageKey: string;
  absolutePath: string;
  createdAt: number;
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
  modelId: string;
  modelVersion: string;
  prompt: string;
  seed?: number;
  goal: GenerationGoal;
  qualityMode: QualityMode;
  favorite: boolean;
  fileSizeBytes: number;
  checksumSha256?: string;
}

// ------------------------------------------------------------------ Typed Errors (§7.5)

export type ImageGenerationErrorCode =
  | 'MODEL_NOT_INSTALLED'
  | 'MODEL_INCOMPATIBLE'
  | 'MODEL_VERIFICATION_FAILED'
  | 'MODEL_LOAD_FAILED'
  | 'INSUFFICIENT_STORAGE'
  | 'RESOURCE_BUDGET_EXCEEDED'
  | 'THERMAL_LIMIT'
  | 'CANCELLED'
  | 'RUNTIME_UNSUPPORTED_FEATURE'
  | 'OUTPUT_DECODE_FAILED'
  | 'OUTPUT_SAVE_FAILED'
  | 'PERMISSION_DENIED'
  | 'INTERRUPTED'
  | 'UNKNOWN_RUNTIME_ERROR';

export interface ImageGenerationError {
  code: ImageGenerationErrorCode;
  message: string;
  recoveryAction: string;
  recoverable: boolean;
}

// ------------------------------------------------------------------ Local diffusion engine contract

export interface LocalDiffusionParams {
  prompt: string;
  negative?: string;
  steps: number;
  width: number;
  height: number;
  seed?: number;
  /** Classifier-free guidance scale. */
  cfg: number;
}

/**
 * What a real on-device diffusion engine (stable-diffusion.cpp bridge, ONNX, Core ML...) must implement to be linked
 * into Image Studio. `onProgress` is called by the engine with its real step counter; nothing in the app invents steps.
 * `generate` resolves with the file path of the PNG the engine wrote.
 */
export interface LocalDiffusionEngine {
  load(modelPath: string): Promise<void>;
  generate(
    params: LocalDiffusionParams,
    onProgress: (step: number, totalSteps: number) => void,
    signal?: AbortSignal,
  ): Promise<string>;
  release(): Promise<void>;
}
