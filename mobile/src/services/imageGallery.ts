/**
 * Local Image Gallery & Metadata Storage (pure service).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §9.3
 * Manages atomic persistence of generated images, local metadata indexing,
 * favorite toggles, and explicit asset deletion.
 * Stores outputs in app-private vault storage (<vault>/gallery/).
 */

import { useSyncExternalStore } from 'react';
import { NativeModules, Platform, Share } from 'react-native';
import { File } from 'expo-file-system';
import type { ImageAssetMetadata } from '../core/imageGen/types.ts';
import { uriToPath } from '../core/paths.ts';
import { readWithFallback, writeAtomic } from '../core/atomicFile.ts';
import { createStore } from '../core/store.ts';
import { directoryIO } from './atomicIo.ts';
import { galleryDir, isStorageReady } from './storage.ts';
import { showToast } from './toast.ts';

const GALLERY_INDEX_FILE = 'chiwiwi_gallery.json';

interface GalleryState {
  images: ImageAssetMetadata[];
  loaded: boolean;
}

const galleryStore = createStore<GalleryState>({
  images: [],
  loaded: false,
});

const galleryIO = () => directoryIO(galleryDir);

export async function initGallery(force = false): Promise<void> {
  if (!isStorageReady()) return;
  if (!force && galleryStore.getState().loaded) return;
  try {
    const images = await readWithFallback(
      galleryIO(),
      GALLERY_INDEX_FILE,
      (text) => {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? (parsed as ImageAssetMetadata[]) : [];
      },
    );
    galleryStore.setState({ images: images ?? [], loaded: true });
  } catch {
    galleryStore.setState({ images: [], loaded: true });
  }
}

async function persistGallery(images: ImageAssetMetadata[]): Promise<void> {
  if (!isStorageReady()) return;
  try {
    await writeAtomic(galleryIO(), GALLERY_INDEX_FILE, JSON.stringify(images, null, 2));
  } catch (e) {
    // Non-fatal persistence error
  }
}

export async function saveGalleryImage(
  meta: Omit<ImageAssetMetadata, 'storageKey' | 'absolutePath'>,
  imageDataBase64: string,
): Promise<ImageAssetMetadata> {
  const { file, fileName } = prepareGalleryFile(meta);
  file.create();
  file.write(imageDataBase64, { encoding: 'base64' });
  return indexGalleryFile(meta, file, fileName);
}

/** Move an image a diffusion engine already wrote (its own PNG file) into the gallery and index it. */
export async function importGalleryImage(
  meta: Omit<ImageAssetMetadata, 'storageKey' | 'absolutePath' | 'fileSizeBytes'>,
  sourceUri: string,
): Promise<ImageAssetMetadata> {
  const { file, fileName } = prepareGalleryFile(meta);
  new File(sourceUri).copy(file);
  return indexGalleryFile({ ...meta, fileSizeBytes: file.size ?? 0 }, file, fileName);
}

function prepareGalleryFile(meta: { imageId: string; format: string }): { file: File; fileName: string } {
  if (!isStorageReady()) throw new Error('Storage is not ready.');
  const dir = galleryDir();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  const fileName = `${meta.imageId}.${meta.format}`;
  const file = new File(dir, fileName);
  if (file.exists) file.delete();
  return { file, fileName };
}

async function indexGalleryFile(
  meta: Omit<ImageAssetMetadata, 'storageKey' | 'absolutePath'>,
  file: File,
  fileName: string,
): Promise<ImageAssetMetadata> {
  const fullMeta: ImageAssetMetadata = {
    ...meta,
    storageKey: `gallery/${fileName}`,
    absolutePath: file.uri,
  };

  const current = galleryStore.getState().images;
  const updated = [fullMeta, ...current];
  galleryStore.setState({ images: updated });
  await persistGallery(updated);

  return fullMeta;
}

export async function deleteGalleryImage(imageId: string): Promise<void> {
  const current = galleryStore.getState().images;
  const target = current.find((img) => img.imageId === imageId);

  if (target) {
    try {
      const file = new File(galleryDir(), `${target.imageId}.${target.format}`);
      if (file.exists) file.delete();
    } catch {
      // Ignore file removal error
    }
  }

  const updated = current.filter((img) => img.imageId !== imageId);
  galleryStore.setState({ images: updated });
  await persistGallery(updated);
}

export async function toggleFavoriteImage(imageId: string): Promise<void> {
  const current = galleryStore.getState().images;
  const updated = current.map((img) =>
    img.imageId === imageId ? { ...img, favorite: !img.favorite } : img,
  );
  galleryStore.setState({ images: updated });
  await persistGallery(updated);
}

export function getGalleryImages(): ImageAssetMetadata[] {
  return galleryStore.getState().images;
}

export function useGallery(): ImageAssetMetadata[] {
  return useSyncExternalStore(
    galleryStore.subscribe,
    () => galleryStore.getState().images,
    () => [],
  );
}

/** Export and download generated image to the device's public storage or gallery. */
export async function downloadImageToDevice(item: ImageAssetMetadata): Promise<boolean> {
  try {
    const sourceFile = new File(galleryDir(), `${item.imageId}.${item.format}`);
    if (!sourceFile.exists) {
      showToast('Source image file not found in vault.');
      return false;
    }

    const DiffusionModule = (NativeModules as Record<string, any>)?.DiffusionModule;
    if (Platform.OS === 'android' && DiffusionModule?.saveToGallery) {
      const rawPath = uriToPath(sourceFile.uri);
      await DiffusionModule.saveToGallery(rawPath);
      showToast('Saved to Pictures/Chiwiwi in device gallery!', 4000);
      return true;
    }

    await Share.share({
      title: item.prompt || 'Chiwiwi Image',
      url: sourceFile.uri,
    });
    showToast('Image shared for saving.');
    return true;
  } catch (err) {
    showToast(`Failed to export image: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Open system share sheet for the generated image. */
export async function shareImage(item: ImageAssetMetadata): Promise<void> {
  try {
    const sourceFile = new File(galleryDir(), `${item.imageId}.${item.format}`);
    if (!sourceFile.exists) {
      showToast('Image file not found.');
      return;
    }

    const DiffusionModule = (NativeModules as Record<string, any>)?.DiffusionModule;
    if (Platform.OS === 'android' && DiffusionModule?.shareImage) {
      const rawPath = uriToPath(sourceFile.uri);
      await DiffusionModule.shareImage(rawPath);
      return;
    }

    await Share.share({
      title: item.prompt || 'Chiwiwi Generated Image',
      url: sourceFile.uri,
    });
  } catch {
    // Share cancellation is normal
  }
}

