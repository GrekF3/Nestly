/** Refuse common metadata containers so a public listing photo cannot reveal GPS coordinates. */
export function hasPrivateMetadata(mime: string, bytes: Uint8Array): boolean {
  if (mime === "image/jpeg") {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 0xff) return true;
      const marker = bytes[offset + 1];
      if (marker === 0xda) return false; // Start of scan; remainder is compressed image data.
      if (marker === 0xe1 || marker === 0xed || marker === 0xfe) return true;
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2 || offset + 2 + length > bytes.length) return true;
      offset += 2 + length;
    }
    return true;
  }
  if (mime === "image/png") {
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
      const length = view.getUint32(0);
      if (offset + 12 + length > bytes.length) return true;
      const kind = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
      if (["tEXt", "iTXt", "zTXt", "eXIf"].includes(kind)) return true;
      if (kind === "IEND") return false;
      offset += 12 + length;
    }
    return true;
  }
  if (mime === "image/webp") {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = new TextDecoder().decode(bytes.subarray(offset, offset + 4));
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 4, 4).getUint32(0, true);
      if (kind === "EXIF" || kind === "XMP ") return true;
      if (offset + 8 + length > bytes.length) return true;
      offset += 8 + length + (length % 2);
    }
    return offset !== bytes.length;
  }
  return true;
}
