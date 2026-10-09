/**
 * Pure TypeScript PNG Synthesizer.
 * Creates valid, standards-compliant PNG images with custom dimensions, gradients,
 * and artistic noise patterns derived deterministically from the prompt and seed.
 * Requires zero native dependencies or canvas modules.
 */

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[n]) & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD_ADLER = 65521;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * Creates an uncompressed deflate stream (type 0: uncompressed blocks).
 */
function createDeflateStream(data: Uint8Array): Uint8Array {
  const maxBlockSize = 65535;
  const numBlocks = Math.ceil(data.length / maxBlockSize) || 1;
  const totalLength = 2 + data.length + numBlocks * 5 + 4;
  const output = new Uint8Array(totalLength);

  // zlib header (CMF = 0x78, FLG = 0x01)
  output[0] = 0x78;
  output[1] = 0x01;

  let outPos = 2;
  let inPos = 0;

  for (let b = 0; b < numBlocks; b++) {
    const isLast = b === numBlocks - 1;
    const blockSize = Math.min(maxBlockSize, data.length - inPos);

    output[outPos++] = isLast ? 0x01 : 0x00;
    output[outPos++] = blockSize & 0xff;
    output[outPos++] = (blockSize >> 8) & 0xff;
    const nlen = ~blockSize & 0xffff;
    output[outPos++] = nlen & 0xff;
    output[outPos++] = (nlen >> 8) & 0xff;

    output.set(data.subarray(inPos, inPos + blockSize), outPos);
    outPos += blockSize;
    inPos += blockSize;
  }

  // Adler32 checksum
  const adler = adler32(data);
  output[outPos++] = (adler >> 24) & 0xff;
  output[outPos++] = (adler >> 16) & 0xff;
  output[outPos++] = (adler >> 8) & 0xff;
  output[outPos++] = adler & 0xff;

  return output.subarray(0, outPos);
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const length = data.length;
  const chunk = new Uint8Array(8 + length + 4);
  const view = new DataView(chunk.buffer);

  view.setUint32(0, length, false);
  chunk[4] = type.charCodeAt(0);
  chunk[5] = type.charCodeAt(1);
  chunk[6] = type.charCodeAt(2);
  chunk[7] = type.charCodeAt(3);
  chunk.set(data, 8);

  const crcData = chunk.subarray(4, 8 + length);
  const crcVal = crc32(crcData);
  view.setUint32(8 + length, crcVal, false);

  return chunk;
}

/**
 * Generates an artistic raw PNG image based on prompt tokens, seed, and resolution.
 */
export function synthesizeScenePngBase64(
  width: number,
  height: number,
  prompt: string,
  seed = 42,
): string {
  // Clamp width and height for reasonable preview generation (e.g. 256x256 or 512x512)
  const w = Math.min(512, Math.max(128, width));
  const h = Math.min(512, Math.max(128, height));

  // Determine palette seeds from prompt hash
  let hash = seed;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }

  const rBase = (hash & 0xff);
  const gBase = ((hash >> 8) & 0xff);
  const bBase = ((hash >> 16) & 0xff);

  // Raw pixel buffer with filter byte (0 = None) per scanline: 1 + w * 4 bytes per row (RGBA)
  const rowBytes = 1 + w * 4;
  const rawData = new Uint8Array(rowBytes * h);

  for (let y = 0; y < h; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter: 0 (None)

    const yNorm = y / h;
    for (let x = 0; x < w; x++) {
      const xNorm = x / w;
      const pixelOffset = rowOffset + 1 + x * 4;

      // Atmospheric radial gradient + noise wave
      const distFromCenter = Math.sqrt((xNorm - 0.5) ** 2 + (yNorm - 0.5) ** 2);
      const wave = Math.sin(xNorm * 12 + yNorm * 8 + (hash % 10)) * 20;

      const r = Math.min(255, Math.max(20, Math.round(rBase * (1 - distFromCenter * 0.6) + wave)));
      const g = Math.min(255, Math.max(20, Math.round(gBase * (0.8 + yNorm * 0.4) - wave * 0.5)));
      const b = Math.min(255, Math.max(30, Math.round(bBase * (0.6 + xNorm * 0.5) + distFromCenter * 40)));

      rawData[pixelOffset] = r;
      rawData[pixelOffset + 1] = g;
      rawData[pixelOffset + 2] = b;
      rawData[pixelOffset + 3] = 255; // Alpha
    }
  }

  // 1. Signature
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // 2. IHDR Chunk
  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, w, false);
  ihdrView.setUint32(4, h, false);
  ihdrData[8] = 8; // bit depth: 8
  ihdrData[9] = 6; // color type: 6 (RGBA)
  ihdrData[10] = 0; // compression: 0
  ihdrData[11] = 0; // filter: 0
  ihdrData[12] = 0; // interlace: 0
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // 3. IDAT Chunk (zlib compressed)
  const compressedData = createDeflateStream(rawData);
  const idatChunk = createChunk('IDAT', compressedData);

  // 4. IEND Chunk
  const iendChunk = createChunk('IEND', new Uint8Array(0));

  // Assemble full PNG
  const totalLength = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length;
  const fullPng = new Uint8Array(totalLength);
  let pos = 0;

  fullPng.set(signature, pos);
  pos += signature.length;
  fullPng.set(ihdrChunk, pos);
  pos += ihdrChunk.length;
  fullPng.set(idatChunk, pos);
  pos += idatChunk.length;
  fullPng.set(iendChunk, pos);

  // Convert to Base64 in chunks to prevent call-stack overflow
  let binary = '';
  const len = fullPng.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const slice = fullPng.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(slice));
  }

  return btoa(binary);
}
