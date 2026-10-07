import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAndroidSafUri } from '../src/services/storageUtils.ts';

test('parseAndroidSafUri correctly decodes SAF tree primary URIs to POSIX paths', () => {
  const safUri = 'content://com.android.externalstorage.documents/tree/primary%3AAi/';
  const result = parseAndroidSafUri(safUri);
  assert.equal(result.realPath, '/storage/emulated/0/Ai');
  assert.equal(result.displayLabel, 'Internal Storage / Ai');
});

test('parseAndroidSafUri handles nested subfolders and raw paths', () => {
  const safNested = 'content://com.android.externalstorage.documents/tree/primary%3ADownload%2FChiwiwi/';
  const result = parseAndroidSafUri(safNested);
  assert.equal(result.realPath, '/storage/emulated/0/Download/Chiwiwi');
  assert.equal(result.displayLabel, 'Internal Storage / Download/Chiwiwi');
});

test('parseAndroidSafUri handles root primary volume', () => {
  const safRoot = 'content://com.android.externalstorage.documents/tree/primary%3A';
  const result = parseAndroidSafUri(safRoot);
  assert.equal(result.realPath, '/storage/emulated/0');
  assert.equal(result.displayLabel, 'Internal Storage (Root)');
});

test('parseAndroidSafUri leaves standard file URIs and paths intact', () => {
  const fileUri = 'file:///data/user/0/com.chiwiwi.sovereign/files/vault';
  const result = parseAndroidSafUri(fileUri);
  assert.equal(result.realPath, '/data/user/0/com.chiwiwi.sovereign/files/vault');
});
