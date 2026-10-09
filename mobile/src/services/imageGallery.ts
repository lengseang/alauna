/**
 * Local Image Gallery & Metadata Storage (pure service).
 *
 * Feature ID: CHIWIWI-IMG-ARCH-001 §9.3
 * Manages atomic persistence of generated images, local metadata indexing,
 * favorite toggles, and explicit asset deletion.
 * Stores outputs in app-private vault storage (<vault>/gallery/).
 */

import { useSyncExternalStore } from 'react';
import { Platform, Share } from 'react-native';
import { File } from 'expo-file-system';
import type { ImageAssetMetadata } from '../core/imageGen/types.ts';
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
  if (!isStorageReady()) throw new Error('Storage is not ready.');

  const dir = galleryDir();
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });

  const fileName = `${meta.imageId}.${meta.format}`;
  const file = new File(dir, fileName);

  if (file.exists) file.delete();
  file.create();
  file.write(imageDataBase64, { encoding: 'base64' });

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

    let savedDirect = false;
    if (Platform.OS === 'android') {
      const publicDownloadPath = `/storage/emulated/0/Download/chiwiwi_${item.imageId}.${item.format}`;
      try {
        const dest = new File(publicDownloadPath);
        if (dest.exists) dest.delete();
        sourceFile.copy(dest);
        savedDirect = true;
        showToast(`Saved to Download/chiwiwi_${item.imageId}.${item.format}!`, 5000);
      } catch {
        // Fall back to system share dialog
      }
    }

    if (!savedDirect) {
      await Share.share({
        title: item.prompt || 'Chiwiwi Image',
        url: sourceFile.uri,
      });
      showToast('Image ready for download/saving.');
    }
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
    await Share.share({
      title: item.prompt || 'Chiwiwi Generated Image',
      url: sourceFile.uri,
    });
  } catch {
    // Share cancellation is normal
  }
}

