import React, { useState } from 'react';
import { Linking } from 'react-native';
import { getModel } from '../core/catalog.ts';
import { pickDocuments, pickPhotos, takePhoto, type AttachResult, type PickedAttachment } from '../services/attachments.ts';
import { modelHasVision } from '../services/engine.ts';
import { expectExternalActivity } from '../services/security.ts';
import { useSettings } from '../services/settings.ts';
import { showToast } from '../services/toast.ts';
import { Button } from './Button';
import { Notice } from './Notice';
import { ListRow } from './Row';
import { Sheet } from './Sheet';

interface Props {
  visible: boolean;
  onClose: () => void;
  onPicked: (items: PickedAttachment[]) => void;
  /** How many more attachments fit in this message. */
  room: number;
}

/**
 * Camera / Photos / Files (services/attachments.ts does the real work: permission at the moment of use, copies into
 * the vault, refuses PDFs and binaries with a reason). Says up front when the chosen model cannot see images.
 */
export function AttachSheet({ visible, onClose, onPicked, room }: Props) {
  const settings = useSettings();
  const spec = getModel(settings.activeModelId);
  const vision = !!spec && modelHasVision(spec);
  const [failure, setFailure] = useState<{ message: string; settings: boolean } | null>(null);

  const run = async (pick: () => Promise<AttachResult>) => {
    setFailure(null);
    const r = await pick();
    if (!r.ok) {
      if (r.reason !== 'cancelled') setFailure({ message: r.message, settings: !!r.canOpenSettings });
      return;
    }
    if (r.skipped.length) showToast(r.skipped.map((x) => x.message).join('\n'), 6000);
    if (r.attachments.length) {
      onPicked(r.attachments);
      onClose();
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Attach">
      {!vision ? (
        <Notice tone="quiet">
          {spec
            ? `${spec.name} cannot see images. Photos stay attached but only a vision model (one with an image add-on) can read them. Text files work with any model.`
            : 'No model chosen yet. Text files work with any model; images need a vision model.'}
        </Notice>
      ) : null}
      {failure ? (
        <Notice
          tone="danger"
          action={
            failure.settings ? (
              <Button
                label="Open app settings"
                variant="quiet"
                onPress={() => {
                  expectExternalActivity();
                  return Linking.openSettings();
                }}
              />
            ) : undefined
          }
        >
          {failure.message}
        </Notice>
      ) : null}
      <ListRow icon="camera" title="Camera" subtitle="Take a photo" onPress={() => void run(takePhoto)} disabled={room < 1} />
      <ListRow icon="image" title="Photos" subtitle={`Pick up to ${Math.max(0, room)} from your gallery`} onPress={() => void run(() => pickPhotos(room))} disabled={room < 1} />
      <ListRow icon="file" title="Files" subtitle="Plain text, Markdown, CSV, JSON, code" onPress={() => void run(() => pickDocuments(room))} disabled={room < 1} />
    </Sheet>
  );
}
