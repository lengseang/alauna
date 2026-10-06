/** GGUF files start with the 4 ASCII bytes "GGUF". Cheap check against HTML error pages / truncated junk. */
export function hasGgufMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x47 && bytes[2] === 0x55 && bytes[3] === 0x46;
}
